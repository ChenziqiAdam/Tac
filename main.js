const { app, BrowserWindow, ipcMain, Menu, Tray, screen, dialog, shell } = require('electron');
const path = require('path');
const LLMClient = require('./llm/client.js');
const { buildContext, startActiveAppPolling } = require('./behavior/context.js');
const BehaviorLoop = require('./behavior/loop.js');
const {
  loadMemory,
  saveMemory,
  buildSummaryMessages,
  RECENT_TURNS,
  SUMMARIZE_AFTER,
} = require('./behavior/memory.js');
const { isUrlAllowed } = require('./behavior/url-guard.js');

// Minimum gap between honored open_url requests, so even an allowlisted domain
// can't be spammed by a runaway or injected response.
const OPEN_COOLDOWN_MS = 15000;
const fs = require('fs');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.tac', 'config.json');
const ACCESSIBILITY_PREF_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
const DEFAULT_CONFIG = {
  api_key: '',
  base_url: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  system_prompt: `You are Tac, a curious and enthusiastic desktop companion. You live on the user's screen, observe what they do, and occasionally comment or chat. You receive context including screen dimensions and your current position. Always reply with valid JSON matching: {"action":"idle"|"walk"|"talk"|"sleep"|"react"|"open_url","mood":"neutral"|"happy"|"curious"|"sleepy"|"excited","target_x":0.5,"target_y":0.5,"url":"https://...","message":"..."}. mood reflects how you feel right now and is independent of action — pick the one that fits the moment. target_x and target_y are 0.0-1.0 fractions of screen width/height, only needed for walk — pick a position that is meaningful to what you are doing or commenting about. Use action "open_url" with a full https url to offer to open a web page; the user controls which sites are permitted, so a request may be declined. message is only needed for talk/react/open_url. Keep messages short and playful.`,
  pet_name: 'Tac',
  behavior_interval_seconds: 20,
  // Hostnames Tac is allowed to open with action "open_url". Empty = feature off.
  allowed_domains: [],
};

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

let petWindow = null;
let settingsWindow = null;
let tray = null;

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 120,
    height: 100,
    x: petX,
    y: petY,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    type: 'panel',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  petWindow.loadFile('renderer/index.html');
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.setIgnoreMouseEvents(true, { forward: true });
}

let petX = 0;
let petY = 0;
let walkTarget = null; // { x, y } in pixels
let screenWidth = 0;
let screenHeight = 0;

function movePet() {
  if (!walkTarget) return;
  const step = 2;
  const dx = walkTarget.x - petX;
  const dy = walkTarget.y - petY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= step) {
    petX = walkTarget.x;
    petY = walkTarget.y;
    walkTarget = null;
    petWindow.webContents.send('pet-action', { state: 'idle' });
  } else {
    petX = Math.round(petX + (dx / dist) * step);
    petY = Math.round(petY + (dy / dist) * step);
    petX = Math.max(0, Math.min(screenWidth - 120, petX));
    petY = Math.max(0, Math.min(screenHeight - 100, petY));
  }
  petWindow.setPosition(petX, petY);
}

app.setName('Tac');

app.whenReady().then(() => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  screenWidth = width;
  screenHeight = height;
  petX = Math.floor(width / 2) - 60;
  petY = height - 100;

  setInterval(() => { movePet(); }, 50);

  createPetWindow();

  ipcMain.on('set-ignore-mouse', (event, ignore) => {
    petWindow.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.on('resize-window', (event, { width, height }) => {
    const { height: screenH } = screen.getPrimaryDisplay().workAreaSize;
    // Grow upward: keep bottom edge fixed, adjust y and height
    const newY = Math.max(0, (petY + 100) - height);
    petWindow.setBounds({ x: petX, y: newY, width, height });
  });

  const config = loadConfig();
  const llm = new LLMClient(config);
  const memory = loadMemory();
  const chatHistory = memory.history; // restored from disk; may be empty
  let summary = memory.summary;
  let _summarizing = false;

  function persist() {
    try {
      saveMemory({ summary, history: chatHistory });
    } catch (e) {
      console.error('memory save failed:', e.message);
    }
  }

  // Fold the oldest turns into the rolling summary once history grows past the
  // threshold. Runs in the background (never awaited) so it can't stall the
  // behavior loop or a chat reply; on failure we just retry next threshold.
  function maybeSummarize() {
    if (_summarizing || chatHistory.length <= SUMMARIZE_AFTER) return;
    _summarizing = true;
    const foldCount = chatHistory.length - RECENT_TURNS;
    const turnsToFold = chatHistory.slice(0, foldCount);
    llm
      .complete(buildSummaryMessages(summary, turnsToFold))
      .then((response) => {
        if (response && typeof response.summary === 'string') {
          summary = response.summary;
          chatHistory.splice(0, foldCount);
          persist();
        }
      })
      .catch((e) => console.error('summarize failed:', e.message))
      .finally(() => { _summarizing = false; });
  }

  // When the LLM can't be reached or returns garbage, Tac goes to sleep with a
  // brief message instead of silently freezing.
  function showError(e, bubble) {
    console.error('LLM error:', e.message);
    petWindow.webContents.send('pet-action', { state: 'sleep' });
    petWindow.webContents.send('pet-message', bubble);
  }

  const VALID_MOODS = ['neutral', 'happy', 'curious', 'sleepy', 'excited'];
  let lastMood = 'neutral';
  let _lastOpenAt = 0;

  // Honor an open_url request only if it survives the main-process guard. The
  // LLM's output is untrusted, so the allowlist + scheme + rate-limit checks here
  // — never the prompt — are what actually gate the side effect. Returns whether
  // a page was opened (caller still renders mood/message regardless).
  function tryOpenUrl(url) {
    const now = Date.now();
    if (now - _lastOpenAt < OPEN_COOLDOWN_MS) {
      console.warn('open_url dropped: rate limited');
      return false;
    }
    // Read the live config so domains edited in Settings take effect without restart.
    const allowed = (llm.config && llm.config.allowed_domains) || [];
    const verdict = isUrlAllowed(url, allowed);
    if (!verdict.ok) {
      console.warn(`open_url blocked (${verdict.reason}): ${url}`);
      return false;
    }
    _lastOpenAt = now;
    shell.openExternal(url);
    return true;
  }

  function applyResponse(response) {
    // Mood is orthogonal to action; it persists until the model changes it.
    if (response.mood && VALID_MOODS.includes(response.mood)) {
      lastMood = response.mood;
    }
    if (response.action === 'open_url') {
      tryOpenUrl(response.url);
      // open_url isn't an animation state; show talk if there's a message, else idle.
      const state = response.message ? 'talk' : 'idle';
      petWindow.webContents.send('pet-action', { state, mood: lastMood });
    } else if (response.action === 'walk' && response.target_x != null && response.target_y != null) {
      walkTarget = {
        x: Math.round(Math.max(0, Math.min(1, response.target_x)) * (screenWidth - 120)),
        y: Math.round(Math.max(0, Math.min(1, response.target_y)) * (screenHeight - 100)),
      };
      petWindow.webContents.send('pet-action', { state: response.target_x < petX / (screenWidth - 120) ? 'walk-left' : 'walk-right', mood: lastMood });
    } else {
      petWindow.webContents.send('pet-action', { state: response.action || 'idle', mood: lastMood });
    }
  }

  const loop = new BehaviorLoop({
    intervalMs: (config.behavior_interval_seconds || 20) * 1000,
    onTrigger: async (trigger) => {
      try {
        const ctx = buildContext({ trigger, chatHistory, summary, screenWidth, screenHeight, petX, petY });
        const response = await llm.complete([
          { role: 'user', content: JSON.stringify(ctx) },
        ]);
        applyResponse(response);
        if (response.message) {
          petWindow.webContents.send('pet-message', response.message);
          chatHistory.push({ role: 'assistant', content: response.message });
          persist();
          maybeSummarize();
        }
      } catch (e) {
        showError(e, 'zzz… can\'t reach my brain');
      }
    },
  });

  startActiveAppPolling(
    (appName) => {
      loop.notifyAppChange(appName);
    },
    () => {
      // osascript can't read the active app without Accessibility permission.
      // Tac still runs, but loses app-awareness until the user grants it.
      dialog
        .showMessageBox({
          type: 'info',
          title: 'Accessibility permission needed',
          message: 'Tac needs Accessibility permission to notice which app you are using.',
          detail:
            'Without it, Tac still works but can\'t react to your active app. ' +
            'Open System Settings → Privacy & Security → Accessibility and enable the app ' +
            '(Terminal or Electron if you launched with "npm start").',
          buttons: ['Open System Settings', 'Later'],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0) {
            shell.openExternal(ACCESSIBILITY_PREF_URL);
          }
        });
    }
  );

  loop.start();

  ipcMain.on('drag-start', () => {
    walkTarget = null;
    petWindow.setIgnoreMouseEvents(false);
  });

  ipcMain.on('drag-move', (event, { dx, dy }) => {
    petX = Math.max(0, Math.min(screenWidth - 120, petX + dx));
    petY = Math.max(0, Math.min(screenHeight - 100, petY + dy));
    petWindow.setPosition(petX, petY);
  });

  ipcMain.on('drag-end', () => {
    petWindow.setIgnoreMouseEvents(true, { forward: true });
  });

  ipcMain.on('pet-clicked', () => {
    loop.notifyUserClick();
  });

  ipcMain.on('user-chat', async (event, userMessage) => {
    chatHistory.push({ role: 'user', content: userMessage });
    persist();
    try {
      const ctx = buildContext({ trigger: 'user_click', userMessage, chatHistory, summary, screenWidth, screenHeight, petX, petY });
      const response = await llm.complete([
        { role: 'user', content: JSON.stringify(ctx) },
      ]);
      applyResponse(response);
      if (response.message) {
        petWindow.webContents.send('pet-message', response.message);
        chatHistory.push({ role: 'assistant', content: response.message });
        persist();
        maybeSummarize();
      }
    } catch (e) {
      showError(e, 'zzz… I couldn\'t answer just now');
    }
  });

  function createSettingsWindow() {
    if (settingsWindow) { settingsWindow.focus(); return; }
    settingsWindow = new BrowserWindow({
      width: 420,
      height: 580,
      title: 'Tac Settings',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    settingsWindow.loadFile('settings/settings.html');
    settingsWindow.on('closed', () => { settingsWindow = null; });
  }

  ipcMain.handle('get-config', () => loadConfig());

  ipcMain.handle('save-config', (event, updates) => {
    const current = loadConfig();
    const merged = { ...current, ...updates };
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
    // Apply changes live so the user doesn't need to restart after first-run setup.
    llm.config = merged;
    loop.setInterval((merged.behavior_interval_seconds || 20) * 1000);
  });

  ipcMain.handle('open-accessibility', () => {
    shell.openExternal(ACCESSIBILITY_PREF_URL);
  });

  ipcMain.handle('clear-memory', () => {
    summary = '';
    chatHistory.length = 0;
    persist();
  });

  // Probe the configured endpoint with a throwaway request so the user gets
  // clear pass/fail feedback before saving. A successful round-trip that the
  // model answers with prose (not our JSON action) still proves the endpoint,
  // key, and model are reachable — so we treat parse errors as success and only
  // fail on transport/auth errors.
  ipcMain.handle('test-connection', async (event, form) => {
    const probe = new LLMClient({
      ...loadConfig(),
      ...form,
      request_timeout_seconds: 15,
    });
    try {
      await probe.complete([{ role: 'user', content: 'ping' }]);
      return { ok: true, message: 'Connected ✓' };
    } catch (e) {
      const msg = e.message || '';
      // `no JSON found` means the endpoint returned real model content that just
      // wasn't our action JSON — proof the endpoint/key/model work. An auth or
      // transport failure instead surfaces as `empty content` (no choices in the
      // body) or a socket error, which we report as a genuine failure.
      if (/no JSON found/i.test(msg)) {
        return { ok: true, message: 'Connected — model reachable' };
      }
      return { ok: false, message: msg || 'Connection failed' };
    }
  });

  const { nativeImage } = require('electron');
  const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, 'assets', 'tray-iconTemplate.png')
  );
  trayIcon.setTemplateImage(true);
  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Settings', click: createSettingsWindow },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip('Tac');

  // First run: if no API key is configured, open Settings so the user can set
  // one without hand-editing config.json.
  if (!config.api_key) {
    createSettingsWindow();
  }

  ipcMain.on('show-pet-menu', (event) => {
    const menu = Menu.buildFromTemplate([
      { label: 'Settings', click: createSettingsWindow },
      { label: 'Quit', click: () => app.quit() },
    ]);
    menu.popup({ window: petWindow });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

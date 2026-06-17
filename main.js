const { app, BrowserWindow, ipcMain, Menu, Tray, screen } = require('electron');
const path = require('path');
const LLMClient = require('./llm/client.js');
const { buildContext, startActiveAppPolling } = require('./behavior/context.js');
const BehaviorLoop = require('./behavior/loop.js');
const fs = require('fs');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.tac', 'config.json');
const DEFAULT_CONFIG = {
  api_key: '',
  base_url: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  system_prompt: `You are Tac, a curious and enthusiastic desktop companion. You live on the user's screen, observe what they do, and occasionally comment or chat. You receive context including screen dimensions and your current position. Always reply with valid JSON matching: {"action":"idle"|"walk"|"talk"|"sleep"|"react","target_x":0.5,"target_y":0.5,"message":"..."}. target_x and target_y are 0.0-1.0 fractions of screen width/height, only needed for walk — pick a position that is meaningful to what you are doing or commenting about. message is only needed for talk/react. Keep messages short and playful.`,
  pet_name: 'Tac',
  behavior_interval_seconds: 20,
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
  const chatHistory = [];

  function applyResponse(response) {
    if (response.action === 'walk' && response.target_x != null && response.target_y != null) {
      walkTarget = {
        x: Math.round(Math.max(0, Math.min(1, response.target_x)) * (screenWidth - 120)),
        y: Math.round(Math.max(0, Math.min(1, response.target_y)) * (screenHeight - 100)),
      };
      petWindow.webContents.send('pet-action', { state: response.target_x < petX / (screenWidth - 120) ? 'walk-left' : 'walk-right' });
    } else {
      petWindow.webContents.send('pet-action', { state: response.action || 'idle' });
    }
  }

  const loop = new BehaviorLoop({
    intervalMs: (config.behavior_interval_seconds || 20) * 1000,
    onTrigger: async (trigger) => {
      try {
        const ctx = buildContext({ trigger, chatHistory, screenWidth, screenHeight, petX, petY });
        const response = await llm.complete([
          { role: 'user', content: JSON.stringify(ctx) },
        ]);
        applyResponse(response);
        if (response.message) {
          petWindow.webContents.send('pet-message', response.message);
          chatHistory.push({ role: 'assistant', content: response.message });
          if (chatHistory.length > 20) chatHistory.splice(0, chatHistory.length - 20);
        }
      } catch (e) {
        console.error('LLM error:', e.message);
      }
    },
  });

  startActiveAppPolling((appName) => {
    loop.notifyAppChange(appName);
  });

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
    try {
      const ctx = buildContext({ trigger: 'user_click', userMessage, chatHistory, screenWidth, screenHeight, petX, petY });
      const response = await llm.complete([
        { role: 'user', content: JSON.stringify(ctx) },
      ]);
      applyResponse(response);
      if (response.message) {
        petWindow.webContents.send('pet-message', response.message);
        chatHistory.push({ role: 'assistant', content: response.message });
      }
    } catch (e) {
      console.error('LLM chat error:', e.message);
    }
  });

  function createSettingsWindow() {
    if (settingsWindow) { settingsWindow.focus(); return; }
    settingsWindow = new BrowserWindow({
      width: 420,
      height: 580,
      title: 'Tac Settings',
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

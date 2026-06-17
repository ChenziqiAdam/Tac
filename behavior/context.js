const { exec } = require('child_process');

let _cachedApp = { appName: 'Unknown', windowTitle: '' };

const OSASCRIPT = `osascript -e '
  tell application "System Events"
    set frontApp to name of first application process whose frontmost is true
    set frontTitle to ""
    try
      set frontTitle to name of front window of application process frontApp
    end try
    return frontApp & "|" & frontTitle
  end tell
'`;

function startActiveAppPolling(onChange) {
  let lastAppName = null;

  setInterval(() => {
    exec(OSASCRIPT, { timeout: 2000 }, (err, stdout) => {
      if (err) return;
      const [appName, windowTitle] = stdout.trim().split('|');
      _cachedApp = { appName: appName || 'Unknown', windowTitle: windowTitle || '' };
      if (onChange && appName !== lastAppName) {
        lastAppName = appName;
        onChange(appName);
      }
    });
  }, 2000);
}

function getActiveApp() {
  return _cachedApp;
}

function buildContext({ trigger, userMessage, chatHistory, screenWidth, screenHeight, petX, petY }) {
  const { appName, windowTitle } = getActiveApp();
  const now = new Date();
  const timeOfDay = now.toTimeString().slice(0, 5);
  return {
    active_app: appName,
    window_title: windowTitle,
    time_of_day: timeOfDay,
    recent_chat: chatHistory.slice(-6),
    trigger,
    screen: { width: screenWidth || 1920, height: screenHeight || 1080 },
    pet_position: { x: petX || 0, y: petY || 0 },
    ...(userMessage ? { user_message: userMessage } : {}),
  };
}

module.exports = { buildContext, getActiveApp, startActiveAppPolling };

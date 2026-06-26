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

// macOS returns these when the controlling process lacks Accessibility
// permission. We only want to surface this once, not on every poll.
function isPermissionError(err) {
  const msg = `${err.message || ''} ${err.stderr || ''}`.toLowerCase();
  return (
    msg.includes('not allowed') ||
    msg.includes('assistive access') ||
    msg.includes('-1719') ||
    msg.includes('-25211')
  );
}

function startActiveAppPolling(onChange, onPermissionError) {
  let lastAppName = null;
  let permissionErrorReported = false;

  setInterval(() => {
    exec(OSASCRIPT, { timeout: 2000 }, (err, stdout, stderr) => {
      if (err) {
        if (!permissionErrorReported && isPermissionError({ ...err, stderr })) {
          permissionErrorReported = true;
          if (onPermissionError) onPermissionError();
        }
        return;
      }
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

function buildContext({ trigger, userMessage, chatHistory, summary, screenWidth, screenHeight, petX, petY }) {
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
    ...(summary ? { memory_summary: summary } : {}),
    ...(userMessage ? { user_message: userMessage } : {}),
  };
}

module.exports = { buildContext, getActiveApp, startActiveAppPolling };

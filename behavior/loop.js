const COOLDOWN_MS = 10000;

class BehaviorLoop {
  constructor({ intervalMs, onTrigger }) {
    this.intervalMs = intervalMs;
    this.onTrigger = onTrigger;
    this._lastTriggerTime = {};
    this._timerHandle = null;
    this._lastAppName = null;
    this._processing = false;
  }

  start() {
    this._timerHandle = setInterval(() => {
      this._fire('timer');
    }, this.intervalMs);
  }

  stop() {
    if (this._timerHandle) clearInterval(this._timerHandle);
  }

  setInterval(intervalMs) {
    if (intervalMs === this.intervalMs) return;
    this.intervalMs = intervalMs;
    if (this._timerHandle) {
      clearInterval(this._timerHandle);
      this.start();
    }
  }

  notifyAppChange(appName) {
    if (appName === this._lastAppName) return;
    this._lastAppName = appName;
    this._fire('app_change');
  }

  notifyUserClick() {
    this._fire('user_click');
  }

  async _fire(trigger) {
    if (this._processing) return;
    const now = Date.now();
    const last = this._lastTriggerTime[trigger] || 0;
    if (trigger !== 'timer' && now - last < COOLDOWN_MS) return;
    this._lastTriggerTime[trigger] = now;
    this._processing = true;
    try {
      await this.onTrigger(trigger);
    } finally {
      this._processing = false;
    }
  }
}

module.exports = BehaviorLoop;

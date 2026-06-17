const VALID_STATES = ['idle', 'walk-left', 'walk-right', 'talk', 'sleep', 'react', 'falling', 'landed'];

const TRANSIENT = {
  'talk': 6000,
  'react': 2000,
  'sleep': null,
  'landed': 700,
};

class StateMachine {
  constructor(onStateChange) {
    this.state = 'idle';
    this.onStateChange = onStateChange;
    this._transientTimer = null;
  }

  transition(newState) {
    if (!VALID_STATES.includes(newState)) return;
    if (this._transientTimer) {
      clearTimeout(this._transientTimer);
      this._transientTimer = null;
    }
    this.state = newState;
    this.onStateChange(newState);

    const duration = TRANSIENT[newState];
    if (duration !== undefined && duration !== null) {
      this._transientTimer = setTimeout(() => {
        this.transition('idle');
      }, duration);
    }
  }
}

module.exports = StateMachine;

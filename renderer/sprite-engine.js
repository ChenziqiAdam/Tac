// Mood → translucent rgba tint painted over the sprite's opaque pixels.
// neutral has no tint. Alpha kept low so the pixel art still reads clearly.
const MOODS = {
  neutral: null,
  happy: 'rgba(255, 205, 90, 0.16)',
  curious: 'rgba(120, 180, 255, 0.16)',
  sleepy: 'rgba(150, 130, 200, 0.20)',
  excited: 'rgba(255, 140, 60, 0.18)',
};

class SpriteEngine {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.sheets = {};
    this.currentState = 'idle';
    this.currentFrame = 0;
    this.fps = 4;
    this.lastFrameTime = 0;
    this.tint = null;
  }

  setMood(mood) {
    this.tint = Object.prototype.hasOwnProperty.call(MOODS, mood) ? MOODS[mood] : null;
  }

  async loadAll(states) {
    const loads = states.map(state => this._loadSheet(state));
    await Promise.all(loads);
  }

  _loadSheet(state) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const frameH = img.height;
        const frameW = frameH;
        const frameCount = Math.round(img.width / frameW);
        this.sheets[state] = { img, frameCount, frameW, frameH };
        resolve();
      };
      img.onerror = reject;
      img.src = `../assets/sprites/${state}.png`;
    });
  }

  setState(state) {
    if (state === this.currentState) return;
    if (!this.sheets[state]) return;
    this.currentState = state;
    this.currentFrame = 0;
  }

  draw(timestamp) {
    const sheet = this.sheets[this.currentState];
    if (!sheet) return;

    const interval = 1000 / this.fps;
    if (timestamp - this.lastFrameTime >= interval) {
      this.currentFrame = (this.currentFrame + 1) % sheet.frameCount;
      this.lastFrameTime = timestamp;
    }

    // Crop transparent padding: content occupies roughly x=28–100, y=4–124 within each 128x128 frame
    const padX = 28, padY = 4, cropW = 72, cropH = 120;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(
      sheet.img,
      this.currentFrame * sheet.frameW + padX, padY,
      cropW, cropH,
      0, 0,
      this.canvas.width, this.canvas.height
    );

    // Mood tint: recolor only the sprite's opaque pixels, leaving the
    // transparent background (and the mouse-passthrough hit test) untouched.
    if (this.tint) {
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'source-atop';
      this.ctx.fillStyle = this.tint;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }
  }
}

module.exports = SpriteEngine;
module.exports.MOODS = MOODS;

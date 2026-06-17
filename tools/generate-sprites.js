const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// Clawd — the Claude Code pet.
// A small round blob creature: cream/peach body, Anthropic-orange tuft on top,
// two dot eyes, tiny feet. Drawn on a 32x32 logical grid scaled by PIXEL_SIZE.

const PIXEL_SIZE = 4;
const GRID_W = 32;
const GRID_H = 32;
const FRAME_W = PIXEL_SIZE * GRID_W;
const FRAME_H = PIXEL_SIZE * GRID_H;

// ─── PALETTE ────────────────────────────────────────────────────────────────
const O = '#3a2415'; // outline (dark warm brown)
const D = '#c98a5c'; // body deep shadow
const M = '#e9b079'; // body mid
const L = '#f6d3a8'; // body main (cream-peach)
const H = '#fce8cb'; // body highlight
const R = '#ffffff'; // specular / eye shine
const T = '#d97757'; // Anthropic orange (tuft / accent)
const T2 = '#b8553a'; // tuft shadow
const T3 = '#f0a07a'; // tuft highlight
const K = '#1b1208'; // eye black
const P = '#ffb4a0'; // cheek blush
const Y = '#fff2b8'; // Z / sparkle warm
const G = '#7a5a3a'; // foot shadow
const _ = null;

// ─── HELPERS ────────────────────────────────────────────────────────────────
function blank() {
  return Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null));
}
function put(frame, row, col, color) {
  if (row < 0 || row >= GRID_H || col < 0 || col >= GRID_W) return;
  frame[row][col] = color;
}
function drawRect(frame, r0, c0, r1, c1, color) {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(frame, r, c, color);
}
function mirrorFrame(frame) {
  return frame.map(row => [...row].reverse());
}

// ─── GROUND SHADOW ──────────────────────────────────────────────────────────
function drawShadow(frame, row = 29, halfWidth = 9, center = 16) {
  for (let dc = -halfWidth; dc <= halfWidth; dc++) {
    const t = 1 - Math.abs(dc) / halfWidth;
    if (t > 0.15) put(frame, row, center + dc, O);
  }
}

// ─── BLOB BODY ──────────────────────────────────────────────────────────────
// A rounded blob centered horizontally. `top` is the row of the topmost body pixel.
// Body footprint is ~18 wide, ~16 tall. Shape is a stylized circle/egg.
//
//        ░██████░
//       ████████████
//      ██████████████
//      ██████████████
//      ██████████████
//      ██████████████
//      ██████████████
//      ██████████████
//      ██████████████
//      ██████████████
//      ██████████████
//      ██████████████
//       ████████████
//        ████████
//
function drawBody(frame, top) {
  // Outline rows: 0..15 relative
  // Build a soft rounded silhouette by row insets from col 16 (center).
  // Width at each row = how many cells extend either side of center.
  const insets = [
    4, // r+0
    2, // r+1
    1, // r+2
    0, // r+3
    0, // r+4
    0, // r+5
    0, // r+6
    0, // r+7
    0, // r+8
    0, // r+9
    0, // r+10
    0, // r+11
    1, // r+12
    2, // r+13
    4, // r+14
  ];
  const MAX_HALF = 8; // max half-width
  for (let i = 0; i < insets.length; i++) {
    const r = top + i;
    const half = MAX_HALF - insets[i];
    const c0 = 16 - half;
    const c1 = 15 + half;
    // base fill
    drawRect(frame, r, c0, r, c1, L);
  }

  // Shading: right/bottom side mid + deep tones
  for (let i = 0; i < insets.length; i++) {
    const r = top + i;
    const half = MAX_HALF - insets[i];
    const c1 = 15 + half;
    // right shadow column
    put(frame, r, c1, M);
    if (i >= 3 && i <= 12) put(frame, r, c1 - 1, M);
    // bottom band darker
    if (i >= insets.length - 4) {
      const c0 = 16 - half;
      drawRect(frame, r, c0, r, c1, M);
    }
    if (i >= insets.length - 2) {
      const c0 = 16 - half;
      drawRect(frame, r, c0, r, c1, D);
    }
  }

  // Highlight: upper-left arc
  put(frame, top + 1, 14, H);
  put(frame, top + 1, 15, H);
  put(frame, top + 1, 16, H);
  put(frame, top + 2, 12, H);
  put(frame, top + 2, 13, H);
  put(frame, top + 3, 11, H);
  put(frame, top + 4, 10, H);
  put(frame, top + 5, 10, H);
  // small specular dot
  put(frame, top + 2, 14, R);
  put(frame, top + 3, 12, R);

  // Outline around the blob (one-pixel dark border)
  for (let i = 0; i < insets.length; i++) {
    const r = top + i;
    const half = MAX_HALF - insets[i];
    put(frame, r, 16 - half - 1, null); // ensure clean
    // draw outline at the silhouette edge by painting one-step-in cells dark on top edge
  }
  // Top arc outline
  put(frame, top, 12, O); put(frame, top, 13, O); put(frame, top, 18, O); put(frame, top, 19, O);
  drawRect(frame, top, 14, top, 17, O);
  // smooth shoulder corners
  put(frame, top + 1, 11, O); put(frame, top + 1, 20, O);
  put(frame, top + 2, 10, O); put(frame, top + 2, 21, O);
  // left/right side outline
  for (let i = 3; i <= 11; i++) {
    put(frame, top + i, 9, O);
    put(frame, top + i, 22, O);
  }
  // bottom outline
  put(frame, top + 12, 10, O); put(frame, top + 12, 21, O);
  put(frame, top + 13, 11, O); put(frame, top + 13, 20, O);
  put(frame, top + 13, 12, O); put(frame, top + 13, 19, O);
  drawRect(frame, top + 14, 13, top + 14, 18, O);
}

// ─── TUFT (orange hair tuft on top) ─────────────────────────────────────────
// Sits above the head, anchored at center col 16.
function drawTuft(frame, top, wiggle = 0) {
  // Two/three little spikes
  const r = top - 3;
  put(frame, r,     15 + wiggle, T);
  put(frame, r,     16 + wiggle, T);
  put(frame, r + 1, 14 + wiggle, T);
  put(frame, r + 1, 15 + wiggle, T3);
  put(frame, r + 1, 16 + wiggle, T);
  put(frame, r + 1, 17 + wiggle, T2);
  put(frame, r + 2, 13 + wiggle, T);
  put(frame, r + 2, 14 + wiggle, T3);
  put(frame, r + 2, 15 + wiggle, T);
  put(frame, r + 2, 16 + wiggle, T);
  put(frame, r + 2, 17 + wiggle, T2);
  put(frame, r + 2, 18 + wiggle, T2);
}

// ─── EYES + MOUTH ───────────────────────────────────────────────────────────
// `face` ∈ 'open' | 'closed' | 'happy' | 'shock' | 'talk-open'
function drawFace(frame, top, face = 'open') {
  // Eye baseline row sits about 5 rows down from top of body.
  const er = top + 5;
  const leftC = 13, rightC = 19;

  if (face === 'open') {
    // dot eyes (2x2)
    drawRect(frame, er, leftC,  er + 1, leftC + 1,  K);
    drawRect(frame, er, rightC, er + 1, rightC + 1, K);
    // shine
    put(frame, er, leftC + 1,  R);
    put(frame, er, rightC + 1, R);
    // cheek blush
    put(frame, er + 2, 12, P);
    put(frame, er + 2, 20, P);
    // small smile
    put(frame, er + 3, 15, O);
    put(frame, er + 3, 16, O);
    put(frame, er + 2, 14, O);
    put(frame, er + 2, 17, O);
  } else if (face === 'closed') {
    // closed crescents — single line each
    drawRect(frame, er + 1, leftC,  er + 1, leftC + 1,  O);
    drawRect(frame, er + 1, rightC, er + 1, rightC + 1, O);
    put(frame, er, leftC,  O);
    put(frame, er, rightC + 1, O);
    // peaceful tiny mouth
    put(frame, er + 3, 15, O);
    put(frame, er + 3, 16, O);
  } else if (face === 'happy') {
    // ^_^ upturned arcs
    put(frame, er + 1, leftC, O);   put(frame, er, leftC + 1, O);
    put(frame, er + 1, leftC + 2, O);
    put(frame, er + 1, rightC, O);  put(frame, er, rightC + 1, O);
    put(frame, er + 1, rightC + 2, O);
    put(frame, er + 2, 12, P);
    put(frame, er + 2, 20, P);
    // wide smile
    drawRect(frame, er + 3, 14, er + 3, 17, O);
    put(frame, er + 2, 13, O);
    put(frame, er + 2, 18, O);
  } else if (face === 'shock') {
    // big round eyes (3x3) with bright shine
    drawRect(frame, er - 1, leftC - 1, er + 1, leftC + 1, K);
    drawRect(frame, er - 1, rightC,    er + 1, rightC + 2, K);
    put(frame, er - 1, leftC,  R);
    put(frame, er - 1, rightC + 1, R);
    // o mouth
    drawRect(frame, er + 3, 15, er + 4, 16, O);
    put(frame, er + 3, 15, K); put(frame, er + 3, 16, K);
    put(frame, er + 4, 15, K); put(frame, er + 4, 16, K);
  } else if (face === 'talk-open') {
    // open eyes + open mouth
    drawRect(frame, er, leftC,  er + 1, leftC + 1,  K);
    drawRect(frame, er, rightC, er + 1, rightC + 1, K);
    put(frame, er, leftC + 1,  R);
    put(frame, er, rightC + 1, R);
    drawRect(frame, er + 3, 14, er + 4, 17, K);
    put(frame, er + 3, 15, R); // little tongue/teeth shine
  }
}

// ─── FEET ───────────────────────────────────────────────────────────────────
// Tiny stub feet under the blob. `pose` ∈ 'stand' | 'stepL' | 'stepR'
function drawFeet(frame, bodyBottomRow, pose = 'stand') {
  const r = bodyBottomRow + 1;
  if (pose === 'stand') {
    // two little feet
    drawRect(frame, r, 12, r, 14, T);
    put(frame, r, 12, T2);
    drawRect(frame, r, 17, r, 19, T);
    put(frame, r, 19, T2);
    // ground contact
    drawRect(frame, r + 1, 12, r + 1, 14, G);
    drawRect(frame, r + 1, 17, r + 1, 19, G);
  } else if (pose === 'stepL') {
    // left foot lifted (smaller, slightly higher), right foot planted forward
    drawRect(frame, r - 1, 11, r - 1, 13, T);
    put(frame, r - 1, 11, T2);
    drawRect(frame, r,    18, r,    20, T);
    put(frame, r, 20, T2);
    drawRect(frame, r + 1, 18, r + 1, 20, G);
  } else if (pose === 'stepR') {
    // mirror
    drawRect(frame, r - 1, 18, r - 1, 20, T);
    put(frame, r - 1, 20, T2);
    drawRect(frame, r,    11, r,    13, T);
    put(frame, r, 11, T2);
    drawRect(frame, r + 1, 11, r + 1, 13, G);
  }
}

// ─── Z (sleep) ──────────────────────────────────────────────────────────────
function drawZ(frame, row, col) {
  drawRect(frame, row,     col, row,     col + 3, Y);
  put(frame, row + 1, col + 2, Y);
  put(frame, row + 2, col + 1, Y);
  drawRect(frame, row + 3, col, row + 3, col + 3, Y);
  // outline
  put(frame, row - 1, col, O); put(frame, row - 1, col + 3, O);
}

// ─── FRAME ASSEMBLERS ───────────────────────────────────────────────────────
// Body occupies rows top..top+14. Default top = 11 → bottom row 25, feet 26..27,
// shadow row 29. Bobbing reduces `top` by 1.

function makeIdleFrame(bob = 0, face = 'open', wiggle = 0) {
  const f = blank();
  drawShadow(f, 29, bob === 0 ? 9 : 8);
  const top = 11 - bob;
  drawTuft(f, top, wiggle);
  drawBody(f, top);
  drawFace(f, top, face);
  drawFeet(f, top + 14, 'stand');
  return f;
}

function makeWalkFrame(step, bob = 0) {
  const f = blank();
  drawShadow(f, 29, bob === 0 ? 9 : 8);
  const top = 11 - bob;
  drawTuft(f, top, step === 'stepL' ? -1 : (step === 'stepR' ? 1 : 0));
  drawBody(f, top);
  drawFace(f, top, 'open');
  drawFeet(f, top + 14, step);
  return f;
}

function makeTalkFrame(mouth, bob = 0) {
  const f = blank();
  drawShadow(f, 29, 9);
  const top = 11 - bob;
  drawTuft(f, top, 0);
  drawBody(f, top);
  drawFace(f, top, mouth === 'talk-open' ? 'talk-open' : 'open');
  drawFeet(f, top + 14, 'stand');
  return f;
}

function makeSleepFrame(zRow) {
  const f = blank();
  drawShadow(f, 29, 10);
  const top = 12; // sits a touch lower while sleeping
  drawTuft(f, top, 0);
  drawBody(f, top);
  drawFace(f, top, 'closed');
  drawFeet(f, top + 14, 'stand');
  drawZ(f, zRow, 24);
  return f;
}

// Falling/held: body floats higher, no ground shadow, feet dangle,
// tuft & feet sway, mild surprise face. Loops while being dragged.
function makeFallFrame(sway = 0, face = 'shock') {
  const f = blank();
  // No ground shadow — pet is in the air.
  // A faint small shadow far below to show it's airborne.
  drawShadow(f, 31, 4);
  const top = 8; // higher than normal idle (11)
  drawTuft(f, top, sway);
  drawBody(f, top);
  drawFace(f, top, face);
  // Dangling feet (slightly off-center based on sway)
  const r = top + 14 + 2; // a bit lower than usual to look limp
  drawRect(f, r,     12 + sway, r,     14 + sway, T);
  put(f, r, 12 + sway, T2);
  drawRect(f, r,     17 + sway, r,     19 + sway, T);
  put(f, r, 19 + sway, T2);
  // Motion lines on the trailing side
  const trail = sway > 0 ? -1 : 1;
  put(f, top + 4, sway > 0 ? 6 : 25, O);
  put(f, top + 6, sway > 0 ? 5 : 26, O);
  put(f, top + 8, sway > 0 ? 6 : 25, O);
  return f;
}

// Landed: squash pose just after being dropped, then bounces back to idle.
// Body is wider + shorter, feet splayed, dust puff on either side.
function makeLandedFrame(stage = 0) {
  const f = blank();
  drawShadow(f, 29, 11); // wider shadow from impact
  if (stage === 0) {
    // Maximum squash: body sits low, drawn as a flatter ellipse.
    // Render a custom squashed body inline rather than calling drawBody.
    const top = 14;
    drawSquashBody(f, top);
    drawFace(f, top - 2, 'shock');
    // Splayed feet
    drawRect(f, top + 9, 10, top + 9, 12, T);
    put(f, top + 9, 10, T2);
    drawRect(f, top + 9, 19, top + 9, 21, T);
    put(f, top + 9, 21, T2);
    drawRect(f, top + 10, 10, top + 10, 12, G);
    drawRect(f, top + 10, 19, top + 10, 21, G);
    // Dust puffs
    put(f, top + 9, 7, H);  put(f, top + 8, 6, H);
    put(f, top + 9, 24, H); put(f, top + 8, 25, H);
    put(f, top + 7, 5, R);  put(f, top + 7, 26, R);
    // Tuft squashed flat
    put(f, top - 3, 15, T); put(f, top - 3, 16, T);
    put(f, top - 2, 14, T); put(f, top - 2, 15, T3); put(f, top - 2, 16, T); put(f, top - 2, 17, T2);
  } else {
    // Mid-bounce: nearly normal pose with slight crouch
    const top = 12;
    drawTuft(f, top, 0);
    drawBody(f, top);
    drawFace(f, top, 'open');
    drawFeet(f, top + 14, 'stand');
    // Lingering dust
    put(f, top + 14, 7, H);  put(f, top + 14, 24, H);
  }
  return f;
}

// Squashed body: 11 tall instead of 15, wider mid-section.
function drawSquashBody(frame, top) {
  const insets = [
    5, // r+0
    3, // r+1
    1, // r+2 (widest soon)
    0, // r+3
    0, // r+4
    0, // r+5
    0, // r+6
    0, // r+7
    1, // r+8
    3, // r+9
    5, // r+10
  ];
  const MAX_HALF = 10; // wider than normal (8)
  for (let i = 0; i < insets.length; i++) {
    const r = top + i;
    const half = MAX_HALF - insets[i];
    drawRect(frame, r, 16 - half, r, 15 + half, L);
  }
  for (let i = 0; i < insets.length; i++) {
    const r = top + i;
    const half = MAX_HALF - insets[i];
    put(frame, r, 15 + half, M);
    if (i >= insets.length - 3) {
      drawRect(frame, r, 16 - half, r, 15 + half, M);
    }
    if (i >= insets.length - 1) {
      drawRect(frame, r, 16 - half, r, 15 + half, D);
    }
  }
  // Outline: top arc
  put(frame, top, 12, O); put(frame, top, 13, O); put(frame, top, 18, O); put(frame, top, 19, O);
  drawRect(frame, top, 14, top, 17, O);
  put(frame, top + 1, 11, O); put(frame, top + 1, 20, O);
  put(frame, top + 2, 7, O);  put(frame, top + 2, 24, O);
  // Sides
  for (let i = 3; i <= 7; i++) {
    put(frame, top + i, 5, O);
    put(frame, top + i, 26, O);
  }
  // Bottom arc
  put(frame, top + 8, 7, O);  put(frame, top + 8, 24, O);
  put(frame, top + 9, 11, O); put(frame, top + 9, 20, O);
  drawRect(frame, top + 10, 13, top + 10, 18, O);
  put(frame, top + 10, 12, O); put(frame, top + 10, 19, O);
  // Specular
  put(frame, top + 2, 10, H);
  put(frame, top + 3, 8, H);
  put(frame, top + 3, 9, R);
}

function makeReactFrame(intensity = 1) {
  const f = blank();
  drawShadow(f, 29, 9);
  const top = 11;
  drawTuft(f, top, 0);
  drawBody(f, top);
  drawFace(f, top, 'shock');
  drawFeet(f, top + 14, 'stand');
  // Exclamation mark above tuft
  const c = intensity === 1 ? T : T2;
  put(f, 0, 24, c);
  put(f, 1, 24, c);
  put(f, 2, 24, c);
  put(f, 4, 24, c);
  return f;
}

// ─── STATES ─────────────────────────────────────────────────────────────────
const STATES = {
  'idle': [
    makeIdleFrame(0, 'open',  0),
    makeIdleFrame(1, 'open',  0),
    makeIdleFrame(0, 'open',  0),
    makeIdleFrame(0, 'happy', 0),
  ],
  'walk-right': [
    makeWalkFrame('stepL', 0),
    makeWalkFrame('stand', 1),
    makeWalkFrame('stepR', 0),
    makeWalkFrame('stand', 1),
  ],
  'walk-left': null,
  'talk': [
    makeTalkFrame('idle',      0),
    makeTalkFrame('talk-open', 0),
    makeTalkFrame('idle',      1),
    makeTalkFrame('talk-open', 0),
  ],
  'sleep': [
    makeSleepFrame(3),
    makeSleepFrame(2),
    makeSleepFrame(1),
    makeSleepFrame(2),
  ],
  'react': [
    makeReactFrame(1),
    makeReactFrame(0),
  ],
  'falling': [
    makeFallFrame(-1, 'shock'),
    makeFallFrame(0,  'shock'),
    makeFallFrame(1,  'shock'),
    makeFallFrame(0,  'shock'),
  ],
  'landed': [
    makeLandedFrame(0),
    makeLandedFrame(0),
    makeLandedFrame(1),
    makeLandedFrame(1),
  ],
};

STATES['walk-left'] = STATES['walk-right'].map(mirrorFrame);

// ─── RENDER ─────────────────────────────────────────────────────────────────
function renderFrame(ctx, frame, offsetX) {
  for (let row = 0; row < GRID_H; row++) {
    for (let col = 0; col < GRID_W; col++) {
      const color = frame[row][col];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(offsetX + col * PIXEL_SIZE, row * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
      }
    }
  }
}

function generateSpritesheet(stateName, frames) {
  const canvas = createCanvas(FRAME_W * frames.length, FRAME_H);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  frames.forEach((frame, i) => renderFrame(ctx, frame, i * FRAME_W));
  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(__dirname, '..', 'assets', 'sprites', `${stateName}.png`);
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated: ${outPath} (${frames.length} frames, ${canvas.width}x${canvas.height})`);
}

Object.entries(STATES).forEach(([name, frames]) => {
  generateSpritesheet(name, frames);
});

console.log('Done. All spritesheets generated.');

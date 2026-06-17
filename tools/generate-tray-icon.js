const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// Generate a macOS menu-bar template icon for Clawd.
// Template images must be monochrome black + transparent; macOS tints them
// automatically to match the menu bar (light/dark). We produce @1x and @2x.

const SIZE = 22; // logical px — standard macOS menu bar height
const K = '#000000';
const _ = null;

// 22x22 silhouette of Clawd: round blob with little tuft and two feet.
// Rows are y (0 = top). Use a small grid that compresses the full-sprite shape.
function buildPixels() {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

  // tuft (top, 3 spikes)
  g[2][10] = K; g[2][11] = K;
  g[3][9]  = K; g[3][10] = K; g[3][11] = K; g[3][12] = K;
  g[4][9]  = K; g[4][10] = K; g[4][11] = K; g[4][12] = K; g[4][13] = K;

  // body outline (a rounded blob, rows 5..17, cols ~4..17)
  // Row-by-row left/right outline columns:
  const edges = [
    // row, left, right
    [5,  8, 13],
    [6,  6, 15],
    [7,  5, 16],
    [8,  4, 17],
    [9,  4, 17],
    [10, 4, 17],
    [11, 4, 17],
    [12, 4, 17],
    [13, 4, 17],
    [14, 4, 17],
    [15, 5, 16],
    [16, 6, 15],
    [17, 8, 13],
  ];
  for (const [r, l, rt] of edges) {
    g[r][l]  = K;
    g[r][rt] = K;
  }
  // close top + bottom arcs
  for (let c = 9; c <= 12; c++) g[5][c] = K;
  for (let c = 9; c <= 12; c++) g[17][c] = K;

  // eyes (two dots)
  g[10][7] = K; g[10][8] = K;
  g[10][13] = K; g[10][14] = K;
  g[11][7] = K; g[11][14] = K;

  // smile
  g[13][9] = K; g[13][10] = K; g[13][11] = K; g[13][12] = K;
  g[12][8] = K; g[12][13] = K;

  // feet
  g[18][6] = K; g[18][7] = K; g[18][8] = K;
  g[18][13] = K; g[18][14] = K; g[18][15] = K;
  g[19][6] = K; g[19][7] = K; g[19][8] = K;
  g[19][13] = K; g[19][14] = K; g[19][15] = K;

  return g;
}

function renderAt(scale) {
  const pixels = buildPixels();
  const canvas = createCanvas(SIZE * scale, SIZE * scale);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = K;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (pixels[r][c]) {
        ctx.fillRect(c * scale, r * scale, scale, scale);
      }
    }
  }
  return canvas.toBuffer('image/png');
}

const outDir = path.join(__dirname, '..', 'assets');
fs.writeFileSync(path.join(outDir, 'tray-iconTemplate.png'),    renderAt(1));
fs.writeFileSync(path.join(outDir, 'tray-iconTemplate@2x.png'), renderAt(2));
console.log('Generated tray icons:');
console.log('  assets/tray-iconTemplate.png (22x22)');
console.log('  assets/tray-iconTemplate@2x.png (44x44)');

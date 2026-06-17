const { ipcRenderer } = require('electron');
const SpriteEngine = require('./sprite-engine.js');
const StateMachine = require('./state-machine.js');

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 48;
canvas.height = 80;

const sprite = new SpriteEngine(canvas, ctx);
const states = ['idle', 'walk-left', 'walk-right', 'talk', 'sleep', 'react', 'falling', 'landed'];

const sm = new StateMachine((newState) => {
  sprite.setState(newState);
});

sprite.loadAll(states).then(() => {
  sm.transition('idle');

  let lastIgnore = true;
  canvas.addEventListener('mousemove', (e) => {
    const pixel = ctx.getImageData(e.offsetX, e.offsetY, 1, 1).data;
    const isTransparent = pixel[3] < 10;
    if (isTransparent !== lastIgnore) {
      lastIgnore = isTransparent;
      ipcRenderer.send('set-ignore-mouse', isTransparent);
    }
  });

  // click handled below

  requestAnimationFrame(loop);
});

function loop(timestamp) {
  sprite.draw(timestamp);
  requestAnimationFrame(loop);
}

ipcRenderer.on('pet-action', (event, action) => {
  sm.transition(action.state);
});

const bubble = document.getElementById('bubble');
const chatInputWrap = document.getElementById('chat-input-wrap');
const chatInput = document.getElementById('chat-input');
let bubbleTimer = null;

function showBubble(message) {
  chatInputWrap.style.display = 'none';
  bubble.textContent = message;
  bubble.style.display = 'block';
  // Measure after render so offsetHeight includes wrapped text
  requestAnimationFrame(() => {
    const bubbleH = bubble.offsetHeight;
    const totalH = bubbleH + 84 + 16; // 84px gap above sprite bottom + 16px top clearance
    ipcRenderer.send('resize-window', { width: 120, height: Math.max(100, totalH) });
  });
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    bubble.style.display = 'none';
    ipcRenderer.send('resize-window', { width: 120, height: 100 });
  }, 5000);
}

ipcRenderer.on('pet-message', (event, message) => {
  showBubble(message);
});

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragMoved = false;

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  isDragging = true;
  dragMoved = false;
  dragStartX = e.screenX;
  dragStartY = e.screenY;
  ipcRenderer.send('drag-start');
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.screenX - dragStartX;
  const dy = e.screenY - dragStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    if (!dragMoved) {
      dragMoved = true;
      sm.transition('falling');
    }
  }
  if (dragMoved) {
    ipcRenderer.send('drag-move', { dx: e.screenX - dragStartX, dy: e.screenY - dragStartY });
    dragStartX = e.screenX;
    dragStartY = e.screenY;
  }
});

window.addEventListener('mouseup', (e) => {
  if (!isDragging) return;
  isDragging = false;
  ipcRenderer.send('drag-end');
  if (dragMoved) {
    // landed transitions back to idle automatically (transient)
    sm.transition('landed');
  } else {
    // treat as click
    bubble.style.display = 'none';
    chatInputWrap.style.display = 'block';
    chatInput.value = '';
    chatInput.focus();
    ipcRenderer.send('set-ignore-mouse', false);
    ipcRenderer.send('resize-window', { width: 120, height: 116 });
    ipcRenderer.send('pet-clicked');
  }
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const msg = chatInput.value.trim();
    chatInputWrap.style.display = 'none';
    ipcRenderer.send('set-ignore-mouse', true);
    ipcRenderer.send('resize-window', { width: 120, height: 100 });
    if (msg) ipcRenderer.send('user-chat', msg);
  }
  if (e.key === 'Escape') {
    chatInputWrap.style.display = 'none';
    ipcRenderer.send('set-ignore-mouse', true);
    ipcRenderer.send('resize-window', { width: 120, height: 100 });
  }
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  ipcRenderer.send('show-pet-menu');
});

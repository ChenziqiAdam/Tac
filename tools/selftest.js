// Headless self-test for the pure logic of memory, mood, and url-guard.
// Run: node tools/selftest.js   (no Electron / no canvas needed)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('✓', name); pass++; }
  catch (e) { console.log('✗', name, '\n   ', e.message); fail++; }
}

// ── url-guard ────────────────────────────────────────────────────────────────
const { isUrlAllowed, normalizeDomains } = require('../behavior/url-guard.js');
const A = ['github.com', 'WWW.Example.com ', ''];

check('normalize lowercases/strips www/blanks', () =>
  assert.deepStrictEqual(normalizeDomains(A), ['github.com', 'example.com']));
check('exact host allowed', () => assert.strictEqual(isUrlAllowed('https://github.com/x', A).ok, true));
check('subdomain allowed', () => assert.strictEqual(isUrlAllowed('https://gist.github.com', A).ok, true));
check('http allowed', () => assert.strictEqual(isUrlAllowed('http://github.com', A).ok, true));
check('off-list blocked', () => assert.strictEqual(isUrlAllowed('https://evil.test', A).ok, false));
check('lookalike suffix blocked', () => assert.strictEqual(isUrlAllowed('https://notgithub.com', A).ok, false));
check('path-trick blocked', () => assert.strictEqual(isUrlAllowed('https://evil.com/github.com', A).ok, false));
check('userinfo trick blocked', () => assert.strictEqual(isUrlAllowed('https://github.com@evil.test/', A).ok, false));
check('file scheme blocked', () => assert.strictEqual(isUrlAllowed('file:///etc/passwd', A).reason, 'scheme'));
check('javascript scheme blocked', () => assert.strictEqual(isUrlAllowed('javascript:alert(1)', A).reason, 'scheme'));
check('unparseable handled', () => assert.strictEqual(isUrlAllowed('not a url', A).reason, 'unparseable'));
check('null handled', () => assert.strictEqual(isUrlAllowed(null, A).reason, 'unparseable'));
check('empty allowlist blocks all', () => assert.strictEqual(isUrlAllowed('https://github.com', []).ok, false));

// ── mood tint (sprite-engine pure parts) ─────────────────────────────────────
const SpriteEngine = require('../renderer/sprite-engine.js');
const eng = new SpriteEngine({ width: 48, height: 80 }, {});
check('neutral → no tint', () => { eng.setMood('neutral'); assert.strictEqual(eng.tint, null); });
check('happy → tint', () => { eng.setMood('happy'); assert.ok(/rgba/.test(eng.tint)); });
check('unknown mood → no tint', () => { eng.setMood('zzz'); assert.strictEqual(eng.tint, null); });
check('MOODS export has 5 keys', () =>
  assert.deepStrictEqual(Object.keys(SpriteEngine.MOODS).sort(),
    ['curious', 'excited', 'happy', 'neutral', 'sleepy']));

// ── memory load/save (uses a temp path via overriding HOME) ──────────────────
// memory.js reads ~/.tac/memory.json at module-load time for its path constant,
// so we test save/load against the real path but back up any existing file.
const { loadMemory, saveMemory, buildSummaryMessages, RECENT_TURNS, SUMMARIZE_AFTER, MEMORY_PATH } =
  require('../behavior/memory.js');
const hadFile = fs.existsSync(MEMORY_PATH);
const bak = MEMORY_PATH + '.selftest.bak';
if (hadFile) fs.copyFileSync(MEMORY_PATH, bak);
try {
  check('missing/blank → default shape', () => {
    if (fs.existsSync(MEMORY_PATH)) fs.unlinkSync(MEMORY_PATH);
    const m = loadMemory();
    assert.deepStrictEqual(m, { summary: '', history: [] });
  });
  check('save+load round-trips summary', () => {
    saveMemory({ summary: 'hi', history: [{ role: 'user', content: 'a' }] });
    assert.strictEqual(loadMemory().summary, 'hi');
  });
  check('history capped at 40 on save', () => {
    const big = Array.from({ length: 60 }, (_, i) => ({ role: 'user', content: 't' + i }));
    saveMemory({ summary: '', history: big });
    const back = loadMemory();
    assert.strictEqual(back.history.length, 40);
    assert.strictEqual(back.history[0].content, 't20'); // oldest 20 dropped
  });
  check('corrupt file → default', () => {
    fs.writeFileSync(MEMORY_PATH, '{not json');
    assert.deepStrictEqual(loadMemory(), { summary: '', history: [] });
  });
  check('summary prompt asks for {"summary":...} json', () => {
    const msgs = buildSummaryMessages('prev', [{ role: 'user', content: 'a' }]);
    assert.strictEqual(msgs.length, 1);
    assert.ok(/\{"summary":"\.\.\."\}/.test(msgs[0].content));
  });
  check('constants sane (RECENT < SUMMARIZE_AFTER)', () =>
    assert.ok(RECENT_TURNS < SUMMARIZE_AFTER));
} finally {
  if (hadFile) fs.copyFileSync(bak, MEMORY_PATH), fs.unlinkSync(bak);
  else if (fs.existsSync(MEMORY_PATH)) fs.unlinkSync(MEMORY_PATH);
}

// ── summarize fold correctness under concurrent appends ──────────────────────
// Simulates: capture foldCount, then more turns arrive before splice resolves.
check('fold splices oldest even after concurrent appends', () => {
  const history = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: 'old' + i }));
  const foldCount = history.length - RECENT_TURNS; // 22
  // ... async gap: 3 new turns appended at the end ...
  history.push({ role: 'a', content: 'new1' }, { role: 'a', content: 'new2' }, { role: 'a', content: 'new3' });
  history.splice(0, foldCount); // remove oldest 22
  assert.strictEqual(history.length, RECENT_TURNS + 3); // 8 kept + 3 new = 11
  assert.strictEqual(history[0].content, 'old22'); // first kept is old22, not a new one
  assert.strictEqual(history[history.length - 1].content, 'new3');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

const fs = require('fs');
const path = require('path');
const os = require('os');

const MEMORY_PATH = path.join(os.homedir(), '.tac', 'memory.json');

// How many raw conversation turns to keep "hot" and replay after summarization.
const RECENT_TURNS = 8;
// Once stored history exceeds this, fold the oldest turns down into the summary.
const SUMMARIZE_AFTER = 24;
// Hard cap on persisted turns so the file can't grow without bound.
const MAX_STORED_TURNS = 40;

const DEFAULT_MEMORY = { summary: '', history: [] };

function loadMemory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return { ...DEFAULT_MEMORY };
  }
}

function saveMemory({ summary, history }) {
  const trimmed = history.slice(-MAX_STORED_TURNS);
  fs.mkdirSync(path.dirname(MEMORY_PATH), { recursive: true });
  fs.writeFileSync(
    MEMORY_PATH,
    JSON.stringify({ summary: summary || '', history: trimmed }, null, 2)
  );
}

// Build the messages for a summarization call. We ask for a JSON reply
// ({"summary":"..."}) so the existing LLMClient.complete() JSON parser handles it
// without any change to llm/client.js.
function buildSummaryMessages(prevSummary, turnsToFold) {
  const transcript = turnsToFold
    .map((t) => `${t.role === 'user' ? 'User' : 'Tac'}: ${t.content}`)
    .join('\n');
  const instruction =
    'Update your running memory of your relationship and conversation with the user.\n\n' +
    `Previous memory:\n${prevSummary || '(none yet)'}\n\n` +
    `New conversation to fold in:\n${transcript}\n\n` +
    'Reply with ONLY a JSON object of the form {"summary":"..."}. ' +
    'Write the summary in first person as Tac, factual, under ~120 words, ' +
    'keeping durable facts about the user and your rapport. ' +
    'This is the only field; do not include any action fields.';
  return [{ role: 'user', content: instruction }];
}

module.exports = {
  loadMemory,
  saveMemory,
  buildSummaryMessages,
  RECENT_TURNS,
  SUMMARIZE_AFTER,
  MEMORY_PATH,
};

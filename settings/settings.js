const { ipcRenderer } = require('electron');

const fields = ['pet_name', 'base_url', 'api_key', 'model', 'behavior_interval_seconds', 'system_prompt'];

ipcRenderer.invoke('get-config').then(config => {
  fields.forEach(f => {
    document.getElementById(f).value = config[f] ?? '';
  });
  // allowed_domains is an array; show one domain per line.
  document.getElementById('allowed_domains').value =
    (config.allowed_domains || []).join('\n');
});

const testBtn = document.getElementById('test');
const testStatus = document.getElementById('test-status');

testBtn.addEventListener('click', async () => {
  testStatus.classList.remove('err');
  testStatus.textContent = 'Testing…';
  testBtn.disabled = true;
  try {
    const result = await ipcRenderer.invoke('test-connection', {
      base_url: document.getElementById('base_url').value,
      model: document.getElementById('model').value,
      api_key: document.getElementById('api_key').value,
      system_prompt: document.getElementById('system_prompt').value,
    });
    if (result.ok) {
      testStatus.textContent = result.message || 'Connected ✓';
    } else {
      testStatus.classList.add('err');
      testStatus.textContent = result.message || 'Connection failed';
    }
  } catch (e) {
    testStatus.classList.add('err');
    testStatus.textContent = e.message || 'Connection failed';
  } finally {
    testBtn.disabled = false;
  }
});

document.getElementById('open-accessibility').addEventListener('click', () => {
  ipcRenderer.invoke('open-accessibility');
});

const memoryStatus = document.getElementById('memory-status');
document.getElementById('clear-memory').addEventListener('click', async () => {
  if (!confirm('Make Tac forget all remembered conversations on this Mac?')) return;
  await ipcRenderer.invoke('clear-memory');
  memoryStatus.textContent = 'Forgotten ✓';
  setTimeout(() => { memoryStatus.textContent = ''; }, 2000);
});

document.getElementById('save').addEventListener('click', () => {
  const updates = {};
  fields.forEach(f => {
    updates[f] = document.getElementById(f).value;
  });
  updates.behavior_interval_seconds = parseInt(updates.behavior_interval_seconds, 10) || 20;
  // Parse the domain list back into an array (trim, drop blank lines).
  updates.allowed_domains = document.getElementById('allowed_domains').value
    .split('\n')
    .map(d => d.trim())
    .filter(Boolean);
  ipcRenderer.invoke('save-config', updates).then(() => {
    const status = document.getElementById('status');
    status.textContent = 'Saved!';
    status.classList.add('show');
    setTimeout(() => {
      status.classList.remove('show');
      status.textContent = '';
    }, 2000);
  });
});

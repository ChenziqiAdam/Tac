const { ipcRenderer } = require('electron');

const fields = ['pet_name', 'base_url', 'api_key', 'model', 'behavior_interval_seconds', 'system_prompt'];

ipcRenderer.invoke('get-config').then(config => {
  fields.forEach(f => {
    document.getElementById(f).value = config[f] ?? '';
  });
});

document.getElementById('save').addEventListener('click', () => {
  const updates = {};
  fields.forEach(f => {
    updates[f] = document.getElementById(f).value;
  });
  updates.behavior_interval_seconds = parseInt(updates.behavior_interval_seconds, 10) || 20;
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

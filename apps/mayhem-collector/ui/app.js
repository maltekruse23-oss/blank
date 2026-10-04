const $ = id => document.getElementById(id);
const invoke = window.__TAURI__?.core.invoke;
const number = value => value == null ? '–' : value.toLocaleString('de-DE');
function render(s) {
  $('total-matches').textContent = number(s.totalMatches);
  $('total-players').textContent = number(s.totalPlayers);
  $('uploaded').textContent = number(s.uploaded);
  $('players').textContent = number(s.players);
  $('message').textContent = s.message + (s.pending ? ' · ' + s.pending + ' Uploads offen' : '');
  $('error').textContent = s.error || '';
  $('autostart').checked = s.autostart;
}
async function refresh() {
  if (!invoke) return;
  try { render(await invoke('status')); } catch { $('error').textContent = 'Status nicht verfügbar.'; }
}
$('autostart').addEventListener('change', async event => {
  if (!invoke) return;
  try { render(await invoke('autostart', {enabled: event.target.checked})); }
  catch (error) { $('error').textContent = String(error); }
});
if (!invoke) $('message').textContent = 'Vorschau · keine Sammlung';
void refresh();
setInterval(refresh, 2000);

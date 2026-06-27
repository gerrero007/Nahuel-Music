/* ═══════════════════════════════════════════════
   config.js  –  Lógica de la página de ajustes
   ═══════════════════════════════════════════════ */
 
/* ──────────────────────────────────────────
   Estado local (refleja cambios pendientes)
────────────────────────────────────────── */
let pendingSettings = { ...Storage.getSettings() };
let dirty = false;
 
/* ──────────────────────────────────────────
   DOM refs
────────────────────────────────────────── */
const $ = id => document.getElementById(id);
 
const themeCards      = document.querySelectorAll('.theme-card');
const songsPerGameVal = $('songsPerGameVal');
const songsPerGameIn  = $('songsPerGame');
const songsDecBtn     = $('songsDecBtn');
const songsIncBtn     = $('songsIncBtn');
const timerSecondsVal = $('timerSecondsVal');
const timerSecondsIn  = $('timerSeconds');
const timerDecBtn     = $('timerDecBtn');
const timerIncBtn     = $('timerIncBtn');
const timerSecondsRow = $('timerSecondsRow');
const volumeSlider    = $('volumeSlider');
const volumeLabel     = $('volumeLabel');
const saveBar         = $('saveBar');
const saveBtn         = $('saveBtn');
const discardBtn      = $('discardBtn');
const exportDataBtn   = $('exportDataBtn');
const importDataInput = $('importDataInput');
const clearScoresBtn  = $('clearScoresBtn');
const resetAllBtn     = $('resetAllBtn');
const toast           = $('toast');
 
// Confirm modal
const modalConfirm  = $('modalConfirm');
const confirmTitle  = $('confirmTitle');
const confirmMsg    = $('confirmMsg');
const confirmCancel = $('confirmCancel');
const confirmOk     = $('confirmOk');
 
/* ──────────────────────────────────────────
   Toast
────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = 'toast' + (type ? ` ${type}` : '');
  toastTimer = setTimeout(() => { toast.className = 'toast hidden'; }, 2800);
}
 
/* ──────────────────────────────────────────
   Marcar cambios sin guardar
────────────────────────────────────────── */
function markDirty() {
  dirty = true;
  saveBar.classList.add('visible');
}
 
function markClean() {
  dirty = false;
  saveBar.classList.remove('visible');
}
 
/* ──────────────────────────────────────────
   Render: carga los valores guardados en la UI
────────────────────────────────────────── */
function renderSettings() {
  const s = pendingSettings;
 
  // Tema
  themeCards.forEach(card => {
    const val = card.dataset.theme;
    const inp = card.querySelector('input[type=radio]');
    const active = val === s.theme;
    inp.checked = active;
    card.classList.toggle('selected', active);
  });
 
  // Canciones por partida
  songsPerGameVal.textContent = s.songsPerGame;
  songsPerGameIn.value        = s.songsPerGame;
 
  // Toggles
  ['skipEnabled', 'showArtist', 'timerEnabled'].forEach(key => {
    const btn = $( key );
    if (btn) btn.setAttribute('aria-checked', s[key] ? 'true' : 'false');
  });
 
  // Fila timer
  syncTimerRow(s.timerEnabled);
 
  // Timer segundos
  timerSecondsVal.textContent = s.timerSeconds;
  timerSecondsIn.value        = s.timerSeconds;
 
  // Volumen
  volumeSlider.value    = s.volume;
  volumeLabel.textContent = s.volume + '%';
}
 
function syncTimerRow(enabled) {
  timerSecondsRow.style.opacity      = enabled ? '1' : '0.4';
  timerSecondsRow.style.pointerEvents= enabled ? 'auto' : 'none';
}
 
/* ──────────────────────────────────────────
   Eventos: tema
────────────────────────────────────────── */
themeCards.forEach(card => {
  card.addEventListener('click', () => {
    const val = card.dataset.theme;
    pendingSettings.theme = val;
    themeCards.forEach(c => c.classList.toggle('selected', c.dataset.theme === val));
    // Previsualizar inmediatamente
    document.documentElement.setAttribute('data-theme', val);
    markDirty();
  });
});
 
/* ──────────────────────────────────────────
   Eventos: steppers
────────────────────────────────────────── */
function makeStepper(decBtn, incBtn, input, displayEl, key, min, max) {
  decBtn.addEventListener('click', () => {
    const cur = parseInt(input.value);
    const nxt = Math.max(min, cur - (key === 'timerSeconds' ? 5 : 5));
    input.value = nxt;
    displayEl.textContent = nxt;
    pendingSettings[key] = nxt;
    markDirty();
  });
  incBtn.addEventListener('click', () => {
    const cur = parseInt(input.value);
    const nxt = Math.min(max, cur + (key === 'timerSeconds' ? 5 : 5));
    input.value = nxt;
    displayEl.textContent = nxt;
    pendingSettings[key] = nxt;
    markDirty();
  });
}
 
makeStepper(songsDecBtn, songsIncBtn, songsPerGameIn, songsPerGameVal, 'songsPerGame', 5, 50);
makeStepper(timerDecBtn, timerIncBtn, timerSecondsIn, timerSecondsVal, 'timerSeconds', 10, 120);
 
/* ──────────────────────────────────────────
   Eventos: toggles
────────────────────────────────────────── */
['skipEnabled', 'showArtist', 'timerEnabled'].forEach(key => {
  const btn = $(key);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = btn.getAttribute('aria-checked') === 'true';
    const next    = !current;
    btn.setAttribute('aria-checked', next ? 'true' : 'false');
    pendingSettings[key] = next;
    if (key === 'timerEnabled') syncTimerRow(next);
    markDirty();
  });
});
 
/* ──────────────────────────────────────────
   Eventos: volumen
────────────────────────────────────────── */
volumeSlider.addEventListener('input', () => {
  const val = parseInt(volumeSlider.value);
  volumeLabel.textContent = val + '%';
  pendingSettings.volume = val;
  markDirty();
});
 
/* ──────────────────────────────────────────
   Guardar / Descartar
────────────────────────────────────────── */
saveBtn.addEventListener('click', () => {
  Storage.saveSettings(pendingSettings);
  Storage.applyTheme();
  markClean();
  showToast('Ajustes guardados', 'success');
});
 
discardBtn.addEventListener('click', () => {
  pendingSettings = { ...Storage.getSettings() };
  renderSettings();
  document.documentElement.setAttribute('data-theme', pendingSettings.theme);
  markClean();
  showToast('Cambios descartados');
});
 
/* ──────────────────────────────────────────
   Exportar / Importar
────────────────────────────────────────── */
exportDataBtn.addEventListener('click', () => {
  const json = Storage.exportData();
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `soundguess-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Datos exportados', 'success');
});
 
importDataInput.addEventListener('change', () => {
  const file = importDataInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const result = Storage.importData(e.target.result);
 
      if (result.type === 'spotify') {
        showToast(
          `Playlist de Spotify importada: ${result.count} canciones. Los previews se buscarán al jugar.`,
          'success'
        );
      } else {
        pendingSettings = { ...Storage.getSettings() };
        renderSettings();
        document.documentElement.setAttribute('data-theme', pendingSettings.theme);
        markClean();
        showToast('Datos importados correctamente', 'success');
      }
    } catch (err) {
      showToast('El archivo no es válido o tiene un formato no reconocido', 'error');
    }
  };
  reader.readAsText(file);
  importDataInput.value = '';
});
 
/* ──────────────────────────────────────────
   Confirm modal helpers
────────────────────────────────────────── */
let confirmCallback = null;
 
function openConfirm(title, msg, cb) {
  confirmTitle.textContent = title;
  confirmMsg.textContent   = msg;
  confirmCallback = cb;
  modalConfirm.classList.remove('hidden');
}
 
confirmCancel.addEventListener('click', () => { modalConfirm.classList.add('hidden'); confirmCallback = null; });
confirmOk.addEventListener('click', () => {
  modalConfirm.classList.add('hidden');
  if (confirmCallback) { confirmCallback(); confirmCallback = null; }
});
modalConfirm.addEventListener('click', e => { if (e.target === modalConfirm) confirmCancel.click(); });
 
/* ──────────────────────────────────────────
   Borrar puntuaciones / Restablecer todo
────────────────────────────────────────── */
clearScoresBtn.addEventListener('click', () => {
  openConfirm(
    'Borrar puntuaciones',
    'Se eliminará todo el historial de partidas. Las playlists no se verán afectadas.',
    () => { Storage.clearScores(); showToast('Historial borrado', 'success'); }
  );
});
 
resetAllBtn.addEventListener('click', () => {
  openConfirm(
    '⚠️ Restablecer todo',
    'Se eliminarán TODAS tus playlists, puntuaciones y ajustes. Esta acción es irreversible.',
    () => {
      Storage.resetAll();
      pendingSettings = { ...Storage.getSettings() };
      renderSettings();
      Storage.applyTheme();
      markClean();
      showToast('Todo restablecido', 'success');
    }
  );
});
 
/* ──────────────────────────────────────────
   Init
────────────────────────────────────────── */
renderSettings();
 
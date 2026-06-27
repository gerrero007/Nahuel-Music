/* ═══════════════════════════════════════════════
   index.js  –  Lógica de la página de inicio
   ═══════════════════════════════════════════════ */
 
/* ──────────────────────────────────────────
   Estado local
────────────────────────────────────────── */
let searchResults    = [];
let pendingSong      = null;
let previewAudio     = new Audio();
let playingPreviewId = null;
let activeViewPl     = null;
let searchDebounce   = null;
 
/* ──────────────────────────────────────────
   DOM refs
────────────────────────────────────────── */
const $ = id => document.getElementById(id);
 
const searchInput       = $('searchInput');
const searchBtn         = $('searchBtn');
const searchResultsEl   = $('searchResults');
const playlistsListEl   = $('playlistsList');
const playlistsEmpty    = $('playlistsEmpty');
const newPlaylistBtn    = $('newPlaylistBtn');
 
const modalNewPlaylist   = $('modalNewPlaylist');
const playlistNameInput  = $('playlistNameInput');
const playlistEmojiInput = $('playlistEmojiInput');
const closeModal         = $('closeModal');
const cancelModal        = $('cancelModal');
const confirmModal       = $('confirmModal');
 
const modalAddSong       = $('modalAddSong');
const modalSongInfo      = $('modalSongInfo');
const playlistSelectList = $('playlistSelectList');
const closeAddModal      = $('closeAddModal');
 
const modalViewPlaylist  = $('modalViewPlaylist');
const modalViewTitle     = $('modalViewTitle');
const playlistSongsList  = $('playlistSongsList');
const closeViewModal     = $('closeViewModal');
const deletePlaylistBtn  = $('deletePlaylistBtn');
 
const toast = $('toast');
 
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
   Util
────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
 
/* ──────────────────────────────────────────
   Preview de audio
────────────────────────────────────────── */
function stopAllPreviews() {
  previewAudio.pause();
  previewAudio.src = '';
  playingPreviewId = null;
  document.querySelectorAll('.song-preview-btn').forEach(b => {
    b.textContent = '▶';
    b.classList.remove('playing');
  });
}
 
function togglePreview(track, btn) {
  if (playingPreviewId === track.id) {
    stopAllPreviews();
    return;
  }
  stopAllPreviews();
 
  const { volume } = Storage.getSettings();
  previewAudio = new Audio(track.preview);
  previewAudio.volume = (volume ?? 80) / 100;
  previewAudio.play().catch(() => showToast('No se pudo reproducir el preview', 'error'));
 
  playingPreviewId = track.id;
  btn.textContent = '■';
  btn.classList.add('playing');
 
  previewAudio.addEventListener('ended', () => {
    btn.textContent = '▶';
    btn.classList.remove('playing');
    playingPreviewId = null;
  }, { once: true });
}
 
/* ──────────────────────────────────────────
   Render resultados de búsqueda
────────────────────────────────────────── */
function renderSkeletons(n = 5) {
  searchResultsEl.innerHTML = '';
  for (let i = 0; i < n; i++) {
    searchResultsEl.insertAdjacentHTML('beforeend', `
      <div class="song-skeleton">
        <div class="sk-cover"></div>
        <div class="sk-lines">
          <div class="sk-line"></div>
          <div class="sk-line short"></div>
        </div>
      </div>`);
  }
}
 
function renderSearchResults(tracks) {
  searchResultsEl.innerHTML = '';
  searchResults = tracks;
 
  if (!tracks.length) {
    searchResultsEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🔍</span>
        <p>No se encontraron canciones.<br/>Prueba con otro término.</p>
      </div>`;
    return;
  }
 
  tracks.forEach((track, i) => {
    const card = document.createElement('div');
    card.className = 'song-card';
    card.style.animationDelay = `${i * 30}ms`;
    card.dataset.trackId = track.id;
    card.dataset.trackIdx = i;
    card.innerHTML = `
      <img class="song-cover"
           src="${track.cover || ''}"
           alt=""
           loading="lazy"
           onerror="this.style.opacity=0" />
      <div class="song-info">
        <div class="song-title">${escHtml(track.title)}</div>
        <div class="song-artist">${escHtml(track.artist)}</div>
      </div>
      ${track.preview
        ? `<button class="song-preview-btn" data-track-id="${track.id}" title="Preescuchar">▶</button>`
        : ''}
      <button class="song-add-btn" data-track-idx="${i}">+ Añadir</button>
    `;
    searchResultsEl.appendChild(card);
  });
}
 
/* ── Delegación de eventos en el contenedor de resultados ── */
searchResultsEl.addEventListener('click', e => {
  const previewBtn = e.target.closest('.song-preview-btn');
  const addBtn     = e.target.closest('.song-add-btn');
 
  if (previewBtn) {
    const id    = parseInt(previewBtn.dataset.trackId);
    const track = searchResults.find(t => t.id === id);
    if (track) togglePreview(track, previewBtn);
    return;
  }
 
  if (addBtn) {
    const idx   = parseInt(addBtn.dataset.trackIdx);
    const track = searchResults[idx];
    if (track) openAddSongModal(track);
    return;
  }
});
 
/* ──────────────────────────────────────────
   Búsqueda
────────────────────────────────────────── */
async function doSearch(q) {
  if (!q.trim()) return;
  stopAllPreviews();
  renderSkeletons();
 
  try {
    const tracks = await DeezerAPI.searchNormalized(q);
    renderSearchResults(tracks);
  } catch (err) {
    searchResultsEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⚠️</span>
        <p>Error al buscar. Comprueba tu conexión e inténtalo de nuevo.</p>
      </div>`;
  }
}
 
searchBtn.addEventListener('click', () => doSearch(searchInput.value));
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(searchInput.value); });
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  if (searchInput.value.length > 2) {
    searchDebounce = setTimeout(() => doSearch(searchInput.value), 600);
  }
});
 
/* ──────────────────────────────────────────
   Render playlists
────────────────────────────────────────── */
function renderPlaylists() {
  const lists = Storage.getPlaylists();
  playlistsListEl.innerHTML = '';
 
  if (!lists.length) {
    playlistsListEl.appendChild(playlistsEmpty);
    playlistsEmpty.style.display = '';
    return;
  }
 
  playlistsEmpty.style.display = 'none';
 
  lists.forEach(pl => {
    const row = document.createElement('div');
    row.className = 'playlist-row';
    row.dataset.id = pl.id;
    row.innerHTML = `
      <span class="playlist-emoji">${pl.emoji}</span>
      <div class="playlist-row-info">
        <div class="playlist-row-name">${escHtml(pl.name)}</div>
        <div class="playlist-row-count">${pl.songs.length} canción${pl.songs.length !== 1 ? 'es' : ''}</div>
      </div>
      <span class="playlist-row-arrow">›</span>
    `;
    row.addEventListener('click', () => openViewPlaylistModal(pl.id));
    playlistsListEl.appendChild(row);
  });
}
 
/* ──────────────────────────────────────────
   Modal: nueva playlist
────────────────────────────────────────── */
newPlaylistBtn.addEventListener('click', () => {
  playlistNameInput.value  = '';
  playlistEmojiInput.value = '';
  modalNewPlaylist.classList.remove('hidden');
  playlistNameInput.focus();
});
 
function closeNewPlaylistModal() { modalNewPlaylist.classList.add('hidden'); }
closeModal.addEventListener('click', closeNewPlaylistModal);
cancelModal.addEventListener('click', closeNewPlaylistModal);
modalNewPlaylist.addEventListener('click', e => { if (e.target === modalNewPlaylist) closeNewPlaylistModal(); });
playlistNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmModal.click(); });
 
confirmModal.addEventListener('click', () => {
  const name = playlistNameInput.value.trim();
  if (!name) { playlistNameInput.focus(); showToast('Escribe un nombre', 'error'); return; }
  const emoji = playlistEmojiInput.value.trim() || '🎵';
  Storage.createPlaylist(name, emoji);
  closeNewPlaylistModal();
  renderPlaylists();
  showToast(`Playlist "${name}" creada`, 'success');
});
 
/* ──────────────────────────────────────────
   Modal: añadir canción a playlist
────────────────────────────────────────── */
function openAddSongModal(song) {
  pendingSong = song;
  modalSongInfo.textContent = `"${song.title}" – ${song.artist}`;
  playlistSelectList.innerHTML = '';
 
  const lists = Storage.getPlaylists();
  if (!lists.length) {
    playlistSelectList.innerHTML = `<p style="color:var(--text-muted);font-size:.85rem;padding:.5rem 0">Crea una playlist primero.</p>`;
  } else {
    lists.forEach(pl => {
      const item = document.createElement('div');
      item.className = 'playlist-select-item';
      item.innerHTML = `
        <span>${pl.emoji}</span>
        <span>${escHtml(pl.name)}</span>
        <span style="color:var(--text-muted);font-size:.75rem;margin-left:auto">${pl.songs.length} canciones</span>
      `;
      item.addEventListener('click', () => {
        const result = Storage.addSongToPlaylist(pl.id, song);
        closeAddSongModal();
        if (result === 'duplicate') showToast('Ya está en esa playlist', 'error');
        else if (result)           { renderPlaylists(); showToast(`Añadida a "${pl.name}"`, 'success'); }
      });
      playlistSelectList.appendChild(item);
    });
  }
 
  modalAddSong.classList.remove('hidden');
}
 
function closeAddSongModal() { modalAddSong.classList.add('hidden'); pendingSong = null; }
closeAddModal.addEventListener('click', closeAddSongModal);
modalAddSong.addEventListener('click', e => { if (e.target === modalAddSong) closeAddSongModal(); });
 
/* ──────────────────────────────────────────
   Modal: ver / editar playlist
────────────────────────────────────────── */
function openViewPlaylistModal(plId) {
  const pl = Storage.getPlaylist(plId);
  if (!pl) return;
  activeViewPl = plId;
  modalViewTitle.textContent = `${pl.emoji} ${pl.name}`;
  Storage.setActivePlaylist(plId);
  renderPlaylistSongs(pl);
  modalViewPlaylist.classList.remove('hidden');
}
 
function renderPlaylistSongs(pl) {
  playlistSongsList.innerHTML = '';
 
  if (!pl.songs.length) {
    playlistSongsList.innerHTML = `
      <div class="empty-state" style="padding:2rem 1rem">
        <span class="empty-icon">🎵</span>
        <p>Sin canciones aún.<br/>Busca y añade desde el buscador.</p>
      </div>`;
    return;
  }
 
  pl.songs.forEach((song, i) => {
    const item = document.createElement('div');
    item.className = 'playlist-song-item';
    item.innerHTML = `
      <span class="playlist-song-num">${i + 1}</span>
      <img class="playlist-song-cover" src="${song.cover || ''}" alt="" onerror="this.style.opacity=0" />
      <div class="playlist-song-info">
        <div class="playlist-song-title">${escHtml(song.title)}</div>
        <div class="playlist-song-artist">${escHtml(song.artist)}</div>
      </div>
      <button class="playlist-song-remove" data-song-id="${song.id}" title="Eliminar">✕</button>
    `;
    playlistSongsList.appendChild(item);
  });
}
 
/* Delegación de eventos para eliminar canciones del modal */
playlistSongsList.addEventListener('click', e => {
  const btn = e.target.closest('.playlist-song-remove');
  if (!btn || !activeViewPl) return;
  const songId = parseInt(btn.dataset.songId);
  Storage.removeSongFromPlaylist(activeViewPl, songId);
  const updated = Storage.getPlaylist(activeViewPl);
  renderPlaylistSongs(updated);
  renderPlaylists();
  showToast('Canción eliminada', 'success');
});
 
function closeViewModal_fn() { modalViewPlaylist.classList.add('hidden'); activeViewPl = null; }
closeViewModal.addEventListener('click', closeViewModal_fn);
modalViewPlaylist.addEventListener('click', e => { if (e.target === modalViewPlaylist) closeViewModal_fn(); });
 
deletePlaylistBtn.addEventListener('click', () => {
  const pl = Storage.getPlaylist(activeViewPl);
  if (!pl) return;
  if (!confirm(`¿Eliminar la playlist "${pl.name}"?`)) return;
  Storage.deletePlaylist(activeViewPl);
  closeViewModal_fn();
  renderPlaylists();
  showToast('Playlist eliminada', 'success');
});
 
/* ──────────────────────────────────────────
   Init
────────────────────────────────────────── */
renderPlaylists();
 
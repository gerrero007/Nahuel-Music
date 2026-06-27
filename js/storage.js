/* ═══════════════════════════════════════════════
   storage.js  –  Capa de persistencia (localStorage)
   Debe cargarse primero en todas las páginas.
   ═══════════════════════════════════════════════ */

const Storage = (() => {

  const KEYS = {
    PLAYLISTS : 'sg_playlists',
    SETTINGS  : 'sg_settings',
    SCORES    : 'sg_scores',
    ACTIVE_PL : 'sg_active_playlist',
  };

  /* ── Defaults ── */
  const DEFAULT_SETTINGS = {
    theme        : 'dark',
    songsPerGame : 20,
    skipEnabled  : true,
    showArtist   : true,
    timerEnabled : false,
    timerSeconds : 30,
    volume       : 80,
  };

  /* ──────────────────────────────────────────
     Helpers
  ────────────────────────────────────────── */
  function _get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch { return false; }
  }

  /* ──────────────────────────────────────────
     Settings
  ────────────────────────────────────────── */
  function getSettings() {
    const saved = _get(KEYS.SETTINGS) || {};
    return { ...DEFAULT_SETTINGS, ...saved };
  }

  function saveSettings(partial) {
    const current = getSettings();
    const merged  = { ...current, ...partial };
    _set(KEYS.SETTINGS, merged);
    return merged;
  }

  /* ──────────────────────────────────────────
     Playlists
  ────────────────────────────────────────── */
  function getPlaylists() {
    return _get(KEYS.PLAYLISTS) || [];
  }

  function getPlaylist(id) {
    return getPlaylists().find(p => p.id === id) || null;
  }

  function savePlaylists(list) {
    return _set(KEYS.PLAYLISTS, list);
  }

  function createPlaylist(name, emoji = '🎵') {
    const list = getPlaylists();
    const pl = {
      id      : 'pl_' + Date.now(),
      name    : name.trim(),
      emoji   : emoji || '🎵',
      songs   : [],
      created : Date.now(),
    };
    list.push(pl);
    savePlaylists(list);
    return pl;
  }

  function updatePlaylist(id, changes) {
    const list = getPlaylists();
    const idx  = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...changes };
    savePlaylists(list);
    return list[idx];
  }

  function deletePlaylist(id) {
    const list = getPlaylists().filter(p => p.id !== id);
    savePlaylists(list);
  }

  function addSongToPlaylist(playlistId, song) {
    const list = getPlaylists();
    const pl   = list.find(p => p.id === playlistId);
    if (!pl) return false;

    // evitar duplicados
    if (pl.songs.some(s => s.id === song.id)) return 'duplicate';

    pl.songs.push({
      id      : song.id,
      title   : song.title,
      artist  : song.artist?.name || song.artist || 'Desconocido',
      cover   : song.album?.cover_medium || song.cover || '',
      preview : song.preview || '',
    });
    savePlaylists(list);
    return true;
  }

  function removeSongFromPlaylist(playlistId, songId) {
    const list = getPlaylists();
    const pl   = list.find(p => p.id === playlistId);
    if (!pl) return false;
    pl.songs = pl.songs.filter(s => s.id !== songId);
    savePlaylists(list);
    return true;
  }

  /* ──────────────────────────────────────────
     Active playlist (para pasar entre páginas)
  ────────────────────────────────────────── */
  function setActivePlaylist(id) { _set(KEYS.ACTIVE_PL, id); }
  function getActivePlaylist()   { return _get(KEYS.ACTIVE_PL); }
  function clearActivePlaylist() { localStorage.removeItem(KEYS.ACTIVE_PL); }

  /* ──────────────────────────────────────────
     Scores / Historial
  ────────────────────────────────────────── */
  function getScores() {
    return _get(KEYS.SCORES) || [];
  }

  function addScore(entry) {
    // entry: { playlistId, playlistName, score, correct, wrong, bestStreak, avgPhase, date }
    const scores = getScores();
    scores.unshift({ ...entry, date: Date.now() });
    // guardar solo los últimos 100
    _set(KEYS.SCORES, scores.slice(0, 100));
  }

  function clearScores() {
    _set(KEYS.SCORES, []);
  }

  /* ──────────────────────────────────────────
     Export / Import
  ────────────────────────────────────────── */
  function exportData() {
    return JSON.stringify({
      version   : 1,
      exported  : Date.now(),
      playlists : getPlaylists(),
      settings  : getSettings(),
      scores    : getScores(),
    }, null, 2);
  }

  function importData(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data.version) throw new Error('Formato inválido');
    if (data.playlists) savePlaylists(data.playlists);
    if (data.settings)  _set(KEYS.SETTINGS, data.settings);
    if (data.scores)    _set(KEYS.SCORES, data.scores);
    return data;
  }

  /* ──────────────────────────────────────────
     Reset
  ────────────────────────────────────────── */
  function resetAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  /* ──────────────────────────────────────────
     Apply theme on load (en todas las páginas)
  ────────────────────────────────────────── */
  function applyTheme() {
    const { theme } = getSettings();
    document.documentElement.setAttribute('data-theme', theme);
  }

  // Ejecutar inmediatamente para evitar flash
  applyTheme();

  return {
    getSettings, saveSettings,
    getPlaylists, getPlaylist, createPlaylist, updatePlaylist,
    deletePlaylist, addSongToPlaylist, removeSongFromPlaylist,
    setActivePlaylist, getActivePlaylist, clearActivePlaylist,
    getScores, addScore, clearScores,
    exportData, importData, resetAll,
    applyTheme,
  };
})();

/* ═══════════════════════════════════════════════
   storage.js  –  Capa de persistencia (localStorage)
   ═══════════════════════════════════════════════ */

const Storage = (() => {

  const KEYS = {
    PLAYLISTS : 'sg_playlists',
    SETTINGS  : 'sg_settings',
    SCORES    : 'sg_scores',
    ACTIVE_PL : 'sg_active_playlist',
  };

  const DEFAULT_SETTINGS = {
    theme        : 'dark',
    songsPerGame : 20,
    skipEnabled  : true,
    showArtist   : true,
    timerEnabled : false,
    timerSeconds : 30,
    volume       : 80,
  };

  function _get(key) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
    catch { return null; }
  }
  function _set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }

  /* ── Settings ── */
  function getSettings() { return { ...DEFAULT_SETTINGS, ...(_get(KEYS.SETTINGS) || {}) }; }
  function saveSettings(partial) {
    const merged = { ...getSettings(), ...partial };
    _set(KEYS.SETTINGS, merged);
    return merged;
  }

  /* ── Playlists ── */
  function getPlaylists()    { return _get(KEYS.PLAYLISTS) || []; }
  function getPlaylist(id)   { return getPlaylists().find(p => p.id === id) || null; }
  function savePlaylists(l)  { return _set(KEYS.PLAYLISTS, l); }

  function createPlaylist(name, emoji = '🎵') {
    const list = getPlaylists();
    const pl   = { id: 'pl_' + Date.now(), name: name.trim(), emoji: emoji || '🎵', songs: [], created: Date.now() };
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

  function deletePlaylist(id) { savePlaylists(getPlaylists().filter(p => p.id !== id)); }

  function addSongToPlaylist(playlistId, song) {
    const list = getPlaylists();
    const pl   = list.find(p => p.id === playlistId);
    if (!pl) return false;
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

  /* ── Active playlist ── */
  function setActivePlaylist(id) { _set(KEYS.ACTIVE_PL, id); }
  function getActivePlaylist()   { return _get(KEYS.ACTIVE_PL); }
  function clearActivePlaylist() { localStorage.removeItem(KEYS.ACTIVE_PL); }

  /* ── Scores ── */
  function getScores() { return _get(KEYS.SCORES) || []; }
  function addScore(entry) {
    const scores = getScores();
    scores.push({ ...entry, date: Date.now() });
    // Ordenar por puntuación descendente y guardar los 100 mejores
    scores.sort((a, b) => b.score - a.score);
    _set(KEYS.SCORES, scores.slice(0, 100));
  }
  function clearScores() { _set(KEYS.SCORES, []); }

  /* ──────────────────────────────────────────
     Export / Import  (con soporte para formato Spotify csvjson)
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

  /**
   * Detecta si el JSON es un array de tracks estilo Spotify csvjson
   * (tiene campos "Track Name", "Artist Name(s)", "Track URI")
   */
  function _isSpotifyFormat(data) {
    return Array.isArray(data) &&
           data.length > 0 &&
           'Track Name' in data[0] &&
           'Artist Name(s)' in data[0];
  }

  /**
   * Convierte un array Spotify csvjson en una playlist SoundGuess.
   * Los tracks no tienen preview (se buscarán en Deezer al jugar),
   * pero se guardan con id basado en el URI de Spotify para evitar duplicados.
   */
  function _convertSpotifyToPlaylist(tracks) {
    const songs = tracks.map(t => {
      // Extraer el ID de Spotify del URI  (spotify:track:XXXX)
      const uri    = t['Track URI'] || '';
      const spotId = uri.split(':')[2] || ('sp_' + Math.random().toString(36).slice(2));
      return {
        id      : spotId,
        title   : t['Track Name']      || 'Sin título',
        artist  : t['Artist Name(s)']  || 'Desconocido',
        cover   : '',       // sin portada hasta buscar en Deezer
        preview : '',       // sin preview hasta buscar en Deezer
        album   : t['Album Name'] || '',
        spotifyUri: uri,
      };
    });

    return {
      id      : 'pl_' + Date.now(),
      name    : 'Importada de Spotify',
      emoji   : '🎵',
      songs,
      created : Date.now(),
      needsDeezerLookup: true,   // flag para que game.js busque previews
    };
  }

  function importData(jsonStr) {
    const data = JSON.parse(jsonStr);

    /* ── Formato Spotify csvjson ── */
    if (_isSpotifyFormat(data)) {
      const pl   = _convertSpotifyToPlaylist(data);
      const list = getPlaylists();
      list.push(pl);
      savePlaylists(list);
      return { type: 'spotify', playlist: pl, count: pl.songs.length };
    }

    /* ── Formato SoundGuess nativo ── */
    if (data.version) {
      if (data.playlists) savePlaylists(data.playlists);
      if (data.settings)  _set(KEYS.SETTINGS, data.settings);
      if (data.scores)    _set(KEYS.SCORES, data.scores);
      return { type: 'native', ...data };
    }

    throw new Error('Formato de archivo no reconocido');
  }

  /* ── Reset ── */
  function resetAll() { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); }

  /* ── Apply theme ── */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', getSettings().theme);
  }
  applyTheme();

  return {
    getSettings, saveSettings,
    getPlaylists, getPlaylist, createPlaylist, updatePlaylist,
    deletePlaylist, addSongToPlaylist, removeSongFromPlaylist,
    setActivePlaylist, getActivePlaylist, clearActivePlaylist,
    getScores, addScore, clearScores,
    exportData, importData, resetAll, applyTheme,
  };
})();
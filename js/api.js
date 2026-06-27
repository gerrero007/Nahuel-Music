/* ═══════════════════════════════════════════════
   api.js  –  Capa de acceso a la API de Deezer
   Usa el proxy público de AllOrigins para evitar
   problemas de CORS con la API de Deezer.
   ═══════════════════════════════════════════════ */

const DeezerAPI = (() => {

  const PROXY    = 'https://api.allorigins.win/get?url=';
  const BASE     = 'https://api.deezer.com';
  const CACHE    = new Map();   // caché en memoria por sesión
  const MAX_WAIT = 8000;        // timeout 8 s

  /* ──────────────────────────────────────────
     Fetch con proxy + caché + timeout
  ────────────────────────────────────────── */
  async function _fetch(endpoint) {
    const url = `${BASE}${endpoint}`;

    if (CACHE.has(url)) return CACHE.get(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MAX_WAIT);

    try {
      const proxyUrl = PROXY + encodeURIComponent(url);
      const res  = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const outer = await res.json();
      const data  = JSON.parse(outer.contents);

      if (data.error) throw new Error(data.error.message || 'API error');

      CACHE.set(url, data);
      return data;

    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /* ──────────────────────────────────────────
     Buscar canciones
     Devuelve array de tracks normalizados
  ────────────────────────────────────────── */
  async function search(query, limit = 25) {
    if (!query || !query.trim()) return [];
    const q    = encodeURIComponent(query.trim());
    const data = await _fetch(`/search?q=${q}&limit=${limit}&output=json`);
    return (data.data || []).filter(t => t.preview); // solo tracks con preview
  }

  /* ──────────────────────────────────────────
     Obtener un track por ID
  ────────────────────────────────────────── */
  async function getTrack(id) {
    return await _fetch(`/track/${id}`);
  }

  /* ──────────────────────────────────────────
     Normalizar track de Deezer a objeto interno
  ────────────────────────────────────────── */
  function normalizeTrack(t) {
    return {
      id      : t.id,
      title   : t.title,
      artist  : t.artist?.name || 'Desconocido',
      cover   : t.album?.cover_medium || t.album?.cover || '',
      preview : t.preview || '',
      album   : t.album?.title || '',
      duration: t.duration || 0,
    };
  }

  /* ──────────────────────────────────────────
     Búsqueda y normalización conjunta
  ────────────────────────────────────────── */
  async function searchNormalized(query, limit = 25) {
    const raw = await search(query, limit);
    return raw.map(normalizeTrack);
  }

  return { search, searchNormalized, getTrack, normalizeTrack };
})();

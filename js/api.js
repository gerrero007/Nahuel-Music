/* ═══════════════════════════════════════════════
   api.js  –  Capa de acceso a la API de Deezer
   Prueba múltiples proxies CORS en cascada.
   ═══════════════════════════════════════════════ */
 
const DeezerAPI = (() => {
 
  const BASE    = 'https://api.deezer.com';
  const CACHE   = new Map();
  const TIMEOUT = 8000;
 
  /* ──────────────────────────────────────────
     Lista de proxies CORS (se prueban en orden)
  ────────────────────────────────────────── */
  const PROXIES = [
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    url => `https://cors-anywhere.herokuapp.com/${url}`,
  ];
 
  /* Parsear la respuesta según el proxy usado */
  async function parseProxy(res, proxyIndex) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (proxyIndex === 1) {
      // allorigins devuelve { contents: "..." }
      const outer = await res.json();
      return JSON.parse(outer.contents);
    }
    // corsproxy.io y cors-anywhere devuelven el JSON directamente
    return res.json();
  }
 
  /* ──────────────────────────────────────────
     Fetch con cascada de proxies + caché
  ────────────────────────────────────────── */
  async function _fetch(endpoint) {
    const url = `${BASE}${endpoint}`;
    if (CACHE.has(url)) return CACHE.get(url);
 
    let lastErr;
 
    for (let i = 0; i < PROXIES.length; i++) {
      const proxyUrl   = PROXIES[i](url);
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), TIMEOUT);
 
      try {
        const res  = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timer);
        const data = await parseProxy(res, i);
 
        if (data.error) throw new Error(data.error.message || 'API error');
 
        CACHE.set(url, data);
        return data;
 
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        // Probar el siguiente proxy
      }
    }
 
    throw lastErr || new Error('Todos los proxies fallaron');
  }
 
  /* ──────────────────────────────────────────
     Buscar canciones
  ────────────────────────────────────────── */
  async function search(query, limit = 25) {
    if (!query || !query.trim()) return [];
    const q    = encodeURIComponent(query.trim());
    const data = await _fetch(`/search?q=${q}&limit=${limit}&output=json`);
    return (data.data || []).filter(t => t.preview);
  }
 
  /* ──────────────────────────────────────────
     Normalizar track
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
 
  async function searchNormalized(query, limit = 25) {
    const raw = await search(query, limit);
    return raw.map(normalizeTrack);
  }
 
  /* ──────────────────────────────────────────
     Obtener preview como Blob (evita CORS en audio)
     allorigins (índice 1) se salta porque no sirve
     para contenido binario.
  ────────────────────────────────────────── */
  const PREVIEW_CACHE = new Map();
 
  async function fetchPreviewBlob(previewUrl) {
    if (PREVIEW_CACHE.has(previewUrl)) return PREVIEW_CACHE.get(previewUrl);
 
    let lastErr;
 
    for (let i = 0; i < PROXIES.length; i++) {
      // allorigins solo sirve para JSON, no para binarios → saltar
      if (i === 1) continue;
 
      const proxyUrl   = PROXIES[i](previewUrl);
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), TIMEOUT);
 
      try {
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timer);
 
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
 
        const blob    = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        PREVIEW_CACHE.set(previewUrl, blobUrl);
        return blobUrl;
 
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
      }
    }
 
    throw lastErr || new Error('No se pudo obtener el audio');
  }
 
  return { search, searchNormalized, normalizeTrack, fetchPreviewBlob };
})();
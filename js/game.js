/* ═══════════════════════════════════════════════
   game.js  –  Motor del juego SoundGuess
   ═══════════════════════════════════════════════ */

/* ──────────────────────────────────────────
   Constantes
────────────────────────────────────────── */
const PHASE_DURATIONS = [1, 3, 7, 15];   // segundos por fase (índice 0-3)

const POINTS = {
  phase1  : 1000,
  phase2  : 750,
  phase3  : 500,
  phase4  : 250,
  streak2 : 100,   // bonus por racha ≥2
  streak4 : 200,   // bonus por racha ≥4
};

/* ──────────────────────────────────────────
   Estado del juego
────────────────────────────────────────── */
let state = {
  screen       : 'lobby',    // 'lobby' | 'game' | 'results'
  playlist     : null,       // { id, name, emoji, songs: [] }
  queue        : [],         // canciones barajadas para esta partida
  currentIdx   : 0,          // índice en queue
  phase        : 0,          // 0-3
  score        : 0,
  streak       : 0,
  bestStreak   : 0,
  correct      : 0,
  wrong        : 0,
  phasesUsed   : [],         // fase en la que se acertó cada canción
  history      : [],         // { song, correct, phase, points }
  audio        : null,       // Audio object
  phaseTimer   : null,       // setTimeout para cortar audio
  countdownInt : null,       // setInterval para el HUD timer
  countdownSec : 0,
  isPlaying    : false,
  answered     : false,
  settings     : {},
};

/* ──────────────────────────────────────────
   DOM refs
────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const screenLobby   = $('screenLobby');
const screenGame    = $('screenGame');
const screenResults = $('screenResults');
const lobbyPlaylists= $('lobbyPlaylists');
const lobbyEmpty    = $('lobbyEmpty');
const lobbyActions  = $('lobbyActions');
const selectedPlaylistInfo = $('selectedPlaylistInfo');
const startGameBtn  = $('startGameBtn');

// HUD
const hudSong    = $('hudSong');
const hudScore   = $('hudScore');
const hudStreak  = $('hudStreak');
const hudTimerBlock = $('hudTimerBlock');
const hudTimer   = $('hudTimer');
const progressBarFill = $('progressBarFill');

// Phases
const phaseSteps  = [null, $('phase1'), $('phase2'), $('phase3'), $('phase4')];
const phaseDurationLabel = $('phaseDuration');

// Player
const playerCard   = $('playerCard');
const waveform     = $('waveform');
const audioPlayer  = $('audioPlayer');
const playBtn      = $('playBtn');
const playBtnIcon  = $('playBtnIcon');

// Guess
const guessInput       = $('guessInput');
const autocompleteList = $('autocompleteList');
const skipBtn          = $('skipBtn');
const giveUpBtn        = $('giveUpBtn');
const submitGuessBtn   = $('submitGuessBtn');

// Feedback
const feedbackArea   = $('feedbackArea');
const feedbackCard   = $('feedbackCard');
const feedbackResult = $('feedbackResult');
const feedbackSong   = $('feedbackSong');
const feedbackPoints = $('feedbackPoints');
const nextSongBtn    = $('nextSongBtn');

// Results
const resultsTrophy    = $('resultsTrophy');
const resultsTitle     = $('resultsTitle');
const resultsFinalScore= $('resultsFinalScore');
const statCorrect      = $('statCorrect');
const statWrong        = $('statWrong');
const statBestStreak   = $('statBestStreak');
const statAvgPhase     = $('statAvgPhase');
const historySongList  = $('historySongList');
const leaderboardList  = $('leaderboardList');
const playAgainBtn     = $('playAgainBtn');

const toast = $('toast');

/* ──────────────────────────────────────────
   Toast
────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = 'toast' + (type ? ` ${type}` : '');
  toastTimer = setTimeout(() => { toast.className = 'toast hidden'; }, 2600);
}

/* ──────────────────────────────────────────
   Pantallas
────────────────────────────────────────── */
function showScreen(name) {
  screenLobby.classList.toggle('hidden', name !== 'lobby');
  screenGame.classList.toggle('hidden', name !== 'game');
  screenResults.classList.toggle('hidden', name !== 'results');
  state.screen = name;
}

/* ──────────────────────────────────────────
   LOBBY
────────────────────────────────────────── */
function initLobby() {
  const playlists = Storage.getPlaylists();
  lobbyPlaylists.innerHTML = '';

  const validPlaylists = playlists.filter(p => p.songs.length >= 3);

  if (!validPlaylists.length) {
    lobbyPlaylists.appendChild(lobbyEmpty);
    lobbyEmpty.style.display = '';
    lobbyActions.style.display = 'none';
    return;
  }

  lobbyEmpty.style.display = 'none';

  // Pre-seleccionar la activa si existe
  const activePl = Storage.getActivePlaylist();

  validPlaylists.forEach(pl => {
    const card = document.createElement('div');
    card.className = 'lobby-playlist-card';
    card.dataset.id = pl.id;
    card.innerHTML = `
      <div class="lobby-card-emoji">${pl.emoji}</div>
      <div class="lobby-card-name">${escHtml(pl.name)}</div>
      <div class="lobby-card-count">${pl.songs.length} canciones</div>
    `;
    card.addEventListener('click', () => selectPlaylist(pl, card));
    lobbyPlaylists.appendChild(card);

    if (pl.id === activePl) {
      setTimeout(() => selectPlaylist(pl, card), 0);
    }
  });
}

function selectPlaylist(pl, cardEl) {
  document.querySelectorAll('.lobby-playlist-card').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');
  state.playlist = pl;
  selectedPlaylistInfo.innerHTML = `${pl.emoji} <strong>${escHtml(pl.name)}</strong> &mdash; ${pl.songs.length} canciones`;
  lobbyActions.style.display = '';
}

startGameBtn.addEventListener('click', async () => {
  if (!state.playlist) { showToast('Selecciona una playlist', 'error'); return; }

  // Si la playlist viene de Spotify, buscar previews en Deezer primero
  if (state.playlist.needsDeezerLookup) {
    await enrichWithDeezerPreviews(state.playlist);
  }

  const songs = state.playlist.songs.filter(s => s.preview);
  if (songs.length < 3) {
    showToast('No se encontraron suficientes canciones con preview en Deezer (mínimo 3)', 'error');
    return;
  }
  startGame(songs);
});

/**
 * Para playlists importadas de Spotify (sin preview URL),
 * busca cada canción en Deezer y rellena cover + preview.
 */
async function enrichWithDeezerPreviews(pl) {
  startGameBtn.disabled    = true;
  startGameBtn.textContent = '🔍 Buscando previews…';

  let updated = false;

  for (const song of pl.songs) {
    if (song.preview) continue;
    try {
      const results = await DeezerAPI.searchNormalized(`${song.title} ${song.artist}`, 3);
      if (results.length) {
        const match = results[0];
        song.preview = match.preview;
        song.cover   = song.cover || match.cover;
        updated = true;
      }
    } catch { /* seguir con la siguiente */ }
  }

  if (updated) {
    pl.needsDeezerLookup = pl.songs.some(s => !s.preview);
    Storage.updatePlaylist(pl.id, { songs: pl.songs, needsDeezerLookup: pl.needsDeezerLookup });
  }

  startGameBtn.disabled    = false;
  startGameBtn.textContent = '▶ Empezar partida';
}

/* ──────────────────────────────────────────
   JUEGO: iniciar
────────────────────────────────────────── */
function startGame(songs) {
  state.settings = Storage.getSettings();

  const total = Math.min(state.settings.songsPerGame, songs.length);
  state.queue      = shuffle([...songs]).slice(0, total);
  state.currentIdx = 0;
  state.score      = 0;
  state.streak     = 0;
  state.bestStreak = 0;
  state.correct    = 0;
  state.wrong      = 0;
  state.phasesUsed = [];
  state.history    = [];

  showScreen('game');
  loadSong();
}

/* ──────────────────────────────────────────
   JUEGO: cargar canción actual
────────────────────────────────────────── */
function loadSong() {
  stopAudio();
  if (audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
    URL.revokeObjectURL(audioPlayer.src);
  }
  clearCountdown();

  state.phase    = 0;
  state.answered = false;

  const total   = state.queue.length;
  const current = state.currentIdx + 1;

  // HUD
  hudSong.textContent  = `${current} / ${total}`;
  hudScore.textContent = state.score;
  hudStreak.textContent= `🔥 ${state.streak}`;
  progressBarFill.style.width = `${((current - 1) / total) * 100}%`;

  // Timer HUD
  if (state.settings.timerEnabled) {
    hudTimerBlock.classList.remove('hidden');
  } else {
    hudTimerBlock.classList.add('hidden');
  }

  // Fases: reset visual
  phaseSteps.forEach((el, i) => {
    if (!el) return;
    el.classList.remove('active', 'done');
  });
  setActivePhase(0);

  // Player: reset
  playerCard.classList.remove('playing');
  waveform.classList.remove('playing');
  playBtnIcon.textContent = '…';
  playBtn.classList.remove('loading', 'disabled');
  playBtn.disabled = true;   // se activa cuando el blob esté listo
  phaseDurationLabel.textContent = '1 segundo';

  // Guess area: reset
  feedbackArea.classList.add('hidden');
  guessInput.value   = '';
  guessInput.disabled= false;
  autocompleteList.classList.add('hidden');

  skipBtn.disabled    = false;
  giveUpBtn.disabled  = false;
  submitGuessBtn.disabled = false;

  skipBtn.style.display = state.settings.skipEnabled ? '' : 'none';

  // Precargar audio como Blob para evitar bloqueos CORS
  const song = state.queue[state.currentIdx];
  (async () => {
    try {
      playBtn.disabled = false;
      playBtnIcon.textContent = '▶';

    } catch {
      playBtnIcon.textContent = '✕';
      showToast('Audio no disponible para esta canción', 'error');
    }
  })();
}

/* ──────────────────────────────────────────
   JUEGO: reproducir fragmento de la fase actual
────────────────────────────────────────── */
playBtn.addEventListener('click', () => {
  if (state.answered) return;
  if (state.isPlaying) {
    stopAudio();
    return;
  }
  playCurrentPhase();
});

async function playCurrentPhase() {
  const dur  = PHASE_DURATIONS[state.phase];
  const song = state.queue[state.currentIdx];

  playBtn.classList.add('loading');
  playBtnIcon.textContent = '…';

  // Refrescar la URL de preview (puede haber caducado)
  try {
    const results = await DeezerAPI.searchNormalized(`${song.title} ${song.artist}`, 1);
    if (results.length && results[0].preview) {
      song.preview = results[0].preview;  // actualizar con URL fresca
    }
  } catch { /* si falla la búsqueda, intentar con la URL que tenemos */ }

  audioPlayer.removeAttribute('crossorigin');
  audioPlayer.src = song.preview;
  audioPlayer.load();
  audioPlayer.volume = state.settings.volume / 100;
  audioPlayer.currentTime = 0;

  audioPlayer.play().then(() => {
    state.isPlaying = true;
    playBtn.classList.remove('loading');
    playBtnIcon.textContent = '■';
    playerCard.classList.add('playing');
    waveform.classList.add('playing');
    animateWave();

    clearTimeout(state.phaseTimer);
    state.phaseTimer = setTimeout(() => {
      stopAudio();
      if (state.settings.timerEnabled && !state.answered) {
        startCountdown(state.settings.timerSeconds);
      }
    }, dur * 1000);

  }).catch(() => {
    playBtn.classList.remove('loading');
    playBtnIcon.textContent = '▶';
    showToast('Audio no disponible para esta canción', 'error');
  });
}

function stopAudio() {
  clearTimeout(state.phaseTimer);
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  state.isPlaying = false;
  playBtnIcon.textContent = '▶';
  playerCard.classList.remove('playing');
  waveform.classList.remove('playing');
}

/* ──────────────────────────────────────────
   Animación waveform (random heights)
────────────────────────────────────────── */
let waveAnimFrame;
function animateWave() {
  if (!state.isPlaying) return;
  const bars = waveform.querySelectorAll('span');
  bars.forEach(b => {
    b.style.height = (6 + Math.random() * 38) + 'px';
  });
  waveAnimFrame = setTimeout(animateWave, 120);
}

/* ──────────────────────────────────────────
   Fases visuales
────────────────────────────────────────── */
function setActivePhase(phaseIdx) {
  const labels = ['1 segundo', '3 segundos', '7 segundos', '15 segundos'];
  phaseDurationLabel.textContent = labels[phaseIdx];
  phaseSteps.forEach((el, i) => {
    if (!el) return;
    const p = i - 1; // phaseSteps[1] → phase 0
    if (p < phaseIdx)        el.className = 'phase-step done';
    else if (p === phaseIdx) el.className = 'phase-step active';
    else                     el.className = 'phase-step';
  });
}

/* ──────────────────────────────────────────
   Pasar fase / No sé
────────────────────────────────────────── */
skipBtn.addEventListener('click', () => {
  if (state.answered) return;
  stopAudio();
  clearCountdown();
  advancePhase();
});

giveUpBtn.addEventListener('click', () => {
  if (state.answered) return;
  stopAudio();
  clearCountdown();
  resolveRound(false);
});

function advancePhase() {
  if (state.phase < PHASE_DURATIONS.length - 1) {
    state.phase++;
    setActivePhase(state.phase);
    showToast(`Fase ${state.phase + 1}: ${PHASE_DURATIONS[state.phase]} segundos`);
  } else {
    // Última fase agotada → fallo
    resolveRound(false);
  }
}

/* ──────────────────────────────────────────
   Autocomplete mientras escribe
────────────────────────────────────────── */
let acDebounce;
guessInput.addEventListener('input', () => {
  clearTimeout(acDebounce);
  const val = guessInput.value.trim();
  if (val.length < 2) { autocompleteList.classList.add('hidden'); return; }

  acDebounce = setTimeout(async () => {
    try {
      const results = await DeezerAPI.searchNormalized(val, 6);
      if (!results.length) { autocompleteList.classList.add('hidden'); return; }
      renderAutocomplete(results);
    } catch { /* silent */ }
  }, 350);
});

function renderAutocomplete(tracks) {
  autocompleteList.innerHTML = '';
  tracks.forEach(t => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.innerHTML = `
      <img src="${t.cover}" alt="" onerror="this.style.opacity=0" />
      <span><strong>${escHtml(t.title)}</strong> — ${escHtml(t.artist)}</span>
    `;
    item.addEventListener('mousedown', e => {
      e.preventDefault(); // evitar que el input pierda el foco
      guessInput.value = t.title;
      autocompleteList.classList.add('hidden');
      submitGuess();
    });
    autocompleteList.appendChild(item);
  });
  autocompleteList.classList.remove('hidden');
}

guessInput.addEventListener('blur', () => {
  setTimeout(() => autocompleteList.classList.add('hidden'), 200);
});

guessInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { autocompleteList.classList.add('hidden'); submitGuess(); }
  if (e.key === 'Escape') autocompleteList.classList.add('hidden');
});

/* ──────────────────────────────────────────
   Confirmar respuesta
────────────────────────────────────────── */
submitGuessBtn.addEventListener('click', submitGuess);

function submitGuess() {
  if (state.answered) return;
  const answer = guessInput.value.trim();
  if (!answer) { guessInput.focus(); return; }

  const song    = state.queue[state.currentIdx];
  const correct = isCorrectGuess(answer, song.title, song.artist);

  clearCountdown();
  stopAudio();
  resolveRound(correct);
}

/* ── Comparación flexible ── */
function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCorrectGuess(answer, title, artist) {
  const a = normalize(answer);
  const t = normalize(title);
  const ar= normalize(artist);

  if (a === t) return true;
  if (t.includes(a) && a.length >= 3) return true;
  if (a.includes(t) && t.length >= 3) return true;

  // Comprobar que al menos 70% de palabras del título estén en la respuesta
  const titleWords  = t.split(' ').filter(w => w.length > 2);
  const answerWords = a.split(' ');
  if (titleWords.length > 0) {
    const matches = titleWords.filter(w => answerWords.some(aw => aw.includes(w) || w.includes(aw)));
    if (matches.length / titleWords.length >= 0.7) return true;
  }

  return false;
}

/* ──────────────────────────────────────────
   Resolver ronda (correcto / incorrecto)
────────────────────────────────────────── */
function resolveRound(correct) {
  state.answered = true;
  const song = state.queue[state.currentIdx];

  let pts = 0;
  if (correct) {
    pts = POINTS[`phase${state.phase + 1}`] || 250;
    // Bonus racha
    state.streak++;
    if (state.streak >= 4) pts += POINTS.streak4;
    else if (state.streak >= 2) pts += POINTS.streak2;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.score  += pts;
    state.correct++;
    state.phasesUsed.push(state.phase + 1);
  } else {
    state.streak = 0;
    state.wrong++;
    state.phasesUsed.push(0); // no acertada
  }

  state.history.push({ song, correct, phase: state.phase + 1, points: pts });

  // Actualizar HUD
  hudScore.textContent  = state.score;
  hudStreak.textContent = `🔥 ${state.streak}`;

  // Deshabilitar inputs
  guessInput.disabled       = true;
  skipBtn.disabled          = true;
  giveUpBtn.disabled        = true;
  submitGuessBtn.disabled   = true;

  showFeedback(correct, song, pts);
}

/* ──────────────────────────────────────────
   Mostrar feedback
────────────────────────────────────────── */
function showFeedback(correct, song, pts) {
  feedbackCard.className = 'feedback-card ' + (correct ? 'correct' : 'wrong');
  feedbackResult.textContent = correct ? '✓' : '✗';

  feedbackSong.innerHTML = `
    <img class="feedback-cover" src="${song.cover || ''}" alt="" onerror="this.style.opacity=0" />
    <div class="feedback-song-info">
      <div class="feedback-song-title">${escHtml(song.title)}</div>
      <div class="feedback-song-artist">${state.settings.showArtist || !correct ? escHtml(song.artist) : ''}</div>
    </div>
  `;

  if (correct) {
    feedbackPoints.className = 'feedback-points positive';
    feedbackPoints.textContent = `+${pts} pts`;
  } else {
    feedbackPoints.className = 'feedback-points zero';
    feedbackPoints.textContent = '+0 pts';
  }

  // Cambiar texto del botón si es la última
  const isLast = state.currentIdx >= state.queue.length - 1;
  nextSongBtn.textContent = isLast ? 'Ver resultados →' : 'Siguiente canción →';

  feedbackArea.classList.remove('hidden');
  nextSongBtn.focus();
}

nextSongBtn.addEventListener('click', () => {
  const isLast = state.currentIdx >= state.queue.length - 1;
  if (isLast) {
    finishGame();
  } else {
    state.currentIdx++;
    loadSong();
  }
});

/* ──────────────────────────────────────────
   Countdown timer de respuesta
────────────────────────────────────────── */
function startCountdown(seconds) {
  state.countdownSec = seconds;
  hudTimer.textContent = seconds;
  hudTimerBlock.classList.remove('hidden');

  state.countdownInt = setInterval(() => {
    state.countdownSec--;
    hudTimer.textContent = state.countdownSec;
    if (state.countdownSec <= 5) hudTimer.style.color = 'var(--danger)';
    if (state.countdownSec <= 0) {
      clearCountdown();
      resolveRound(false);
    }
  }, 1000);
}

function clearCountdown() {
  clearInterval(state.countdownInt);
  hudTimer.textContent = state.settings.timerSeconds || 30;
  hudTimer.style.color = '';
}

/* ──────────────────────────────────────────
   FIN DE PARTIDA
────────────────────────────────────────── */
function finishGame() {
  stopAudio();
  clearCountdown();

  const total    = state.queue.length;
  const correct  = state.correct;
  const wrong    = state.wrong;
  const avgPhase = state.phasesUsed.filter(p => p > 0).length
    ? (state.phasesUsed.filter(p => p > 0).reduce((a,b) => a+b, 0) / state.phasesUsed.filter(p => p > 0).length).toFixed(1)
    : '-';

  // Guardar puntuación
  Storage.addScore({
    playlistId  : state.playlist.id,
    playlistName: `${state.playlist.emoji} ${state.playlist.name}`,
    score       : state.score,
    correct, wrong,
    bestStreak  : state.bestStreak,
    avgPhase,
    total,
  });

  // Trophy según resultado
  const pct = correct / total;
  resultsTrophy.textContent = pct >= 0.8 ? '🏆' : pct >= 0.5 ? '🥈' : '💪';
  resultsTitle.textContent  = pct >= 0.8 ? '¡Increíble!' : pct >= 0.5 ? '¡Bien hecho!' : '¡Sigue practicando!';

  resultsFinalScore.textContent = state.score;
  statCorrect.textContent    = correct;
  statWrong.textContent      = wrong;
  statBestStreak.textContent = state.bestStreak;
  statAvgPhase.textContent   = avgPhase;

  progressBarFill.style.width = '100%';

  renderHistorySongs();
  renderLeaderboard();
  showScreen('results');
}

/* ── Lista de canciones de la partida ── */
function renderHistorySongs() {
  historySongList.innerHTML = '';
  state.history.forEach(h => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <span class="history-status">${h.correct ? '✓' : '✗'}</span>
      <img class="history-cover" src="${h.song.cover || ''}" alt="" onerror="this.style.opacity=0" />
      <div class="history-info">
        <div class="history-song-title">${escHtml(h.song.title)}</div>
        <div class="history-song-artist">${escHtml(h.song.artist)}</div>
      </div>
      <span class="history-pts ${h.points > 0 ? 'pos' : 'zero'}">+${h.points}</span>
      <span class="history-phase">${h.correct ? `Fase ${h.phase}` : 'Fallo'}</span>
    `;
    historySongList.appendChild(item);
  });
}

/* ── Leaderboard ── */
function renderLeaderboard() {
  leaderboardList.innerHTML = '';
  const scores = Storage.getScores().slice(0, 10);

  if (!scores.length) {
    leaderboardList.innerHTML = '<div class="empty-state" style="padding:1.5rem"><p>Sin partidas aún</p></div>';
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const rankClasses = ['gold', 'silver', 'bronze'];

  scores.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'lb-item' + (i === 0 ? ' current-game' : '');
    const date = new Date(s.date).toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' });
    item.innerHTML = `
      <span class="lb-rank ${rankClasses[i] || ''}">${medals[i] || (i + 1)}</span>
      <div class="lb-info">
        <div class="lb-playlist">${escHtml(s.playlistName)}</div>
        <div class="lb-date">${date} · ${s.correct}/${s.total} acertadas</div>
      </div>
      <span class="lb-score">${s.score}</span>
    `;
    leaderboardList.appendChild(item);
  });
}

/* ──────────────────────────────────────────
   Jugar de nuevo / Volver al lobby
────────────────────────────────────────── */
playAgainBtn.addEventListener('click', () => {
  if (!state.playlist) { showScreen('lobby'); initLobby(); return; }
  const songs = state.playlist.songs.filter(s => s.preview);
  startGame(songs);
});

/* ──────────────────────────────────────────
   Util
────────────────────────────────────────── */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ──────────────────────────────────────────
   Init
────────────────────────────────────────── */
showScreen('lobby');
initLobby();
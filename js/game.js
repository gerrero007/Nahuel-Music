/* ═══════════════════════════════════════════════
   game.js  –  Motor del juego SoundGuess
   ═══════════════════════════════════════════════ */
 
/* ──────────────────────────────────────────
   Constantes
────────────────────────────────────────── */
const PHASE_DURATIONS = [0.3, 1, 5, 10];  // segundos por fase (índice 0-3)
 
const POINTS = {
  phase1  : 1000,
  phase2  : 750,
  phase3  : 500,
  phase4  : 250,
  streak2 : 100,
  streak4 : 200,
};
 
/* ──────────────────────────────────────────
   Estado del juego
────────────────────────────────────────── */
let state = {
  screen       : 'lobby',
  playlist     : null,
  queue        : [],
  currentIdx   : 0,
  phase        : 0,
  score        : 0,
  streak       : 0,
  bestStreak   : 0,
  correct      : 0,
  wrong        : 0,
  phasesUsed   : [],
  history      : [],
  audio        : null,
  phaseTimer   : null,
  countdownInt : null,
  countdownSec : 0,
  isPlaying    : false,
  answered     : false,
  settings     : {},
  // Playback progress bar
  playbackRAF  : null,
  playbackStart: null,
  playbackDur  : 0,
  // Listen preview
  previewAudio : null,
  previewPlaying: false,
  previewRAF   : null,
};
 
/* ──────────────────────────────────────────
   DOM refs
────────────────────────────────────────── */
const $ = id => document.getElementById(id);
 
const screenLobby          = $('screenLobby');
const screenGame           = $('screenGame');
const screenResults        = $('screenResults');
const lobbyPlaylists       = $('lobbyPlaylists');
const lobbyEmpty           = $('lobbyEmpty');
const lobbyActions         = $('lobbyActions');
const selectedPlaylistInfo = $('selectedPlaylistInfo');
const startGameBtn         = $('startGameBtn');
 
const hudSong         = $('hudSong');
const hudScore        = $('hudScore');
const hudStreak       = $('hudStreak');
const hudTimerBlock   = $('hudTimerBlock');
const hudTimer        = $('hudTimer');
const progressBarFill = $('progressBarFill');

const playbackProgressWrap = $('playbackProgressWrap');
const playbackProgressFill = $('playbackProgressFill');
 
const phaseSteps         = [null, $('phase1'), $('phase2'), $('phase3'), $('phase4')];
const phaseDurationLabel = $('phaseDuration');
 
const playerCard  = $('playerCard');
const waveform    = $('waveform');
const audioPlayer = $('audioPlayer');
const playBtn     = $('playBtn');
const playBtnIcon = $('playBtnIcon');
 
const guessInput       = $('guessInput');
const autocompleteList = $('autocompleteList');
const skipBtn          = $('skipBtn');
const giveUpBtn        = $('giveUpBtn');
const submitGuessBtn   = $('submitGuessBtn');
 
const feedbackArea      = $('feedbackArea');
const feedbackCard      = $('feedbackCard');
const feedbackResult    = $('feedbackResult');
const feedbackSong      = $('feedbackSong');
const feedbackPoints    = $('feedbackPoints');
const listenPreviewBtn  = $('listenPreviewBtn');
const listenProgressWrap = $('listenProgressWrap');
const listenProgressFill = $('listenProgressFill');
const nextSongBtn       = $('nextSongBtn');
 
const resultsTrophy     = $('resultsTrophy');
const resultsTitle      = $('resultsTitle');
const resultsFinalScore = $('resultsFinalScore');
const statCorrect       = $('statCorrect');
const statWrong         = $('statWrong');
const statBestStreak    = $('statBestStreak');
const statAvgPhase      = $('statAvgPhase');
const historySongList   = $('historySongList');
const leaderboardList   = $('leaderboardList');
const playAgainBtn      = $('playAgainBtn');
 
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
 
async function enrichWithDeezerPreviews(pl) {
  startGameBtn.disabled    = true;
  startGameBtn.textContent = '🔍 Buscando previews…';
 
  let updated = false;
 
  for (const song of pl.songs) {
    if (song.preview) continue;
    try {
      const results = await DeezerAPI.searchNormalized(`${song.title} ${song.artist}`, 3);
      if (results.length) {
        song.preview = results[0].preview;
        song.cover   = song.cover || results[0].cover;
        updated = true;
      }
    } catch { /* seguir */ }
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
  stopPreviewAudio();

  const total      = Math.min(state.settings.songsPerGame, songs.length);
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
  stopPreviewAudio();
  clearCountdown();
  resetPlaybackProgress();
 
  state.phase    = 0;
  state.answered = false;
  state.audioReady = false;
 
  const total   = state.queue.length;
  const current = state.currentIdx + 1;
 
  hudSong.textContent   = `${current} / ${total}`;
  hudScore.textContent  = state.score;
  hudStreak.textContent = `🔥 ${state.streak}`;
  progressBarFill.style.width = `${((current - 1) / total) * 100}%`;
 
  if (state.settings.timerEnabled) {
    hudTimerBlock.classList.remove('hidden');
  } else {
    hudTimerBlock.classList.add('hidden');
  }
 
  phaseSteps.forEach(el => { if (el) el.classList.remove('active', 'done'); });
  setActivePhase(0);
 
  playerCard.classList.remove('playing');
  waveform.classList.remove('playing');
  playBtnIcon.textContent = '▶';
  playBtn.classList.remove('loading', 'disabled');
  playBtn.disabled = false;
 
  feedbackArea.classList.add('hidden');
  guessInput.value    = '';
  guessInput.disabled = false;
  autocompleteList.classList.add('hidden');
 
  skipBtn.disabled        = false;
  giveUpBtn.disabled      = false;
  submitGuessBtn.disabled = false;
  skipBtn.style.display   = state.settings.skipEnabled ? '' : 'none';
 
  const song = state.queue[state.currentIdx];
  state.randomStart = Math.floor(Math.random() * 21);

  // FIX: Limpiar todos los listeners previos clonando el elemento
  const newAudio = audioPlayer.cloneNode(false);
  audioPlayer.parentNode.replaceChild(newAudio, audioPlayer);
  // Re-asignar la referencia global tras el reemplazo
  Object.defineProperty(window, 'audioPlayer', { value: newAudio, configurable: true, writable: true });

  _setupAudioElement(newAudio, song);
}

/* ──────────────────────────────────────────
   FIX: Configurar elemento de audio limpiamente
────────────────────────────────────────── */
function _setupAudioElement(audioEl, song) {
  audioEl.removeAttribute('crossorigin');
  audioEl.preload = 'auto';
  audioEl.volume  = 0;

  const onCanPlay = () => {
    audioEl.removeEventListener('canplay', onCanPlay);
    audioEl.removeEventListener('error',   onError);
    // Aplicar randomStart solo cuando el audio está realmente listo
    try {
      audioEl.currentTime = state.randomStart ?? 0;
    } catch (_) { /* algunos navegadores lanzan si la duración es desconocida */ }
    audioEl.volume = 0;
    state.audioReady = true;
  };

  const onError = () => {
    audioEl.removeEventListener('canplay', onCanPlay);
    audioEl.removeEventListener('error',   onError);
    // No marcamos audioReady = true; playCurrentPhase lo gestionará
    state.audioReady = false;
  };

  audioEl.addEventListener('canplay', onCanPlay);
  audioEl.addEventListener('error',   onError);

  audioEl.src = song.preview;
  audioEl.load();
}
 
/* ──────────────────────────────────────────
   PLAYBACK PROGRESS BAR
────────────────────────────────────────── */
function startPlaybackProgress(durationSec) {
  cancelAnimationFrame(state.playbackRAF);
  state.playbackDur   = durationSec * 1000; // ms
  state.playbackStart = performance.now();

  playbackProgressFill.style.transition = 'none';
  playbackProgressFill.style.width = '0%';
  playbackProgressWrap.classList.add('visible');

  void playbackProgressFill.offsetWidth; // fuerza reflow
  playbackProgressFill.style.transition = `width ${durationSec}s linear`;
  playbackProgressFill.style.width = '110%';
}

function resetPlaybackProgress() {
  cancelAnimationFrame(state.playbackRAF);
  playbackProgressFill.style.transition = 'none';
  playbackProgressFill.style.width = '0%';
  playbackProgressWrap.classList.remove('visible');
}

/* ──────────────────────────────────────────
   JUEGO: reproducir fragmento de la fase actual
────────────────────────────────────────── */
playBtn.addEventListener('click', () => {
  if (state.answered) return;
  if (state.isPlaying) { stopAudio(); return; }
  playCurrentPhase();
});
 
async function playCurrentPhase() {
  const dur  = PHASE_DURATIONS[state.phase];
  const song = state.queue[state.currentIdx];
 
  playBtn.classList.add('loading');
  playBtnIcon.textContent = '…';

  // FIX: Si el audio falló al cargar, intentar obtener una URL nueva de Deezer
  if (!state.audioReady) {
    try {
      const results = await DeezerAPI.searchNormalized(`${song.title} ${song.artist}`, 1);
      if (results.length && results[0].preview) {
        song.preview = results[0].preview;
      }
    } catch { /* usar URL existente */ }

    // Re-configurar el audio con la (posiblemente nueva) URL
    await new Promise(resolve => {
      const el = audioPlayer;
      el.removeAttribute('crossorigin');
      el.volume = 0;

      const onReady = () => {
        el.removeEventListener('canplay', onReady);
        el.removeEventListener('error',   onFail);
        try { el.currentTime = state.randomStart ?? 0; } catch (_) {}
        state.audioReady = true;
        resolve();
      };
      const onFail = () => {
        el.removeEventListener('canplay', onReady);
        el.removeEventListener('error',   onFail);
        resolve(); // continuar igualmente; play() fallará y mostrará toast
      };

      const LOAD_TIMEOUT = 6000;
      const timer = setTimeout(() => {
        el.removeEventListener('canplay', onReady);
        el.removeEventListener('error',   onFail);
        resolve();
      }, LOAD_TIMEOUT);

      // Limpiar el timeout si alguno de los listeners se dispara
      const cleanup = () => clearTimeout(timer);
      el.addEventListener('canplay', () => { cleanup(); onReady(); }, { once: true });
      el.addEventListener('error',   () => { cleanup(); onFail();  }, { once: true });

      el.src = song.preview;
      el.load();
    });
  }

  // Asegurarse de que currentTime está en el punto correcto antes de reproducir
  audioPlayer.volume = (state.settings.volume ?? 80) / 100;
  try {
    audioPlayer.currentTime = state.randomStart ?? 0;
  } catch (_) {}

  audioPlayer.play().then(() => {
    state.isPlaying = true;
    playBtn.classList.remove('loading');
    playBtnIcon.textContent = '■';
    playerCard.classList.add('playing');
    waveform.classList.add('playing');
    animateWave();

    startPlaybackProgress(dur);

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
    state.audioReady = false; // marcar para reintentar carga la próxima vez
    showToast('Audio no disponible para esta canción', 'error');
  });
}
 
function stopAudio() {
  clearTimeout(state.phaseTimer);
  audioPlayer.pause();
  try { audioPlayer.currentTime = state.randomStart ?? 0; } catch (_) {}
  state.isPlaying = false;
  playBtnIcon.textContent = '▶';
  playerCard.classList.remove('playing');
  waveform.classList.remove('playing');
  const fill = playbackProgressFill;
  const computed = getComputedStyle(fill).width;
  const wrapWidth = playbackProgressWrap.offsetWidth;
  if (wrapWidth > 0) {
    const pct = (parseFloat(computed) / wrapWidth) * 100;
    fill.style.transition = 'none';
    fill.style.width = pct + '%';
  }
}

/* ──────────────────────────────────────────
   LISTEN PREVIEW (feedback card)
────────────────────────────────────────── */
function stopPreviewAudio() {
  if (state.previewAudio) {
    state.previewAudio.pause();
    state.previewAudio.src = '';
    state.previewAudio = null;
  }
  state.previewPlaying = false;
  listenPreviewBtn.classList.remove('playing');
  listenPreviewBtn.querySelector('.listen-icon').textContent = '▶';
  listenPreviewBtn.querySelector('.listen-label').textContent = 'Escuchar canción';
  listenProgressFill.style.transition = 'none';
  listenProgressFill.style.width = '0%';
  listenProgressWrap.classList.remove('visible');
}

listenPreviewBtn.addEventListener('click', () => {
  if (!state.answered) return;

  if (state.previewPlaying) {
    stopPreviewAudio();
    return;
  }

  const song = state.queue[state.currentIdx];
  if (!song || !song.preview) {
    showToast('Preview no disponible', 'error');
    return;
  }

  stopPreviewAudio();

  const audio = new Audio();
  audio.src = song.preview;
  audio.volume = (state.settings.volume ?? 80) / 100;
  audio.crossOrigin = 'anonymous';

  state.previewAudio = audio;

  audio.addEventListener('canplay', () => {
    audio.play().then(() => {
      state.previewPlaying = true;
      listenPreviewBtn.classList.add('playing');
      listenPreviewBtn.querySelector('.listen-icon').textContent = '■';
      listenPreviewBtn.querySelector('.listen-label').textContent = 'Parar';

      const dur = audio.duration || 30;
      listenProgressWrap.classList.add('visible');
      listenProgressFill.style.transition = 'none';
      listenProgressFill.style.width = '0%';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          listenProgressFill.style.transition = `width ${dur}s linear`;
          listenProgressFill.style.width = '100%';
        });
      });

    }).catch(() => {
      showToast('No se pudo reproducir la preview', 'error');
      stopPreviewAudio();
    });
  }, { once: true });

  audio.addEventListener('ended', () => {
    stopPreviewAudio();
  });

  audio.addEventListener('error', () => {
    showToast('Preview no disponible', 'error');
    stopPreviewAudio();
  });

  audio.load();
});

/* ──────────────────────────────────────────
   Animación waveform
────────────────────────────────────────── */
function animateWave() {
  if (!state.isPlaying) return;
  waveform.querySelectorAll('span').forEach(b => {
    b.style.height = (6 + Math.random() * 38) + 'px';
  });
  setTimeout(animateWave, 120);
}
 
/* ──────────────────────────────────────────
   Fases visuales
────────────────────────────────────────── */
function setActivePhase(phaseIdx) {
  const labels = ['0.3 segundos', '1 segundo', '5 segundos', '10 segundos'];
  phaseDurationLabel.textContent = labels[phaseIdx];
  phaseSteps.forEach((el, i) => {
    if (!el) return;
    const p = i - 1;
    if      (p < phaseIdx)  el.className = 'phase-step done';
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
  resetPlaybackProgress();
  clearCountdown();
  guessInput.value = '';
  autocompleteList.classList.add('hidden');
  advancePhase();
});
 
giveUpBtn.addEventListener('click', () => {
  if (state.answered) return;
  stopAudio();
  resetPlaybackProgress();
  clearCountdown();
  resolveRound(false);
});
 
function advancePhase() {
  if (state.phase < PHASE_DURATIONS.length - 1) {
    state.phase++;
    setActivePhase(state.phase);
    showToast(`Fase ${state.phase + 1}: ${PHASE_DURATIONS[state.phase]} segundos`);
  } else {
    resolveRound(false);
  }
}
 
/* ──────────────────────────────────────────
   Autocomplete — todas las canciones de la playlist
   (no solo las seleccionadas para esta ronda)
────────────────────────────────────────── */
guessInput.addEventListener('input', () => {
  const val = guessInput.value.trim().toLowerCase();
 
  if (val.length < 1) {
    autocompleteList.classList.add('hidden');
    return;
  }

  // Buscar en TODAS las canciones de la playlist, no solo en state.queue
  const allSongs = state.playlist ? state.playlist.songs : state.queue;

  const matches = allSongs.filter(s => {
    const title  = normalize(s.title);
    const artist = normalize(s.artist);
    const query  = normalize(val);
    return title.includes(query) || artist.includes(query);
  }).slice(0, 8);
 
  if (!matches.length) {
    autocompleteList.classList.add('hidden');
    return;
  }
 
  renderAutocomplete(matches);
});
 
function renderAutocomplete(tracks) {
  autocompleteList.innerHTML = '';
  tracks.forEach(t => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.innerHTML = `
      <img src="${t.cover || ''}" alt="" onerror="this.style.opacity=0" />
      <span><strong>${escHtml(t.title)}</strong> — ${escHtml(t.artist)}</span>
    `;
    item.addEventListener('mousedown', e => {
      e.preventDefault();
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
  if (e.key === 'Enter')  { autocompleteList.classList.add('hidden'); submitGuess(); }
  if (e.key === 'Escape')   autocompleteList.classList.add('hidden');
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
 
  if (!correct) {
    showToast('Incorrecto, sigue intentándolo…', 'error');
    guessInput.value = '';
    guessInput.focus();
    autocompleteList.classList.add('hidden');
    stopAudio();
    resetPlaybackProgress();
    clearCountdown();
    advancePhase();
    return;
  }
 
  clearCountdown();
  stopAudio();
  resetPlaybackProgress();
  resolveRound(true);
}
 
/* ──────────────────────────────────────────
   FIX: Comparación flexible pero estricta
   
   Reglas (de más a menos estricta):
   1. Coincidencia exacta normalizada              → correcto
   2. El título está completamente contenido en la
      respuesta (y tiene ≥ 4 chars)                → correcto
   3. La respuesta está completamente contenida en
      el título Y cubre ≥ 60 % de sus caracteres   → correcto
   4. Coincidencia de palabras significativas:
      ≥ 80 % de las palabras del título (> 3 chars)
      aparecen en la respuesta con similitud alta   → correcto
────────────────────────────────────────── */
function normalize(str) {
  return String(str).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCorrectGuess(answer, title, artist) {
  const a = normalize(answer);
  const t = normalize(title);

  // Evitar respuestas vacías tras normalizar
  if (!a || !t) return false;

  // 1. Coincidencia exacta
  if (a === t) return true;

  // 2. El título completo está dentro de la respuesta
  //    (p.ej. el usuario escribió más de lo necesario)
  if (t.length >= 4 && a.includes(t)) return true;

  // 3. La respuesta está dentro del título Y es suficientemente larga
  //    Mínimo: 5 chars Y cubre al menos el 60 % del título
  if (a.length >= 5 && t.includes(a) && a.length / t.length >= 0.6) return true;

  // 4. Coincidencia de palabras significativas (> 3 chars)
  //    Umbral elevado al 80 % para evitar falsos positivos
  const titleWords = t.split(' ').filter(w => w.length > 3);
  if (titleWords.length > 0) {
    const answerWords = a.split(' ');
    const matched = titleWords.filter(tw =>
      answerWords.some(aw => {
        // Coincidencia exacta entre palabras individuales
        if (aw === tw) return true;
        // Una contiene a la otra, pero ambas deben tener ≥ 4 chars
        if (aw.length >= 4 && tw.length >= 4) {
          return aw.includes(tw) || tw.includes(aw);
        }
        return false;
      })
    );
    if (matched.length / titleWords.length >= 0.8) return true;
  }

  return false;
}
 
/* ──────────────────────────────────────────
   Resolver ronda
────────────────────────────────────────── */
function resolveRound(correct) {
  state.answered = true;
  const song = state.queue[state.currentIdx];
 
  let pts = 0;
  if (correct) {
    pts = POINTS[`phase${state.phase + 1}`] || 250;
    state.streak++;
    if      (state.streak >= 4) pts += POINTS.streak4;
    else if (state.streak >= 2) pts += POINTS.streak2;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.score  += pts;
    state.correct++;
    state.phasesUsed.push(state.phase + 1);
  } else {
    state.streak = 0;
    state.wrong++;
    state.phasesUsed.push(0);
  }
 
  state.history.push({ song, correct, phase: state.phase + 1, points: pts });
 
  hudScore.textContent  = state.score;
  hudStreak.textContent = `🔥 ${state.streak}`;
 
  guessInput.disabled       = true;
  skipBtn.disabled          = true;
  giveUpBtn.disabled        = true;
  submitGuessBtn.disabled   = true;
 
  showFeedback(correct, song, pts);
}
 
/* ──────────────────────────────────────────
   Feedback
────────────────────────────────────────── */
function showFeedback(correct, song, pts) {
  stopPreviewAudio();

  feedbackCard.className     = 'feedback-card ' + (correct ? 'correct' : 'wrong');
  feedbackResult.textContent = correct ? '✓' : '✗';
 
  feedbackSong.innerHTML = `
    <img class="feedback-cover" src="${song.cover || ''}" alt="" onerror="this.style.opacity=0" />
    <div class="feedback-song-info">
      <div class="feedback-song-title">${escHtml(song.title)}</div>
      <div class="feedback-song-artist">${state.settings.showArtist || !correct ? escHtml(song.artist) : ''}</div>
    </div>
  `;
 
  if (correct) {
    feedbackPoints.className   = 'feedback-points positive';
    feedbackPoints.textContent = `+${pts} pts`;
  } else {
    feedbackPoints.className   = 'feedback-points zero';
    feedbackPoints.textContent = '+0 pts';
  }
 
  const isLast = state.currentIdx >= state.queue.length - 1;
  nextSongBtn.textContent = isLast ? 'Ver resultados →' : 'Siguiente canción →';
 
  feedbackArea.classList.remove('hidden');
  nextSongBtn.focus();
}
 
nextSongBtn.addEventListener('click', () => {
  stopPreviewAudio();
  if (state.currentIdx >= state.queue.length - 1) {
    finishGame();
  } else {
    state.currentIdx++;
    loadSong();
  }
});
 
/* ──────────────────────────────────────────
   Countdown
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
      advancePhase();
    }
  }, 1000);
}
 
function clearCountdown() {
  clearInterval(state.countdownInt);
  hudTimer.textContent = state.settings.timerSeconds || 30;
  hudTimer.style.color = '';
}
 
/* ──────────────────────────────────────────
   Fin de partida
────────────────────────────────────────── */
function finishGame() {
  stopAudio();
  stopPreviewAudio();
  clearCountdown();
 
  const total    = state.queue.length;
  const correct  = state.correct;
  const wrong    = state.wrong;
  const phasesOk = state.phasesUsed.filter(p => p > 0);
  const avgPhase = phasesOk.length
    ? (phasesOk.reduce((a, b) => a + b, 0) / phasesOk.length).toFixed(1)
    : '-';

  // Historial compacto: solo título, artista, fase y acierto
  const songHistory = state.history.map(h => ({
    t: h.song.title,   // title
    a: h.song.artist,  // artist
    p: h.phase,        // phase (0 = no acertada)
    c: h.correct ? 1 : 0,
  }));
 
  Storage.addScore({
    playlistId  : state.playlist.id,
    playlistName: `${state.playlist.emoji} ${state.playlist.name}`,
    score       : state.score,
    correct, wrong,
    bestStreak  : state.bestStreak,
    avgPhase,
    total,
    songs       : songHistory,
  });
 
  const pct = correct / total;
  resultsTrophy.textContent = pct >= 0.8 ? '🏆' : pct >= 0.5 ? '🥈' : '💪';
  resultsTitle.textContent  = pct >= 0.8 ? '¡Increíble!' : pct >= 0.5 ? '¡Bien hecho!' : '¡Sigue practicando!';
 
  resultsFinalScore.textContent = state.score;
  statCorrect.textContent       = correct;
  statWrong.textContent         = wrong;
  statBestStreak.textContent    = state.bestStreak;
  statAvgPhase.textContent      = avgPhase;
 
  progressBarFill.style.width = '100%';
 
  renderHistorySongs();
  renderLeaderboard();
  showScreen('results');
}
 
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
 
function renderLeaderboard() {
  leaderboardList.innerHTML = '';
  const scores = [...Storage.getScores()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
 
  if (!scores.length) {
    leaderboardList.innerHTML = '<div class="empty-state" style="padding:1.5rem"><p>Sin partidas aún</p></div>';
    return;
  }
 
  const medals     = ['🥇', '🥈', '🥉'];
  const rankClasses = ['gold', 'silver', 'bronze'];
 
  const currentScore = state.score;
  const currentDate  = Date.now();
 
  scores.forEach((s, i) => {
    const item = document.createElement('div');
    const isCurrent = s.score === currentScore && (currentDate - s.date) < 5000;
    item.className = 'lb-item' + (isCurrent ? ' current-game' : '');
    const date = new Date(s.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

    // Botón expandir historial de canciones si hay datos
    const hasSongs = s.songs && s.songs.length > 0;

    item.innerHTML = `
      <span class="lb-rank ${rankClasses[i] || ''}">${medals[i] || (i + 1)}</span>
      <div class="lb-info">
        <div class="lb-playlist">${escHtml(s.playlistName)}</div>
        <div class="lb-date">${date} · ${s.correct}/${s.total} acertadas</div>
      </div>
      <div class="lb-right">
        <span class="lb-score">${s.score}</span>
        ${hasSongs ? `<button class="lb-expand-btn" aria-label="Ver canciones" title="Ver canciones">▾</button>` : ''}
      </div>
    `;

    if (hasSongs) {
      // Panel de canciones colapsable
      const songPanel = document.createElement('div');
      songPanel.className = 'lb-song-panel hidden';
      songPanel.innerHTML = s.songs.map(song => `
        <div class="lb-song-row">
          <span class="lb-song-status ${song.c ? 'ok' : 'fail'}">${song.c ? '✓' : '✗'}</span>
          <span class="lb-song-title">${escHtml(song.t)}</span>
          <span class="lb-song-artist">${escHtml(song.a)}</span>
          <span class="lb-song-phase">${song.c ? `F${song.p}` : '—'}</span>
        </div>
      `).join('');

      item.appendChild(songPanel);

      const expandBtn = item.querySelector('.lb-expand-btn');
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !songPanel.classList.contains('hidden');
        songPanel.classList.toggle('hidden', isOpen);
        expandBtn.textContent = isOpen ? '▾' : '▴';
        expandBtn.classList.toggle('open', !isOpen);
      });
    }

    leaderboardList.appendChild(item);
  });
}
 
/* ──────────────────────────────────────────
   Jugar de nuevo
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
 
/* ──────────────────────────────────────────
   Init
────────────────────────────────────────── */
showScreen('lobby');
initLobby();
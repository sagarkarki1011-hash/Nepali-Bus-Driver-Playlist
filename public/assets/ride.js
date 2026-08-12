const $ = (sel) => document.querySelector(sel);

const stage = {
  frames: $('#frames'),
  video: $('#bgvideo'),
  vignette: $('#vignette')
};

const ui = {
  hint: $('#sound-hint'),
  signboard: $('#signboard'),
  sbTitle: $('#sb-title'),
  sbSub: $('#sb-subtitle'),
  tassels: $('#tassels'),
  dash: $('#dash'),
  track: $('#track'),
  toggle: $('#toggle'),
  prev: $('#prev'),
  next: $('#next'),
  horn: $('#horn'),
  shuffle: $('#shuffle'),
  volume: $('#volume'),
  fs: $('#fs'),
  marquee: $('#marquee'),
  toast: $('#toast')
};

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let config = null;
let player = null;
let playerReady = false;
let unlocked = false; // audible, as opposed to merely playing muted

/* ---------------------------------------------------------------- toast */

let toastTimer;
function toast(html, ms = 7000) {
  ui.toast.innerHTML = html;
  ui.toast.classList.add('on');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => ui.toast.classList.remove('on'), ms);
}

/* ------------------------------------------------------------- the road */

const KEN_BURNS = [
  ['scale(1.06) translate(-1.2%, 0.8%)', 'scale(1.17) translate(1.4%, -1.0%)'],
  ['scale(1.15) translate(1.4%, -0.8%)', 'scale(1.05) translate(-1.0%, 1.1%)'],
  ['scale(1.05) translate(1.1%, 1.0%)', 'scale(1.16) translate(-1.3%, -0.9%)'],
  ['scale(1.16) translate(-1.4%, 0.6%)', 'scale(1.06) translate(1.0%, -1.1%)']
];

let slides = [];
let slideIndex = -1;
let slideTimer = null;
let pingPong = false;

function buildStage() {
  clearTimeout(slideTimer);
  stage.frames.textContent = '';
  slides = [];
  slideIndex = -1;
  pingPong = false;

  stage.vignette.classList.toggle('on', Boolean(config.chrome.vignette));

  if (config.video.enabled && config.video.url) {
    stage.video.src = config.video.url;
    stage.video.classList.add('on');
    stage.video.play().catch(() => {
      /* Muted loops are allowed to autoplay; if the browser still declines,
         the first click anywhere covers it. */
    });
    return;
  }

  stage.video.classList.remove('on');
  stage.video.removeAttribute('src');
  stage.video.load();

  if (!config.frames.length) {
    toast('No frames yet. Add some in <a href="/garage">the garage</a>.', 0);
    return;
  }

  slides = config.frames.map((frame, i) => {
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    if (i < 2) img.src = frame.url; // the rest load just before their turn
    img.dataset.src = frame.url;
    stage.frames.append(img);
    return img;
  });
}

function showSlide(index) {
  const { holdMs, fadeMs, kenBurns } = config.motion;
  const fade = config.motion.mode === 'crossfade' ? fadeMs : 0;
  const hold = Math.max(holdMs, 200);
  const drift = kenBurns && !reduceMotion;

  // One frame has nothing to cut to, so it breathes in and out instead. Restarting
  // the zoom from the top each cycle would snap; reversing it never does.
  if (slides.length === 1) {
    const only = slides[0];
    const [near, far] = KEN_BURNS[0];

    if (slideIndex < 0) {
      slideIndex = 0;
      only.style.transition = 'none';
      only.style.opacity = '1';
      only.style.transform = drift ? near : 'scale(1.04)';
      void only.offsetWidth;
      if (!drift) return; // nothing left to animate
    }

    pingPong = !pingPong;
    only.style.transition = `transform ${hold}ms ease-in-out`;
    only.style.transform = pingPong ? far : near;
    slideTimer = setTimeout(() => showSlide(0), hold);
    return;
  }

  const current = slides[index];
  const previous = slideIndex >= 0 && slideIndex !== index ? slides[slideIndex] : null;
  slideIndex = index;

  const upcoming = slides[(index + 1) % slides.length];
  if (upcoming && !upcoming.src) upcoming.src = upcoming.dataset.src;

  const [from, to] = KEN_BURNS[index % KEN_BURNS.length];

  current.style.transition = 'none';
  current.style.transform = drift ? from : 'scale(1.04)';
  void current.offsetWidth; // commit the reset before animating away from it

  current.style.transition = `opacity ${fade}ms linear, transform ${hold + fade}ms linear`;
  current.style.opacity = '1';
  current.style.transform = drift ? to : 'scale(1.04)';
  current.style.zIndex = '1';

  if (previous) {
    previous.style.zIndex = '0';
    previous.style.transition = `opacity ${fade}ms linear`;
    previous.style.opacity = '0';
  }

  slideTimer = setTimeout(() => showSlide((index + 1) % slides.length), hold);
}

function startRoad() {
  if (slides.length) showSlide(0);
}

/* ---------------------------------------------------------------- horn */

let audioCtx = null;
function honk() {
  ui.horn.classList.remove('blow');
  void ui.horn.offsetWidth;
  ui.horn.classList.add('blow');

  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2100;

    // A two-tone air horn: a fifth apart, with a little grit underneath.
    [233, 349, 466].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = i === 0 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(freq * 0.97, now);
      osc.frequency.linearRampToValueAtTime(freq, now + 0.07);
      osc.detune.value = i * 6;
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + 0.75);
    });

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.05);
    gain.gain.setValueAtTime(0.16, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

    filter.connect(gain).connect(audioCtx.destination);
  } catch {
    /* No Web Audio, no horn. The animation still plays. */
  }
}

/* -------------------------------------------------------------- youtube */

function loadYouTubeApi() {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => reject(new Error('YouTube script blocked'));
    document.head.append(script);
  });
}

function createPlayer() {
  player = new YT.Player('yt-player', {
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      iv_load_policy: 3,
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
      loop: 1,
      listType: 'playlist',
      list: config.playlistId
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerState,
      onError: onPlayerError
    }
  });
}

function onPlayerReady() {
  playerReady = true;
  player.setVolume(Number(ui.volume.value));
  if (config.shuffle) player.setShuffle(true);
  startMusic();
}

let titleTimer = null;
function onPlayerState(event) {
  const playing = event.data === YT.PlayerState.PLAYING;
  document.body.classList.toggle('playing', playing);
  refreshTitle();

  clearInterval(titleTimer);
  if (playing) titleTimer = setInterval(refreshTitle, 2000);
}

function refreshTitle() {
  try {
    const title = player?.getVideoData?.().title;
    if (title) ui.track.textContent = title;
  } catch {
    /* getVideoData throws until the first video is bound */
  }
}

const YT_ERRORS = {
  2: 'That playlist ID looks malformed.',
  5: 'This playlist will not play in an embedded player.',
  100: 'That playlist could not be found — it may be private or deleted.',
  101: 'The owner of these videos does not allow embedded playback.',
  150: 'The owner of these videos does not allow embedded playback.'
};

function onPlayerError(event) {
  const why = YT_ERRORS[event.data] || 'YouTube refused to play that playlist.';
  toast(`${why} Fix it in <a href="/garage">the garage</a>.`, 0);
}

function play() {
  if (config.shuffle) {
    const list = player.getPlaylist();
    if (list?.length) {
      player.setShuffle(true);
      player.playVideoAt(Math.floor(Math.random() * list.length));
      return;
    }
  }
  player.playVideo();
}

/**
 * No door to open: try to start audibly, and if the browser says no, roll the
 * playlist muted and wait for the first click anywhere to turn the sound on.
 * Chrome often permits unmuted autoplay on a site the visitor has been to before,
 * so returning listeners never see the hint at all.
 */
function startMusic() {
  if (!playerReady || !config.playlistId) return;
  try {
    player.unMute();
    player.setVolume(Number(ui.volume.value));
    play();
  } catch (err) {
    console.error(err);
  }

  setTimeout(() => {
    const blocked = player.getPlayerState() !== YT.PlayerState.PLAYING || player.isMuted();
    if (blocked) {
      try {
        player.mute();
        play();
      } catch {
        /* nothing more to try until a gesture arrives */
      }
      armUnlock();
    } else {
      unlocked = true;
    }
  }, 1400);

  // A truncated or private playlist ID never resolves — say so rather than sit silent.
  setTimeout(() => {
    const list = player?.getPlaylist?.();
    if (!list || !list.length) {
      toast(
        `Nothing loaded from playlist <code>${config.playlistId}</code>. YouTube playlist IDs are usually 34 characters — check it in <a href="/garage">the garage</a>.`,
        0
      );
    }
  }, 7000);
}

/* --------------------------------------------------------------- unlock */

const GESTURES = ['pointerdown', 'keydown', 'touchstart'];

function armUnlock() {
  if (unlocked) return;
  ui.hint.hidden = false;
  for (const event of GESTURES) {
    window.addEventListener(event, unlock, { once: true, passive: true });
  }
}

function unlock() {
  if (unlocked) return;
  unlocked = true;

  for (const event of GESTURES) window.removeEventListener(event, unlock);

  ui.hint.classList.add('gone');
  setTimeout(() => { ui.hint.hidden = true; }, 700);

  try {
    player.unMute();
    player.setVolume(Number(ui.volume.value));
    if (player.getPlayerState() !== YT.PlayerState.PLAYING) play();
  } catch (err) {
    console.error(err);
  }
}

/* -------------------------------------------------------------- controls */

let idleTimer;
function resetIdle() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(function tick() {
    // Don't hide the dashboard out from under a message, or while the visitor
    // still needs to be told where the sound is.
    if (ui.toast.classList.contains('on') || (!unlocked && !ui.hint.hidden)) {
      idleTimer = setTimeout(tick, 1000);
      return;
    }
    document.body.classList.add('idle');
  }, 3800);
}

function togglePlay() {
  if (!playerReady) return;
  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) player.pauseVideo();
  else player.playVideo();
}

function wireControls() {
  ui.hint.addEventListener('click', unlock);

  ui.toggle.addEventListener('click', togglePlay);
  ui.prev.addEventListener('click', () => playerReady && player.previousVideo());
  ui.next.addEventListener('click', () => playerReady && player.nextVideo());
  ui.horn.addEventListener('click', honk);

  ui.shuffle.addEventListener('click', () => {
    const on = ui.shuffle.getAttribute('aria-pressed') !== 'true';
    ui.shuffle.setAttribute('aria-pressed', String(on));
    if (playerReady) player.setShuffle(on);
  });

  ui.volume.addEventListener('input', () => {
    const value = Number(ui.volume.value);
    if (playerReady) player.setVolume(value);
    try {
      localStorage.setItem('nbdp:volume', String(value));
    } catch {
      /* private mode */
    }
  });

  ui.fs.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  for (const event of ['pointermove', 'pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(event, resetIdle, { passive: true });
  }

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;

    switch (e.code) {
      case 'Space': e.preventDefault(); togglePlay(); break;
      case 'ArrowRight': playerReady && player.nextVideo(); break;
      case 'ArrowLeft': playerReady && player.previousVideo(); break;
      case 'ArrowUp': e.preventDefault(); nudgeVolume(5); break;
      case 'ArrowDown': e.preventDefault(); nudgeVolume(-5); break;
      case 'KeyH': honk(); break;
      case 'KeyS': ui.shuffle.click(); break;
      case 'KeyF': ui.fs.click(); break;
      case 'KeyM': playerReady && (player.isMuted() ? player.unMute() : player.mute()); break;
      default: break;
    }
  });
}

function nudgeVolume(delta) {
  ui.volume.value = String(Math.min(100, Math.max(0, Number(ui.volume.value) + delta)));
  ui.volume.dispatchEvent(new Event('input'));
}

/* ------------------------------------------------------------------ boot */

function paintText() {
  document.title = config.title || 'नेपाल यातायात';
  ui.sbTitle.textContent = config.title;
  ui.sbSub.textContent = config.subtitle;
  ui.marquee.textContent = config.marquee;

  let volume = config.volume;
  try {
    const saved = localStorage.getItem('nbdp:volume');
    if (saved !== null) volume = Number(saved);
  } catch {
    /* private mode */
  }
  ui.volume.value = String(volume);
  ui.shuffle.setAttribute('aria-pressed', String(Boolean(config.shuffle)));
}

async function boot() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    config = await res.json();
  } catch {
    const { DEFAULT_CONFIG } = await import('/assets/fallback-config.js');
    config = DEFAULT_CONFIG;
  }

  paintText();
  buildStage();
  wireControls();

  // The ride starts the moment the page does — there is no door.
  ui.signboard.hidden = !config.chrome.signboard;
  if (config.chrome.signboard) requestAnimationFrame(() => ui.signboard.classList.add('on'));
  ui.tassels.classList.toggle('on', Boolean(config.chrome.tassels));

  startRoad();
  if (stage.video.src) stage.video.play().catch(() => {});
  resetIdle();

  if (!config.playlistId) {
    toast('No playlist set yet. Add one in <a href="/garage">the garage</a>.', 0);
    return;
  }

  try {
    await loadYouTubeApi();
    createPlayer(); // onReady starts the music
  } catch {
    toast('YouTube could not be reached, so there is no sound — the road still rolls.', 9000);
  }
}

boot();

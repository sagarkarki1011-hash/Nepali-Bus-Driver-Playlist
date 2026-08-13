const $ = (sel) => document.querySelector(sel);

const stage = {
  blur: $('#bgblur'),
  frames: $('#frames'),
  video: $('#bgvideo'),
  vignette: $('#vignette')
};

const ui = {
  brandTitle: $('#brand-title'),
  brandRoute: $('#brand-route'),
  clock: $('#clock'),
  clockSec: $('#clock-sec'),
  aboardN: $('#aboard-n'),

  eyebrow: $('#eyebrow'),
  heroTitle: $('#hero-title'),
  heroSub: $('#hero-sub'),
  pill: $('#pill'),
  pillMain: $('#pill-main'),
  pillSub: $('#pill-sub'),

  mascot: $('#mascot'),
  art: $('#art'),
  track: $('#track'),
  artist: $('#artist'),
  seek: $('#seek'),
  tCur: $('#t-cur'),
  tDur: $('#t-dur'),
  toggle: $('#toggle'),
  prev: $('#prev'),
  next: $('#next'),
  shuffle: $('#shuffle'),
  fs: $('#fs'),

  toast: $('#toast')
};

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let config = null;
let player = null;
let playerReady = false;
let unlocked = false; // audible, as opposed to merely playing muted

/* ─────────────────────────────────────────────── numbers & time */

const NE_DIGITS = '०१२३४५६७८९';
const ne = (value) => String(value).replace(/\d/g, (d) => NE_DIGITS[Number(d)]);

function clockText(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function tickClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  ui.clock.textContent = ne(`${hh}:${mm}`);
  ui.clockSec.textContent = ne(String(now.getSeconds()).padStart(2, '0'));
}

/* ─────────────────────────────────────────────── toast */

let toastTimer;
function toast(html, ms = 7000) {
  ui.toast.innerHTML = html;
  ui.toast.classList.add('on');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => ui.toast.classList.remove('on'), ms);
}

/* ─────────────────────────────────────────────── the road */

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

  // Backdrop for the letterbox bands on portrait screens.
  const backdrop = config.frames[0]?.url || '';
  stage.blur.style.backgroundImage = backdrop
    ? `url("${backdrop.replace(/["\\]/g, '\\$&')}")` // the path may hold spaces or quotes
    : '';
  stage.blur.classList.toggle('on', Boolean(backdrop));

  if (config.video.enabled && config.video.url) {
    stage.video.src = config.video.url;
    stage.video.classList.add('on');
    stage.video.play().catch(() => {
      /* Muted loops may autoplay; if refused, the first click covers it. */
    });
    return;
  }

  stage.video.classList.remove('on');
  stage.video.removeAttribute('src');
  stage.video.load();

  if (!config.frames.length) {
    toast('कुनै फ्रेम छैन। <a href="/garage">ग्यारेजमा</a> थप्नुहोस्।', 0);
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

  // One frame has nothing to cut to, so it breathes in and out instead.
  if (slides.length === 1) {
    const only = slides[0];
    const [near, far] = KEN_BURNS[0];

    if (slideIndex < 0) {
      slideIndex = 0;
      only.style.transition = 'none';
      only.style.opacity = '1';
      only.style.transform = drift ? near : 'scale(1.04)';
      void only.offsetWidth;
      if (!drift) return;
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
  void current.offsetWidth;

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

/* ─────────────────────────────────────────────── the horn */

let audioCtx = null;
function honk() {
  ui.mascot.classList.remove('blow');
  void ui.mascot.offsetWidth;
  ui.mascot.classList.add('blow');

  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2100;

    // A two-tone air horn, with a little grit underneath.
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

/* ─────────────────────────────────────────────── the pill */

const SLOGANS = [
  ['हर्न ओके प्लिज', 'HORN OK PLEASEEEE'],
  ['शुभ यात्रा', 'SAFE JOURNEY'],
  ['जय पशुपतिनाथ', 'JAI PASHUPATINATH'],
  ['भाडा तिरेर मात्र यात्रा गर्नुहोस्', 'TICKETS PLEASE'],
  ['बिस्तारै जानुहोस्', 'DRIVE SLOW'],
  ['ढुक्क भएर बस्नुहोस्', 'SIT BACK, RELAX']
];

let sloganIndex = 0;
let sloganTimer = null;

function paintSlogan() {
  const [main, sub] = SLOGANS[sloganIndex % SLOGANS.length];
  ui.pillMain.textContent = main;
  ui.pillSub.textContent = sub;
}

function rotateSlogans() {
  clearInterval(sloganTimer);
  sloganTimer = setInterval(() => {
    if (!unlocked) return; // the pill is asking for a tap; leave it alone
    sloganIndex += 1;
    paintSlogan();
  }, 7000);
}

function askForSound() {
  ui.pill.classList.add('calling');
  ui.pillMain.textContent = 'आवाजका लागि थिच्नुहोस्';
  ui.pillSub.textContent = 'TAP ANYWHERE FOR SOUND';
}

/* ─────────────────────────────────────────────── youtube */

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
      autoplay: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3,
      modestbranding: 1, playsinline: 1, rel: 0, loop: 1,
      listType: 'playlist', list: config.playlistId
    },
    events: { onReady: onPlayerReady, onStateChange: onPlayerState, onError: onPlayerError }
  });
}

function onPlayerReady() {
  playerReady = true;
  player.setVolume(startingVolume());
  if (config.shuffle) player.setShuffle(true);
  startMusic();
}

function startingVolume() {
  try {
    const saved = localStorage.getItem('nbdp:volume');
    if (saved !== null) return Number(saved);
  } catch {
    /* private mode */
  }
  return config.volume;
}

let pollTimer = null;
function onPlayerState(event) {
  const playing = event.data === YT.PlayerState.PLAYING;
  document.body.classList.toggle('playing', playing);
  refreshNowPlaying();

  clearInterval(pollTimer);
  if (playing) pollTimer = setInterval(refreshProgress, 500);
}

function refreshNowPlaying() {
  try {
    const data = player?.getVideoData?.();
    if (data?.title) {
      ui.track.textContent = data.title;
      ui.artist.textContent = data.author || '';
      document.title = `${data.title} · ${config.title}`;
    }
    if (data?.video_id) {
      ui.art.style.backgroundImage = `url("https://i.ytimg.com/vi/${data.video_id}/mqdefault.jpg")`;
    }

    const list = player?.getPlaylist?.();
    if (list?.length) {
      ui.aboardN.textContent = ne(list.length);
      const at = player.getPlaylistIndex?.();
      ui.eyebrow.textContent = Number.isInteger(at) && at >= 0
        ? `गीत ${ne(at + 1)} / ${ne(list.length)} · नन-स्टप`
        : `${ne(list.length)} गीत · नन-स्टप`;
    }
  } catch {
    /* the player throws until a video is bound */
  }
  refreshProgress();
}

let scrubbing = false;
function refreshProgress() {
  if (scrubbing || !playerReady) return;
  try {
    const duration = player.getDuration() || 0;
    const current = player.getCurrentTime() || 0;
    ui.tDur.textContent = clockText(duration);
    ui.tCur.textContent = clockText(current);

    const pct = duration > 0 ? (current / duration) * 100 : 0;
    ui.seek.value = String(Math.round(pct * 10));
    ui.seek.style.setProperty('--pct', `${pct}%`);
  } catch {
    /* not ready yet */
  }
}

const YT_ERRORS = {
  2: 'प्लेलिस्ट आईडी मिलेन।',
  5: 'यो प्लेलिस्ट एम्बेड प्लेयरमा बज्दैन।',
  100: 'प्लेलिस्ट भेटिएन — निजी वा हटाइएको हुन सक्छ।',
  101: 'यी भिडियो एम्बेड गर्न अनुमति छैन।',
  150: 'यी भिडियो एम्बेड गर्न अनुमति छैन।'
};

function onPlayerError(event) {
  const why = YT_ERRORS[event.data] || 'YouTube ले यो प्लेलिस्ट बजाउन मानेन।';
  toast(`${why} <a href="/garage">ग्यारेजमा</a> मिलाउनुहोस्।`, 0);
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
 * Try to start audibly. If the browser refuses, roll the playlist muted and let
 * the first click anywhere turn the sound on — no door in front of the site.
 */
function startMusic() {
  if (!playerReady || !config.playlistId) return;
  try {
    player.unMute();
    player.setVolume(startingVolume());
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
        `प्लेलिस्ट <code>${config.playlistId}</code> बाट केही आएन। YouTube का आईडी प्रायः ३४ अक्षरका हुन्छन् — <a href="/garage">ग्यारेजमा</a> जाँच्नुहोस्।`,
        0
      );
    }
  }, 7000);
}

/* ─────────────────────────────────────────────── unlock */

const GESTURES = ['pointerdown', 'keydown', 'touchstart'];

function armUnlock() {
  if (unlocked) return;
  askForSound();
  for (const event of GESTURES) {
    window.addEventListener(event, unlock, { once: true, passive: true });
  }
}

function unlock() {
  if (unlocked) return;
  unlocked = true;

  for (const event of GESTURES) window.removeEventListener(event, unlock);
  ui.pill.classList.remove('calling');
  paintSlogan();

  try {
    player.unMute();
    player.setVolume(startingVolume());
    if (player.getPlayerState() !== YT.PlayerState.PLAYING) play();
  } catch (err) {
    console.error(err);
  }
}

/* ─────────────────────────────────────────────── controls */

function togglePlay() {
  if (!playerReady) return;
  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) player.pauseVideo();
  else player.playVideo();
}

function nudgeVolume(delta) {
  if (!playerReady) return;
  const next = Math.min(100, Math.max(0, player.getVolume() + delta));
  player.setVolume(next);
  try {
    localStorage.setItem('nbdp:volume', String(next));
  } catch {
    /* private mode */
  }
}

function wireControls() {
  ui.pill.addEventListener('click', () => {
    if (!unlocked) return; // the window listener handles the unlock
    honk();
    sloganIndex += 1;
    paintSlogan();
  });
  ui.mascot.addEventListener('click', honk);

  ui.toggle.addEventListener('click', togglePlay);
  ui.prev.addEventListener('click', () => playerReady && player.previousVideo());
  ui.next.addEventListener('click', () => playerReady && player.nextVideo());

  ui.shuffle.addEventListener('click', () => {
    const on = ui.shuffle.getAttribute('aria-pressed') !== 'true';
    ui.shuffle.setAttribute('aria-pressed', String(on));
    if (playerReady) player.setShuffle(on);
  });

  ui.fs.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  // Seeking: hold off the poll while a finger or mouse is on the bar.
  ui.seek.addEventListener('pointerdown', () => { scrubbing = true; });
  ui.seek.addEventListener('input', () => {
    scrubbing = true;
    const pct = Number(ui.seek.value) / 10;
    ui.seek.style.setProperty('--pct', `${pct}%`);
    if (playerReady) ui.tCur.textContent = clockText((pct / 100) * (player.getDuration() || 0));
  });
  ui.seek.addEventListener('change', () => {
    if (playerReady) {
      const duration = player.getDuration() || 0;
      player.seekTo((Number(ui.seek.value) / 1000) * duration, true);
    }
    scrubbing = false;
  });

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

/* ─────────────────────────────────────────────── boot */

function paintText() {
  document.title = config.title || 'बस ड्राइवर';
  ui.brandTitle.textContent = config.title;
  ui.heroTitle.textContent = config.title;
  ui.brandRoute.textContent = config.subtitle;
  ui.heroSub.textContent = config.marquee;
  ui.shuffle.setAttribute('aria-pressed', String(Boolean(config.shuffle)));
  paintSlogan();
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

  document.body.classList.toggle('fill-screen', Boolean(config.chrome.fillScreen));

  tickClock();
  setInterval(tickClock, 1000);
  rotateSlogans();

  if (slides.length) showSlide(0);
  if (stage.video.src) stage.video.play().catch(() => {});

  if (!config.playlistId) {
    ui.track.textContent = 'कुनै प्लेलिस्ट छैन';
    toast('प्लेलिस्ट राखिएको छैन। <a href="/garage">ग्यारेजमा</a> थप्नुहोस्।', 0);
    return;
  }

  try {
    await loadYouTubeApi();
    createPlayer(); // onReady starts the music
  } catch {
    ui.track.textContent = 'YouTube सम्म पुग्न सकिएन';
    toast('YouTube सम्म पुग्न सकिएन — आवाज छैन, तर बाटो चलिरहेछ।', 9000);
  }
}

boot();

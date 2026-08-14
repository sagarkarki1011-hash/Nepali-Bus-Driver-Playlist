const $ = (sel) => document.querySelector(sel);

const stage = {
  blur: $('#bgblur'),
  frames: $('#frames'),
  video: $('#bgvideo'),
  video2: $('#bgvideo2'),
  vignette: $('#vignette')
};

const ui = {
  brandTitle: $('#brand-title'),
  brandRoute: $('#brand-route'),
  clock: $('#clock'),
  clockSec: $('#clock-sec'),
  aboardN: $('#aboard-n'),
  plate: $('#plate'),
  dateBs: $('#date-bs'),
  dateAd: $('#date-ad'),
  quote: $('#quote'),
  quoteRefresh: $('#quote-refresh'),

  eyebrow: $('#eyebrow'),
  heroTitle: $('#hero-title'),
  heroSub: $('#hero-sub'),
  pill: $('#pill'),
  pillMain: $('#pill-main'),
  vol: $('#vol'),
  volPop: $('#vol-pop'),
  volMute: $('#vol-mute'),
  volRange: $('#vol-range'),
  volOut: $('#vol-out'),
  queue: $('#queue'),
  queueSheet: $('#queue-sheet'),
  queueBack: $('#queue-back'),
  queueClose: $('#queue-close'),
  queueList: $('#queue-list'),
  queueCount: $('#queue-count'),
  queueNote: $('#queue-note'),
  ticket: $('#ticket'),
  ticketSheet: $('#ticket-sheet'),
  ticketClose: $('#ticket-close'),
  ticketBack: $('#ticket-back'),

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
  ui.clock.textContent = `${hh}:${mm}`;
  ui.clockSec.textContent = String(now.getSeconds()).padStart(2, '0');
}

/* ─────────────────────────────────────────────── the date */

// Bikram Sambat has no fixed month lengths, so it needs a lookup table.
// ANCHOR is Baisakh 1 of the first listed year; verify a reading against a
// printed patro before trusting it, and correct the anchor if it is off.
const BS_ANCHOR = { bsYear: 2083, ad: Date.UTC(2026, 3, 14) };
const BS_MONTHS = {
  2083: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 29, 31],
  2084: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 29, 31],
  2085: [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 29, 31],
  2086: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 29, 31],
  2088: [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 29, 31],
  2089: [30, 31, 32, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2090: [30, 31, 32, 32, 31, 30, 30, 30, 29, 30, 29, 31]
};
const BS_MONTH_NAMES = ['बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज',
                        'कार्तिक', 'मंसिर', 'पुष', 'माघ', 'फागुन', 'चैत'];

/** Returns a Devanagari BS date, or '' when the date falls outside the table. */
function bikramSambat(date) {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  let remaining = Math.floor((today - BS_ANCHOR.ad) / 86400000);
  if (remaining < 0) return '';

  let year = BS_ANCHOR.bsYear;
  while (BS_MONTHS[year]) {
    const yearLength = BS_MONTHS[year].reduce((a, b) => a + b, 0);
    if (remaining < yearLength) break;
    remaining -= yearLength;
    year += 1;
  }
  const months = BS_MONTHS[year];
  if (!months) return '';

  let month = 0;
  while (remaining >= months[month]) {
    remaining -= months[month];
    month += 1;
  }
  return `${BS_MONTH_NAMES[month]} ${ne(remaining + 1)}, ${ne(year)}`;
}

function paintDate() {
  const now = new Date();
  const bs = bikramSambat(now);
  ui.dateBs.textContent = bs;
  ui.dateBs.hidden = !bs;
  ui.dateAd.textContent = now.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
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

  // Backdrop for the letterbox bands on portrait screens. The still is the
  // starting point; once a clip has frames, sampleBackdrop swaps in the scene
  // that is actually on screen.
  const backdrop = config.frames[0]?.url || '';
  stage.blur.style.backgroundImage = backdrop
    ? `url("${backdrop.replace(/["\\]/g, '\\$&')}")` // the path may hold spaces or quotes
    : '';
  stage.blur.classList.toggle('on', Boolean(backdrop));

  const clips = config.video.sources?.length
    ? config.video.sources
    : (config.video.url ? [config.video.url] : []);

  if (config.video.enabled && clips.length) {
    startClips(clips);
    return;
  }

  stopClips();

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

/* ─────────────────────────────────────────────── the clip sequence */

/**
 * Two <video> layers taking turns: while one plays, the next clip is already
 * loading into the other, so the change is a crossfade rather than a black gap.
 */
let clipList = [];
let clipAt = 0;
let liveLayer = 0;

function layers() {
  return [stage.video, stage.video2];
}

/** Whichever layer is currently showing — used for sizing and placement. */
function activeMedia() {
  const shown = layers()[liveLayer];
  return shown?.src ? shown : slides[0];
}

function startClips(clips) {
  clipList = clips;
  clipAt = 0;
  liveLayer = 0;

  const [a, b] = layers();
  const single = clipList.length === 1;
  a.loop = single;
  b.loop = false;

  a.src = clipList[0];
  a.dataset.url = clipList[0];
  a.classList.add('on');
  b.classList.remove('on');
  a.play().catch(() => {
    /* Muted playback is normally allowed; the first click covers a refusal. */
  });

  if (!single) primeNext();
  for (const v of layers()) v.addEventListener('ended', onClipEnded);
}

function stopClips() {
  for (const v of layers()) {
    v.removeEventListener('ended', onClipEnded);
    v.classList.remove('on');
    v.removeAttribute('src');
    v.load();
  }
  clipList = [];
}

function primeNext() {
  if (clipList.length < 2) return;
  const next = layers()[1 - liveLayer];
  const url = clipList[(clipAt + 1) % clipList.length];
  if (next.dataset.url !== url) {
    next.dataset.url = url;
    next.preload = 'auto';
    next.src = url;
    next.load();
  }
}

function onClipEnded(event) {
  if (clipList.length < 2 || event.target !== layers()[liveLayer]) return;

  const current = layers()[liveLayer];
  const next = layers()[1 - liveLayer];

  next.currentTime = 0;
  next.play().catch(() => {});
  next.classList.add('on');
  current.classList.remove('on');

  liveLayer = 1 - liveLayer;
  clipAt = (clipAt + 1) % clipList.length;
  primeNext();
  placePill();
  sampleBackdrop();
}

/* ─────────────────────────────────────────────── the horn */

// Kept alongside the other media in public/frames so no new folder is needed.
const HORNS = ['/frames/horn1.mp3', '/frames/horn2.mp3', '/frames/horn3.mp3'];
const hornAudio = HORNS.map((src) => {
  const a = new Audio(src);
  a.preload = 'auto';
  a.volume = 0.9;
  return a;
});
let lastHorn = -1;

function honk() {
  for (const node of [ui.mascot, ui.pill]) {
    node.classList.remove('blow');
    void node.offsetWidth;
    node.classList.add('blow');
  }

  let pick = Math.floor(Math.random() * hornAudio.length);
  if (hornAudio.length > 1 && pick === lastHorn) pick = (pick + 1) % hornAudio.length;
  lastHorn = pick;

  const horn = hornAudio[pick];
  try {
    horn.currentTime = 0; // restart if it is mashed
    horn.play().catch(synthHonk);
  } catch {
    synthHonk();
  }
}

/** Fallback if the recordings cannot be played: the old synthesised air horn. */
let audioCtx = null;
function synthHonk() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2100;

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
    /* No Web Audio either. The animation still plays. */
  }
}

/**
 * Fitting the whole 16:9 frame onto a portrait phone leaves a band above and
 * below it. Rather than leave those dark, paint them with a heavily blurred
 * copy of the frame on screen. Tiny on purpose: it is blurred to mush anyway,
 * and this runs on a clip change rather than per frame.
 */
const backdropCanvas = document.createElement('canvas');
backdropCanvas.width = 64;
backdropCanvas.height = 36;

function sampleBackdrop() {
  const media = activeMedia();
  if (!media) return;
  const ready = media.videoWidth || media.naturalWidth;
  if (!ready) return;
  try {
    const ctx = backdropCanvas.getContext('2d');
    ctx.drawImage(media, 0, 0, backdropCanvas.width, backdropCanvas.height);
    stage.blur.style.backgroundImage = `url("${backdropCanvas.toDataURL('image/jpeg', 0.7)}")`;
    stage.blur.classList.add('on');
  } catch {
    /* Keep whichever backdrop is already up. */
  }
}

/** How far the fitted portrait framing zooms back in. 1 keeps the whole frame. */
function portraitZoom() {
  const zoom = Number(config?.chrome?.portraitZoom);
  return Number.isFinite(zoom) ? Math.min(4, Math.max(1, zoom)) : 1;
}

/* ─────────────────────────────────────────────── horn over the corner */

/**
 * Parks the horn on the bottom-right corner of the footage itself — which is
 * where the generator burns its logo in — rather than the corner of the screen.
 * With object-fit the rendered box rarely matches the element box, so measure it.
 */
function placePill() {
  const media = activeMedia();
  if (!media) return;

  // Reveal before measuring: a hidden element has no width, and the overlap
  // test below needs a real one.
  ui.pill.hidden = false;

  // Assume widescreen until the real dimensions arrive, so the horn is never
  // simply missing — placeHorn runs again on loadedmetadata with exact numbers.
  const natW = media.videoWidth || media.naturalWidth || 16;
  const natH = media.videoHeight || media.naturalHeight || 9;

  const cw = window.innerWidth;
  const ch = window.innerHeight;
  const portrait = matchMedia('(max-aspect-ratio: 1/1)').matches;
  const contained = portrait && !document.body.classList.contains('fill-screen');
  const scale = contained
    ? Math.min(cw / natW, ch / natH) * portraitZoom()
    : Math.max(cw / natW, ch / natH);

  const gapRight = Math.max(0, (cw - natW * scale) / 2);
  const gapBottom = Math.max(0, (ch - natH * scale) / 2);

  // Cropped, the corner of the footage is the corner of the screen, so sit just
  // inside it. Fitted, that corner has a blurred band under it — drop into the
  // band instead, clear of the picture rather than on top of it.
  const rest = contained
    ? Math.max(8, gapBottom - ui.pill.offsetHeight - 8)
    : gapBottom + 10;

  // Whatever happens, never slide under the player bar or the quote above it —
  // but only count something as in the way if it is actually beside the horn.
  // On a wide screen the quote is a narrow column in the middle and the horn is
  // out at the edge, so it is no obstacle at all.
  const right = cw - (gapRight + 10);
  const left = right - ui.pill.offsetWidth;
  const inTheWay = [document.querySelector('.player'), document.querySelector('.quote-wrap')]
    .map((node) => node?.getBoundingClientRect())
    .filter((box) => box?.height && box.left < right && box.right > left);

  const highest = inTheWay.length ? Math.min(...inTheWay.map((box) => box.top)) : ch;
  const floor = Math.max(0, ch - highest) + 8;

  ui.pill.style.right = `${Math.round(gapRight + 10)}px`;
  ui.pill.style.bottom = `${Math.round(Math.max(rest, floor))}px`;

  placeLede(gapBottom, contained);
}

/**
 * Fitted framing leaves a blurred band between the header and the footage.
 * Centre the heading block in it. Measured rather than guessed because the
 * band's depth moves with the clip's shape and the zoom setting.
 */
function placeLede(gapTop, contained) {
  const root = document.documentElement;
  const lede = document.querySelector('.hero-lede');
  const hero = document.querySelector('.hero');
  const phone = matchMedia('(max-width: 719px)').matches;

  if (!phone || !contained || !lede?.offsetHeight) {
    root.style.removeProperty('--lede-top');
    return;
  }

  const room = gapTop - hero.getBoundingClientRect().top - lede.offsetHeight;
  root.style.setProperty('--lede-top', `${Math.max(0, Math.round(room / 2))}px`);
}

function watchPillSpot() {
  const settle = () => { placePill(); sampleBackdrop(); };
  for (const v of layers()) v.addEventListener('loadeddata', settle);
  for (const v of layers()) v.addEventListener('loadedmetadata', placePill);
  for (const img of slides) img.addEventListener('load', settle);
  window.addEventListener('resize', placePill, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(placePill, 250));
  placePill();
}

/* ─────────────────────────────────────────────── tailgate quotes */

// Edit freely — one is drawn at random whenever the song or the listener
// count changes.
const QUOTES = [
  'गाडी चल्छ डिजेलले, ड्राइभर चल्छ मायाले।',
  'गाडी मेरो, बाटो सरकारको।',
  'साइड देऊ, सपना बोकेर हिँडेको छु।',
  'माया गर्नु, ओभरटेक नगर्नु।',
  'गाडी पुरानो होला, ड्राइभर होइन।',
  'जसलाई हतार छ, ऊ अगाडि जाओस्।',
  'साइड माग्ने धेरै, दिने कोही छैन।',
  'ड्राइभरको हातमा स्टेयरिङ, भाग्य भगवानको हातमा।',
  'जिन्दगीमा ब्रेक पनि चाहिन्छ।',
  'हर्न बजाऊ, बाटो तिम्रो बाउको होइन।',
  'बिस्तारै हिँड, घरमा कोही पर्खिरहेको छ।',
  'ओभरटेक नगर, इज्जत जाला।',
  'हर्न नबजाऊ, ड्राइभर निदाएको छैन।',
  'टाढा जानु छ भने धैर्य गर।',
  'पछाडि हेर्नु पर्दैन, अगाडि आउनुहोस्।',
  'हर्न बजाएर होइन, मन जितेर अगाडि बढ।',
  'यो बस होइन, जिन्दगीको यात्रा हो।',
  'पैसा कम, यात्रु धेरै।',
  'ड्राइभरलाई नजिस्काऊ, गन्तव्य टाढा छ।',
  'गाडी चल्छ डिजेलले, जिन्दगी चल्छ मायाले।'
];

let lastQuote = -1;
function rollQuote() {
  if (QUOTES.length === 0) return;

  let pick = Math.floor(Math.random() * QUOTES.length);
  if (QUOTES.length > 1 && pick === lastQuote) pick = (pick + 1) % QUOTES.length;
  lastQuote = pick;

  ui.quote.textContent = QUOTES[pick];
  ui.quote.classList.remove('fresh');
  void ui.quote.offsetWidth; // restart the fade rather than skip it
  ui.quote.classList.add('fresh');
}

/* ─────────────────────────────────────────────── the horn button */

/**
 * The horn doubles as the unlock affordance: the first tap anywhere starts the
 * audio, so a visitor who reaches for the horn gets the music as well. Only the
 * tooltip says so — the face of it stays a horn.
 */
function paintPill() {
  ui.pillMain.textContent = 'हर्न';
  ui.pill.title = unlocked ? 'हर्न बजाउनुहोस्' : 'हर्न — थिच्दा गीत पनि सुरु हुन्छ';
  ui.pill.setAttribute('aria-label', ui.pill.title);
}

/* ─────────────────────────────────────────────── volume */

function currentVolume() {
  try {
    const saved = localStorage.getItem('nbdp:volume');
    if (saved !== null) return Number(saved);
  } catch {
    /* private mode */
  }
  return config?.volume ?? 70;
}

function paintVolume(value) {
  ui.volRange.value = String(value);
  ui.volRange.style.setProperty('--pct', `${value}%`);
  ui.volOut.textContent = String(value);
}

function applyVolume(value, remember = true) {
  const v = Math.min(100, Math.max(0, Math.round(value)));
  paintVolume(v);
  if (playerReady) {
    player.setVolume(v);
    if (v > 0 && player.isMuted()) player.unMute();
  }
  document.body.classList.toggle('muted', v === 0 || (playerReady && player.isMuted()));
  if (remember) {
    try {
      localStorage.setItem('nbdp:volume', String(v));
    } catch {
      /* private mode */
    }
  }
}

function toggleMute() {
  if (!playerReady) return;
  if (player.isMuted() || player.getVolume() === 0) {
    player.unMute();
    const restore = currentVolume() || 60;
    applyVolume(restore);
  } else {
    player.mute();
    document.body.classList.add('muted');
  }
}

/* ─────────────────────────────────────────────── the passenger ticket */

const TICKET_FARE = 'रु. ६५०';        // placeholder — edit freely
const SEAT_ROWS = ['क', 'ख', 'ग', 'घ'];

// One seat per visit, so reopening the ticket does not reshuffle it.
const seatNumber = `${SEAT_ROWS[Math.floor(Math.random() * SEAT_ROWS.length)]}${ne(Math.floor(Math.random() * 12) + 1)}`;

function paintTicket() {
  $('#ticket-heading').textContent = config.title;
  $('#ticket-route').textContent = config.subtitle;
  $('#ticket-plate').textContent = config.plate || '—';
  $('#ticket-seat').textContent = seatNumber;
  $('#ticket-fare').textContent = TICKET_FARE;

  const bs = ui.dateBs.textContent;
  const ad = ui.dateAd.textContent;
  $('#ticket-date').textContent = bs ? `${bs} · ${ad}` : ad;
}

let ticketReturnFocus = null;
function openTicket() {
  paintTicket();
  ticketReturnFocus = document.activeElement;
  ui.ticketSheet.hidden = false;
  ui.ticketClose.focus();
}

function closeTicket() {
  ui.ticketSheet.hidden = true;
  ticketReturnFocus?.focus?.();
}

/* ─────────────────────────────────────────────── the playlist */

/**
 * The IFrame API gives us the playlist as bare video ids and the title of only
 * the one playing. /api/tracks fills in the rest, a chunk at a time so a long
 * playlist paints as it arrives rather than waiting on the lot.
 */
const CHUNK = 50;
const titles = new Map(); // video id -> { title, author }
let queueIds = [];
let titlesWanted = false;
let queueReturnFocus = null;

function playlistIds() {
  try {
    return player?.getPlaylist?.() || [];
  } catch {
    return [];
  }
}

function nowPlayingIndex() {
  try {
    const at = player?.getPlaylistIndex?.();
    return Number.isInteger(at) && at >= 0 ? at : -1;
  } catch {
    return -1;
  }
}

function openQueue() {
  queueIds = playlistIds();
  queueReturnFocus = document.activeElement;
  ui.queueSheet.hidden = false;
  ui.queue.setAttribute('aria-expanded', 'true');

  drawQueue();
  ui.queueClose.focus();
  scrollToNowPlaying();
  fetchTitles();
}

function closeQueue() {
  ui.queueSheet.hidden = true;
  ui.queue.setAttribute('aria-expanded', 'false');
  queueReturnFocus?.focus?.();
}

function drawQueue() {
  if (!queueIds.length) {
    ui.queueList.textContent = '';
    ui.queueCount.textContent = playerReady ? 'सूची खाली छ' : 'प्लेलिस्ट पर्खिँदै…';
    ui.queueNote.textContent = playerReady
      ? ''
      : 'प्लेलिस्ट लोड भएपछि गीतहरू यहाँ देखिनेछन्।';
    return;
  }

  ui.queueCount.textContent = `${ne(queueIds.length)} गीत · ${queueIds.length} TRACKS`;
  ui.queueNote.textContent = '';

  const at = nowPlayingIndex();
  const rows = queueIds.map((id, i) => {
    const known = titles.get(id);
    const li = document.createElement('li');
    li.className = i === at ? 'qrow now' : 'qrow';
    li.dataset.id = id;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qrow-btn';
    button.dataset.index = String(i);

    const n = document.createElement('span');
    n.className = 'qrow-n';
    // Both live in the row; CSS shows the bars only on the playing one.
    const num = document.createElement('span');
    num.className = 'qrow-num';
    num.textContent = ne(i + 1);
    const bars = document.createElement('span');
    bars.className = 'qrow-bars';
    bars.setAttribute('aria-hidden', 'true');
    bars.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
    n.append(num, bars);

    const art = document.createElement('span');
    art.className = 'qrow-art';
    art.style.backgroundImage = `url("https://i.ytimg.com/vi/${id}/mqdefault.jpg")`;

    const copy = document.createElement('span');
    copy.className = 'qrow-copy';
    const title = document.createElement('span');
    title.className = 'qrow-title';
    // textContent throughout: these strings come from YouTube, not from us.
    title.textContent = known?.title || `गीत ${ne(i + 1)}`;
    const by = document.createElement('span');
    by.className = 'qrow-by';
    by.textContent = known?.author || (known ? '' : '…');
    copy.append(title, by);

    button.append(n, art, copy);
    li.append(button);
    return li;
  });

  ui.queueList.replaceChildren(...rows);
}

/** Repaints just the highlight, so the list does not jump while it is open. */
function markNowPlaying() {
  if (ui.queueSheet.hidden) return;
  const at = nowPlayingIndex();
  [...ui.queueList.children].forEach((li, i) => li.classList.toggle('now', i === at));
}

function scrollToNowPlaying() {
  const row = ui.queueList.querySelector('.qrow.now');
  row?.scrollIntoView({ block: 'center' });
}

async function fetchTitles() {
  if (titlesWanted || !queueIds.length) return;
  titlesWanted = true;

  const missing = queueIds.filter((id) => !titles.has(id));
  try {
    for (let i = 0; i < missing.length; i += CHUNK) {
      const res = await fetch('/api/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: missing.slice(i, i + CHUNK) })
      });
      if (!res.ok) throw new Error(`tracks ${res.status}`);

      const { tracks } = await res.json();
      for (const [id, track] of Object.entries(tracks || {})) titles.set(id, track);
      if (!ui.queueSheet.hidden) drawQueue();
    }
  } catch {
    titlesWanted = false; // let the next open try again
    if (!ui.queueSheet.hidden && !titles.size) {
      ui.queueNote.textContent = 'गीतका नाम ल्याउन सकिएन — तर बजाउन मिल्छ।';
    }
  }
}

/* ─────────────────────────────────────────────── who else is listening */

function sessionId() {
  try {
    let id = sessionStorage.getItem('nbdp:sid');
    if (!id) {
      id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/-/g, '');
      sessionStorage.setItem('nbdp:sid', id);
    }
    return id;
  } catch {
    return String(Math.random()).slice(2) + Date.now();
  }
}

let lastCount = null;
async function pingPresence() {
  try {
    const res = await fetch('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sessionId() })
    });
    const body = await res.json();
    // Without a store there is no cross-visitor count; you are the one we know of.
    const count = body.live && body.count ? body.count : 1;
    if (count !== lastCount) {
      if (lastCount !== null) {
        rollQuote();
        ui.aboardN.classList.remove('bump');
        void ui.aboardN.offsetWidth;
        ui.aboardN.classList.add('bump');
      }
      lastCount = count;
    }
    ui.aboardN.textContent = String(count);
  } catch {
    ui.aboardN.textContent = String(lastCount ?? 1);
  }
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
  player.setVolume(currentVolume());
  paintVolume(currentVolume());
  if (config.shuffle) player.setShuffle(true);
  startMusic();
}

let pollTimer = null;
function onPlayerState(event) {
  const playing = event.data === YT.PlayerState.PLAYING;
  document.body.classList.toggle('playing', playing);
  refreshNowPlaying();

  clearInterval(pollTimer);
  if (playing) pollTimer = setInterval(refreshProgress, 500);
}

let lastVideoId = null;
function refreshNowPlaying() {
  try {
    const data = player?.getVideoData?.();
    if (data?.video_id && data.video_id !== lastVideoId) {
      lastVideoId = data.video_id;
      rollQuote();
    }
    if (data?.title) {
      ui.track.textContent = data.title;
      ui.artist.textContent = data.author || '';
      document.title = `${data.title} · ${config.title}`;
    }
    if (data?.video_id) {
      ui.art.style.backgroundImage = `url("https://i.ytimg.com/vi/${data.video_id}/mqdefault.jpg")`;
    }

    // Keep the open list pointing at the right row without redrawing it.
    markNowPlaying();

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
    player.setVolume(currentVolume());
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
        `प्लेलिस्ट <code>${config.playlistId}</code> बाट केही आएन — निजी वा खाली हुन सक्छ। <a href="/garage">ग्यारेजमा</a> जाँच्नुहोस्।`,
        0
      );
    }
  }, 7000);
}

/* ─────────────────────────────────────────────── unlock */

const GESTURES = ['pointerdown', 'keydown', 'touchstart'];

function armUnlock() {
  if (unlocked) return;
  ui.pill.classList.add('calling');
  paintPill();
  for (const event of GESTURES) {
    window.addEventListener(event, unlock, { once: true, passive: true });
  }
}

function unlock() {
  if (unlocked) return;
  unlocked = true;

  for (const event of GESTURES) window.removeEventListener(event, unlock);
  ui.pill.classList.remove('calling');
  paintPill();

  try {
    player.unMute();
    player.setVolume(currentVolume());
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
  applyVolume(player.getVolume() + delta);
}

function showVolume(open) {
  ui.volPop.hidden = !open;
  ui.vol.setAttribute('aria-expanded', String(open));
  if (open) ui.volRange.focus();
}

function wireControls() {
  // The window-level gesture listener handles the unlock, so this only honks.
  ui.pill.addEventListener('click', honk);

  ui.vol.addEventListener('click', () => showVolume(ui.volPop.hidden));
  ui.volMute.addEventListener('click', toggleMute);
  ui.volRange.addEventListener('input', () => applyVolume(Number(ui.volRange.value)));

  // Anywhere else closes it — but not a press inside the flyout itself.
  document.addEventListener('pointerdown', (event) => {
    if (ui.volPop.hidden) return;
    if (event.target.closest('#vol-pop, #vol')) return;
    showVolume(false);
  });

  ui.queue.addEventListener('click', () => (ui.queueSheet.hidden ? openQueue() : closeQueue()));
  ui.queueClose.addEventListener('click', closeQueue);
  ui.queueBack.addEventListener('click', closeQueue);

  // One listener on the list rather than one per row: the list is redrawn each
  // time titles arrive, and rebinding hundreds of rows each time is waste.
  ui.queueList.addEventListener('click', (event) => {
    const button = event.target.closest('.qrow-btn');
    if (!button || !playerReady) return;
    player.playVideoAt(Number(button.dataset.index));
    player.playVideo();
  });

  ui.ticket.addEventListener('click', openTicket);
  ui.ticketClose.addEventListener('click', closeTicket);
  ui.ticketBack.addEventListener('click', closeTicket);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!ui.ticketSheet.hidden) closeTicket();
    if (!ui.queueSheet.hidden) closeQueue();
    if (!ui.volPop.hidden) { showVolume(false); ui.vol.focus(); }
  });
  ui.quoteRefresh.addEventListener('click', rollQuote);
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
      case 'KeyM': toggleMute(); break;
      case 'KeyV': ui.vol.click(); break;
      case 'KeyQ': ui.queueSheet.hidden ? openQueue() : closeQueue(); break;
      case 'KeyT': ui.ticketSheet.hidden ? openTicket() : closeTicket(); break;
      default: break;
    }
  });
}

/* ─────────────────────────────────────────────── boot */

function paintText() {
  document.title = config.title || 'नेपाल यातायात';
  ui.brandTitle.textContent = config.title;
  // Falls back to the operator name for configs saved before heading existed.
  ui.heroTitle.textContent = config.heading || config.title;
  ui.brandRoute.textContent = config.subtitle;
  ui.plate.textContent = config.plate || '';
  ui.plate.hidden = !config.plate;
  ui.heroSub.textContent = config.marquee;
  ui.shuffle.setAttribute('aria-pressed', String(Boolean(config.shuffle)));
  paintPill();
  paintVolume(currentVolume());
  rollQuote();
}

async function boot() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    config = await res.json();
  } catch {
    const { DEFAULT_CONFIG } = await import('/assets/siteconfig.js');
    config = DEFAULT_CONFIG;
  }

  paintText();
  buildStage();
  wireControls();

  document.body.classList.toggle('fill-screen', Boolean(config.chrome.fillScreen));
  document.documentElement.style.setProperty('--pzoom', String(portraitZoom()));

  tickClock();
  setInterval(tickClock, 1000);
  paintDate();
  setInterval(paintDate, 60_000);

  pingPresence();
  setInterval(pingPresence, 25_000);

  if (slides.length) showSlide(0);
  if (stage.video.src) stage.video.play().catch(() => {});
  if (stage.video2.src && liveLayer === 1) stage.video2.play().catch(() => {});
  watchPillSpot();

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

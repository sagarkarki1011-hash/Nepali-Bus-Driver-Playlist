import { DEFAULT_CONFIG, MOTION_MODES, MAX_FRAMES } from './defaults.js';

const TEXT_MAX = 140;
const ALT_MAX = 200;

class BadInput extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

function text(value, fallback, max = TEXT_MAX) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') throw new BadInput('Expected a text value.');
  return value.trim().slice(0, max);
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function int(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Accepts a full YouTube URL or a bare id and returns the playlist id.
 * Returns '' when there is nothing usable.
 */
export function parsePlaylistId(input) {
  if (typeof input !== 'string') return '';
  const raw = input.trim();
  if (!raw) return '';

  let candidate = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\./, '');
      if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(host)) return '';
      candidate = url.searchParams.get('list') || '';
      if (!candidate && url.pathname.startsWith('/playlist')) return '';
    } catch {
      return '';
    }
  }

  return /^[A-Za-z0-9_-]{2,64}$/.test(candidate) ? candidate : '';
}

/** Only same-origin paths and https URLs are allowed, so a saved config can't inject a scheme. */
function mediaUrl(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw.slice(0, 2048);
  if (/^https:\/\/[^\s]+$/i.test(raw)) return raw.slice(0, 2048);
  throw new BadInput(`Media links must be https:// or start with / — got "${raw.slice(0, 40)}".`);
}

export function sanitizeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadInput('Expected a config object.');
  }

  const framesIn = input.frames === undefined ? DEFAULT_CONFIG.frames : input.frames;
  if (!Array.isArray(framesIn)) throw new BadInput('"frames" must be a list.');
  if (framesIn.length > MAX_FRAMES) {
    throw new BadInput(`That is ${framesIn.length} frames — the limit is ${MAX_FRAMES}.`);
  }

  const frames = framesIn
    .map((frame) => {
      const url = mediaUrl(typeof frame === 'string' ? frame : frame?.url);
      if (!url) return null;
      return { url, alt: text(typeof frame === 'string' ? '' : frame?.alt, '', ALT_MAX) };
    })
    .filter(Boolean);

  const motionIn = input.motion || {};
  const mode = MOTION_MODES.includes(motionIn.mode) ? motionIn.mode : DEFAULT_CONFIG.motion.mode;

  const videoIn = input.video || {};
  const videoUrl = mediaUrl(videoIn.url);

  return {
    title: text(input.title, DEFAULT_CONFIG.title),
    subtitle: text(input.subtitle, DEFAULT_CONFIG.subtitle),
    plate: text(input.plate, DEFAULT_CONFIG.plate, 24),
    marquee: text(input.marquee, DEFAULT_CONFIG.marquee),
    playlistId: parsePlaylistId(input.playlistId),
    shuffle: bool(input.shuffle, DEFAULT_CONFIG.shuffle),
    volume: int(input.volume, DEFAULT_CONFIG.volume, 0, 100),
    frames,
    video: { url: videoUrl, enabled: bool(videoIn.enabled, false) && Boolean(videoUrl) },
    motion: {
      mode,
      holdMs: int(motionIn.holdMs, DEFAULT_CONFIG.motion.holdMs, 200, 120000),
      fadeMs: int(motionIn.fadeMs, DEFAULT_CONFIG.motion.fadeMs, 0, 15000),
      kenBurns: bool(motionIn.kenBurns, DEFAULT_CONFIG.motion.kenBurns)
    },
    chrome: {
      vignette: bool(input.chrome?.vignette, DEFAULT_CONFIG.chrome.vignette),
      fillScreen: bool(input.chrome?.fillScreen, DEFAULT_CONFIG.chrome.fillScreen)
    },
    updatedAt: new Date().toISOString()
  };
}

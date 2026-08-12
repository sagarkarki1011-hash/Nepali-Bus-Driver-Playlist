// The one place defaults live. The API imports this to fill gaps in a stored
// config, and the ride imports it directly if /api/config is unreachable.
export const DEFAULT_CONFIG = {
  title: 'नेपाल यातायात',
  subtitle: 'Kathmandu — Pokhara',
  marquee: 'जय पशुपतिनाथ',
  playlistId: 'PLJDMn5uExVKg',
  shuffle: true,
  volume: 70,
  frames: [
    { url: '/frames/road-1.svg', alt: 'Approaching the ridge' },
    { url: '/frames/road-2.svg', alt: 'The valley opens up' },
    { url: '/frames/road-3.svg', alt: 'Terraces below the road' },
    { url: '/frames/road-4.svg', alt: 'Peaks at the last bend' }
  ],
  video: { url: '', enabled: false },
  motion: {
    mode: 'crossfade', // crossfade | flipbook | cut
    holdMs: 7000,
    fadeMs: 2500,
    kenBurns: true
  },
  chrome: {
    signboard: true,
    tassels: false,
    vignette: true
  }
};

export const MOTION_MODES = ['crossfade', 'flipbook', 'cut'];
export const MAX_FRAMES = 60;

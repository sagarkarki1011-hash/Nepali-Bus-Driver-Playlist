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
    { url: '/frames/nepal-yatayat.png%20.PNG', alt: 'From the cab, somewhere above the valley' }
  ],
  video: { url: '', enabled: false },
  motion: {
    mode: 'crossfade', // crossfade | flipbook | cut
    holdMs: 12000, // a lone frame reverses its zoom over this, so slower reads better
    fadeMs: 2500,
    kenBurns: true
  },
  chrome: {
    // The cab photo already has its own signboard and tassels painted in.
    signboard: false,
    tassels: false,
    vignette: true
  }
};

export const MOTION_MODES = ['crossfade', 'flipbook', 'cut'];
export const MAX_FRAMES = 60;

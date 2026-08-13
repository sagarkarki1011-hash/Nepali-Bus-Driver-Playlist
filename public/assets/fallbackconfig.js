// The one place defaults live. The API imports this to fill gaps in a stored
// config, and the ride imports it directly if /api/config is unreachable.
export const DEFAULT_CONFIG = {
  title: 'बस ड्राइवर',
  subtitle: 'म १ प · मोरङ — काठमाडौँ',
  marquee: 'राति भरि राजमार्गमा',
  playlistId: 'PLJDMn5uExVKg',
  shuffle: true,
  volume: 70,
  frames: [
    { url: '/frames/nepal-yatayat.png', alt: 'From the cab, somewhere above the valley' }
  ],
  video: { url: '/frames/ride.mp4', enabled: true },
  motion: {
    mode: 'crossfade', // crossfade | flipbook | cut
    holdMs: 12000, // a lone frame reverses its zoom over this, so slower reads better
    fadeMs: 2500,
    kenBurns: true
  },
  chrome: {
    vignette: true,
    // Portrait phones are far taller than a 16:9 clip is. false shows the whole
    // frame over a blurred backdrop; true crops it to fill the screen edge to edge.
    fillScreen: true
  }
};

export const MOTION_MODES = ['crossfade', 'flipbook', 'cut'];
export const MAX_FRAMES = 60;

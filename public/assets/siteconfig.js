// The one place defaults live. The API imports this to fill gaps in a stored
// config, and the ride imports it directly if /api/config is unreachable.
export const DEFAULT_CONFIG = {
  title: 'नेपाल यातायात',
  subtitle: 'Morang — Kathmandu',
  plate: 'MA 1 KHA 6969',
  marquee: 'जय पशुपतिनाथ',
  playlistId: 'PLJDMn5uExVKg',
  shuffle: true,
  volume: 70,
  frames: [
    { url: '/frames/nepal-yatayat.png%20.PNG', alt: 'From the cab, somewhere above the valley' }
  ],
  video: {
    enabled: true,
    // Played in order, then round again. url is the single-clip fallback.
    sources: ['/frames/road1.mp4', '/frames/road2.mp4', '/frames/road3.mp4'],
    url: '/frames/ride.mp4'
  },
  motion: {
    mode: 'crossfade', // crossfade | flipbook | cut
    holdMs: 12000, // a lone frame reverses its zoom over this, so slower reads better
    fadeMs: 2500,
    kenBurns: true
  },
  chrome: {
    vignette: true,
    // Portrait phones are far taller than a 16:9 clip is, so one has to give:
    // true fills the screen edge to edge and crops the sides to about a quarter
    // of the frame; false shows the whole frame over a blurred backdrop instead.
    fillScreen: true
  }
};

export const MOTION_MODES = ['crossfade', 'flipbook', 'cut'];
export const MAX_FRAMES = 60;

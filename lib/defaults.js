// Re-exported so the API and the browser share one definition. The real values
// live in public/assets/siteconfig.js because the browser has to fetch it
// directly when /api/config is unreachable.
export { DEFAULT_CONFIG, MOTION_MODES, MAX_FRAMES } from '../public/assets/siteconfig.js';

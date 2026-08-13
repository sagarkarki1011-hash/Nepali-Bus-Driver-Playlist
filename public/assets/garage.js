import { DEFAULT_CONFIG } from '/assets/siteconfig.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const el = {
  login: $('#login'),
  loginForm: $('#login-form'),
  password: $('#password'),
  loginError: $('#login-error'),
  app: $('#app'),
  storageNote: $('#storage-note'),
  logout: $('#logout'),

  playlist: $('#playlist'),
  playlistHint: $('#playlist-hint'),
  shuffle: $('#shuffle'),
  volume: $('#volume'),
  volumeOut: $('#volume-out'),

  title: $('#title'),
  subtitle: $('#subtitle'),
  marquee: $('#marquee'),
  plate: $('#plate'),
  chVignette: $('#ch-vignette'),
  chFill: $('#ch-fill'),

  hold: $('#hold'),
  holdOut: $('#hold-out'),
  fade: $('#fade'),
  fadeOut: $('#fade-out'),
  fadeLabel: $('#fade-label'),
  kenburns: $('#kenburns'),

  paneFrames: $('#pane-frames'),
  paneVideo: $('#pane-video'),
  drop: $('#drop'),
  file: $('#file'),
  frameUrl: $('#frame-url'),
  addUrl: $('#add-url'),
  uploadStatus: $('#upload-status'),
  frameList: $('#frame-list'),
  videoUrl: $('#video-url'),

  preview: $('#preview'),
  saveStatus: $('#save-status'),
  save: $('#save'),
  revert: $('#revert')
};

let state = structuredClone(DEFAULT_CONFIG);
let saved = JSON.stringify(state);
let canSave = true;

/* ------------------------------------------------------------- helpers */

function parsePlaylistId(input) {
  const raw = (input || '').trim();
  if (!raw) return '';
  let candidate = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(url.hostname.replace(/^www\./, ''))) {
        return '';
      }
      candidate = url.searchParams.get('list') || '';
    } catch {
      return '';
    }
  }
  return /^[A-Za-z0-9_-]{2,64}$/.test(candidate) ? candidate : '';
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1).replace(/\.0$/, '')}s`;
}

function note(node, message, kind = '') {
  node.textContent = message;
  node.className = `hint ${kind}`.trim();
}

async function api(path, options = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

/* ---------------------------------------------------------------- login */

async function checkSession() {
  const session = await api('/api/session').catch(() => ({ authed: false, configured: true }));

  if (!session.configured) {
    el.login.hidden = false;
    el.loginForm.querySelector('button').disabled = true;
    el.loginError.textContent =
      'No GARAGE_PASSWORD is set on this deployment. Add it in Vercel → Settings → Environment Variables, then redeploy.';
    return false;
  }

  if (!session.authed) {
    el.login.hidden = false;
    el.password.focus();
    return false;
  }

  el.login.hidden = true;
  el.app.hidden = false;
  describeStorage(session.storage);
  return true;
}

function describeStorage(storage) {
  const notes = {
    redis: 'Saving to Redis — changes go live immediately.',
    blob: 'Saving to Blob storage — changes can take up to a minute to appear.',
    none: 'No storage connected, so nothing can be saved yet. Add a Redis or Blob store in Vercel and redeploy.'
  };
  el.storageNote.textContent = notes[storage] || '';
  canSave = storage !== 'none';
}

el.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  el.loginError.textContent = '';
  try {
    await api('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: el.password.value })
    });
    location.reload();
  } catch (err) {
    el.loginError.textContent = err.message;
    el.password.select();
  }
});

el.logout.addEventListener('click', async () => {
  await api('/api/session', { method: 'DELETE' }).catch(() => {});
  location.reload();
});

/* ------------------------------------------------------- form <-> state */

function paint() {
  el.playlist.value = state.playlistId;
  el.shuffle.checked = state.shuffle;
  el.volume.value = String(state.volume);
  el.volumeOut.textContent = `${state.volume}%`;

  el.title.value = state.title;
  el.subtitle.value = state.subtitle;
  el.marquee.value = state.marquee;
  el.plate.value = state.plate || '';
  el.chVignette.checked = state.chrome.vignette;
  el.chFill.checked = state.chrome.fillScreen;

  const mode = $(`input[name="mode"][value="${state.motion.mode}"]`);
  if (mode) mode.checked = true;
  el.hold.value = String(state.motion.holdMs);
  el.holdOut.textContent = seconds(state.motion.holdMs);
  el.fade.value = String(state.motion.fadeMs);
  el.fadeOut.textContent = seconds(state.motion.fadeMs);
  el.kenburns.checked = state.motion.kenBurns;
  el.fadeLabel.hidden = state.motion.mode !== 'crossfade';
  el.fade.hidden = state.motion.mode !== 'crossfade';

  const bg = state.video.enabled ? 'video' : 'frames';
  $(`input[name="bgmode"][value="${bg}"]`).checked = true;
  el.paneFrames.hidden = bg !== 'frames';
  el.paneVideo.hidden = bg !== 'video';
  el.videoUrl.value = state.video.url;

  renderFrames();
  refreshPlaylistHint();
  refreshDirty();
  restartPreview();
}

function refreshPlaylistHint() {
  const raw = el.playlist.value.trim();
  if (!raw) return note(el.playlistHint, 'No playlist — the ride will be silent.');

  const id = parsePlaylistId(raw);
  if (!id) return note(el.playlistHint, 'That is not a YouTube playlist link or ID.', 'bad');
  if (id.length < 20) {
    return note(
      el.playlistHint,
      `Reading as "${id}". Playlist IDs are usually 34 characters — this one may have been cut short when copied.`,
      'bad'
    );
  }
  return note(el.playlistHint, `Reading as "${id}".`, 'good');
}

function bindInputs() {
  el.playlist.addEventListener('input', () => {
    state.playlistId = parsePlaylistId(el.playlist.value);
    refreshPlaylistHint();
    refreshDirty();
  });

  el.shuffle.addEventListener('change', () => set(() => (state.shuffle = el.shuffle.checked)));

  el.volume.addEventListener('input', () => {
    state.volume = Number(el.volume.value);
    el.volumeOut.textContent = `${state.volume}%`;
    refreshDirty();
  });

  for (const [node, key] of [[el.title, 'title'], [el.subtitle, 'subtitle'], [el.marquee, 'marquee'], [el.plate, 'plate']]) {
    node.addEventListener('input', () => set(() => (state[key] = node.value)));
  }

  for (const [node, key] of [
    [el.chVignette, 'vignette'],
    [el.chFill, 'fillScreen']
  ]) {
    node.addEventListener('change', () => set(() => (state.chrome[key] = node.checked)));
  }

  for (const radio of $$('input[name="mode"]')) {
    radio.addEventListener('change', () => {
      state.motion.mode = radio.value;
      el.fadeLabel.hidden = radio.value !== 'crossfade';
      el.fade.hidden = radio.value !== 'crossfade';
      refreshDirty();
      restartPreview();
    });
  }

  el.hold.addEventListener('input', () => {
    state.motion.holdMs = Number(el.hold.value);
    el.holdOut.textContent = seconds(state.motion.holdMs);
    refreshDirty();
    schedulePreview();
  });

  el.fade.addEventListener('input', () => {
    state.motion.fadeMs = Number(el.fade.value);
    el.fadeOut.textContent = seconds(state.motion.fadeMs);
    refreshDirty();
    schedulePreview();
  });

  el.kenburns.addEventListener('change', () => {
    state.motion.kenBurns = el.kenburns.checked;
    refreshDirty();
    restartPreview();
  });

  for (const radio of $$('input[name="bgmode"]')) {
    radio.addEventListener('change', () => {
      state.video.enabled = radio.value === 'video' && Boolean(state.video.url);
      el.paneFrames.hidden = radio.value !== 'frames';
      el.paneVideo.hidden = radio.value !== 'video';
      refreshDirty();
      restartPreview();
    });
  }

  el.videoUrl.addEventListener('input', () => {
    state.video.url = el.videoUrl.value.trim();
    state.video.enabled = Boolean(state.video.url) && $('input[name="bgmode"][value="video"]').checked;
    refreshDirty();
    schedulePreview();
  });
}

function set(mutate) {
  mutate();
  refreshDirty();
  restartPreview();
}

/* --------------------------------------------------------------- frames */

function renderFrames() {
  el.frameList.textContent = '';

  state.frames.forEach((frame, index) => {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.index = String(index);

    const handle = document.createElement('span');
    handle.className = 'handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');

    const thumb = document.createElement('img');
    thumb.src = frame.url;
    thumb.alt = '';
    thumb.loading = 'lazy';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const alt = document.createElement('input');
    alt.type = 'text';
    alt.value = frame.alt || '';
    alt.placeholder = 'Caption (optional)';
    alt.setAttribute('aria-label', `Caption for frame ${index + 1}`);
    alt.addEventListener('input', () => {
      state.frames[index].alt = alt.value;
      refreshDirty();
    });
    const src = document.createElement('span');
    src.className = 'src';
    src.textContent = frame.url;
    meta.append(alt, src);

    const tools = document.createElement('div');
    tools.className = 'tools';
    tools.append(
      button('↑', `Move frame ${index + 1} up`, () => move(index, index - 1), index === 0),
      button('↓', `Move frame ${index + 1} down`, () => move(index, index + 1), index === state.frames.length - 1),
      button('✕', `Remove frame ${index + 1}`, () => remove(index), false, 'kill')
    );

    li.append(handle, thumb, meta, tools);
    el.frameList.append(li);
  });

  if (!state.frames.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No frames yet.';
    el.frameList.append(empty);
  }
}

function button(label, title, onClick, disabled = false, className = '') {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.title = title;
  node.setAttribute('aria-label', title);
  node.disabled = disabled;
  if (className) node.className = className;
  node.addEventListener('click', onClick);
  return node;
}

function move(from, to) {
  if (to < 0 || to >= state.frames.length) return;
  const [item] = state.frames.splice(from, 1);
  state.frames.splice(to, 0, item);
  renderFrames();
  refreshDirty();
  restartPreview();
}

function remove(index) {
  state.frames.splice(index, 1);
  renderFrames();
  refreshDirty();
  restartPreview();
}

function addFrame(url, alt = '') {
  state.frames.push({ url, alt });
  renderFrames();
  refreshDirty();
  restartPreview();
}

/* Drag to reorder. The buttons above cover keyboard and touch. */
let dragFrom = null;
el.frameList.addEventListener('dragstart', (event) => {
  const li = event.target.closest('li');
  if (!li) return;
  dragFrom = Number(li.dataset.index);
  li.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
});
el.frameList.addEventListener('dragover', (event) => {
  event.preventDefault();
  const li = event.target.closest('li');
  $$('.frames li').forEach((node) => node.classList.toggle('drop-target', node === li));
});
el.frameList.addEventListener('drop', (event) => {
  event.preventDefault();
  const li = event.target.closest('li');
  if (li && dragFrom !== null) move(dragFrom, Number(li.dataset.index));
  dragFrom = null;
});
el.frameList.addEventListener('dragend', () => {
  $$('.frames li').forEach((node) => node.classList.remove('dragging', 'drop-target'));
  dragFrom = null;
});

el.addUrl.addEventListener('click', () => {
  const url = el.frameUrl.value.trim();
  if (!url) return;
  if (!/^https:\/\//i.test(url) && !url.startsWith('/')) {
    return note(el.uploadStatus, 'Frame URLs must start with https:// or /', 'bad');
  }
  addFrame(url);
  el.frameUrl.value = '';
  note(el.uploadStatus, 'Added.', 'good');
});

el.frameUrl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    el.addUrl.click();
  }
});

/* --------------------------------------------------------------- upload */

const MAX_EDGE = 2560;
const TARGET_BYTES = 900 * 1024;

/** Shrinks big photos in the browser so uploads stay under the function body limit. */
async function prepare(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return { blob: file, type: file.type };
  }
  if (file.size <= TARGET_BYTES) return { blob: file, type: file.type };

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const type = canvas.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.82));
    if (blob && blob.size < file.size) return { blob, type };
  } catch {
    /* Fall through and send the original. */
  }
  return { blob: file, type: file.type };
}

async function upload(files) {
  const list = [...files];
  let done = 0;

  for (const file of list) {
    note(el.uploadStatus, `Uploading ${file.name} (${++done} of ${list.length})…`);
    try {
      const { blob, type } = await prepare(file);
      const result = await api(`/api/upload?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': type || 'application/octet-stream' },
        body: blob
      });
      addFrame(result.url, file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      note(el.uploadStatus, `${file.name}: ${err.message}`, 'bad');
      return;
    }
  }

  note(el.uploadStatus, `Added ${list.length} frame${list.length === 1 ? '' : 's'}. Remember to save.`, 'good');
}

el.drop.addEventListener('click', () => el.file.click());
el.drop.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    el.file.click();
  }
});
el.file.addEventListener('change', () => {
  if (el.file.files.length) upload(el.file.files);
  el.file.value = '';
});
for (const type of ['dragenter', 'dragover']) {
  el.drop.addEventListener(type, (event) => {
    event.preventDefault();
    el.drop.classList.add('over');
  });
}
for (const type of ['dragleave', 'drop']) {
  el.drop.addEventListener(type, () => el.drop.classList.remove('over'));
}
el.drop.addEventListener('drop', (event) => {
  event.preventDefault();
  if (event.dataTransfer.files.length) upload(event.dataTransfer.files);
});

/* -------------------------------------------------------------- preview */

const KEN_BURNS = [
  ['scale(1.06) translate(-1.2%, 0.8%)', 'scale(1.17) translate(1.4%, -1.0%)'],
  ['scale(1.15) translate(1.4%, -0.8%)', 'scale(1.05) translate(-1.0%, 1.1%)'],
  ['scale(1.05) translate(1.1%, 1.0%)', 'scale(1.16) translate(-1.3%, -0.9%)'],
  ['scale(1.16) translate(-1.4%, 0.6%)', 'scale(1.06) translate(1.0%, -1.1%)']
];

let previewTimer = null;
let debounce = null;

function schedulePreview() {
  clearTimeout(debounce);
  debounce = setTimeout(restartPreview, 350);
}

function restartPreview() {
  clearTimeout(previewTimer);
  el.preview.textContent = '';

  if (state.video.enabled && state.video.url) {
    const video = document.createElement('video');
    video.src = state.video.url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.style.opacity = '1';
    el.preview.append(video);
    video.play().catch(() => {});
    return;
  }

  if (!state.frames.length) {
    const empty = document.createElement('span');
    empty.className = 'muted';
    empty.textContent = 'nothing to show';
    el.preview.append(empty);
    return;
  }

  const nodes = state.frames.map((frame) => {
    const img = document.createElement('img');
    img.src = frame.url;
    img.alt = '';
    el.preview.append(img);
    return img;
  });

  // A lone frame reverses its zoom rather than restarting it — see ride.js.
  if (nodes.length === 1) {
    const [near, far] = KEN_BURNS[0];
    const only = nodes[0];
    only.style.opacity = '1';
    only.style.transform = state.motion.kenBurns ? near : 'scale(1.04)';
    if (!state.motion.kenBurns) return;

    let out = false;
    const breathe = () => {
      const hold = Math.max(state.motion.holdMs, 200);
      out = !out;
      only.style.transition = `transform ${hold}ms ease-in-out`;
      only.style.transform = out ? far : near;
      previewTimer = setTimeout(breathe, hold);
    };
    previewTimer = setTimeout(breathe, 50);
    return;
  }

  let index = -1;
  const step = () => {
    const fade = state.motion.mode === 'crossfade' ? state.motion.fadeMs : 0;
    const hold = Math.max(state.motion.holdMs, 200);
    const previous = index >= 0 ? nodes[index] : null;
    index = (index + 1) % nodes.length;

    const current = nodes[index];
    const [from, to] = KEN_BURNS[index % KEN_BURNS.length];

    current.style.transition = 'none';
    current.style.transform = state.motion.kenBurns ? from : 'scale(1.04)';
    void current.offsetWidth;
    current.style.transition = `opacity ${fade}ms linear, transform ${hold + fade}ms linear`;
    current.style.opacity = '1';
    current.style.transform = state.motion.kenBurns ? to : 'scale(1.04)';
    current.style.zIndex = '1';

    if (previous && previous !== current) {
      previous.style.zIndex = '0';
      previous.style.transition = `opacity ${fade}ms linear`;
      previous.style.opacity = '0';
    }

    previewTimer = setTimeout(step, hold);
  };
  step();
}

/* ----------------------------------------------------------------- save */

function refreshDirty() {
  const dirty = JSON.stringify(state) !== saved;
  el.save.disabled = !dirty || !canSave || el.save.dataset.busy === '1';
  el.revert.disabled = !dirty;

  // Only ever manage our own message here — a "Saved at…" or error line stands.
  if (dirty) el.saveStatus.textContent = 'Unsaved changes';
  else if (el.saveStatus.textContent === 'Unsaved changes') el.saveStatus.textContent = '';
}

el.save.addEventListener('click', async () => {
  el.save.dataset.busy = '1';
  el.save.disabled = true;
  el.saveStatus.textContent = 'Saving…';

  let message;
  try {
    const result = await api('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
    state = result;
    saved = JSON.stringify(state);
    paint();
    message = `Saved at ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    message = `Could not save — ${err.message}`;
  }

  delete el.save.dataset.busy;
  refreshDirty();
  el.saveStatus.textContent = message;
});

el.revert.addEventListener('click', () => {
  state = JSON.parse(saved);
  paint();
});

window.addEventListener('beforeunload', (event) => {
  if (JSON.stringify(state) !== saved) event.preventDefault();
});

/* ------------------------------------------------------------------ boot */

async function boot() {
  if (!(await checkSession())) return;

  try {
    state = await api('/api/config');
  } catch {
    state = structuredClone(DEFAULT_CONFIG);
  }
  saved = JSON.stringify(state);

  bindInputs();
  paint();
}

boot();

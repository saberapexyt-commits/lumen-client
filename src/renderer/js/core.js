// Shared UI helpers. No framework: small DOM builder + a tiny state store.

// replaceChildren(null) would insert the text "null"; skip empty children and flatten arrays.
const nativeReplace = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...kids) {
  return nativeReplace.apply(this, kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
};

export const api = (channel, ...args) => window.lumen.invoke(channel, ...args);

export const state = {
  profiles: [],
  settings: {},
  accounts: { active: '', accounts: [] },
  profileId: localStorage.getItem('profileId') || '',
  states: {}, // profileId -> 'starting' | 'running'
  tasks: {}, // taskId -> task json
  gameLogs: {}, // profileId -> lines[]
  appInfo: {},
};

const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const emit = () => listeners.forEach((l) => l());

/** h('div.class#id', {onclick, style:{}}, child, 'text', [children]) */
export function h(tag, attrs, ...children) {
  const m = /^([a-z0-9]+)((?:[.#][\w-]+)*)/i.exec(tag);
  const el = document.createElement(m[1]);
  for (const part of m[2].match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.classList.add(...String(v).split(' ').filter(Boolean));
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

const ICONS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  play: 'M7 4.5v15l13-7.5z',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  terminal: 'M4 17l6-6-6-6M12 19h8',
  spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  x: 'M18 6L6 18M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  link: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};
export function icon(name, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (size) (svg.style.width = svg.style.height = size + 'px');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || ICONS.info);
  svg.append(p);
  return svg;
}

export const btn = (label, opts = {}) =>
  h(
    'button.btn' + (opts.cls ? '.' + opts.cls.split(' ').join('.') : ''),
    { onclick: opts.onclick, disabled: opts.disabled, title: opts.title },
    opts.icon ? icon(opts.icon) : null,
    label,
  );

export function toast(message, kind = '') {
  const t = h('div.toast' + (kind ? '.' + kind : ''), String(message));
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 8000 : 4000);
}

/** Run an API call; show errors as toasts instead of throwing into the void. */
export async function safe(fn, { quiet } = {}) {
  try {
    return await fn();
  } catch (e) {
    const msg = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    if (!quiet) toast(msg, 'error');
    return undefined;
  }
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const root = document.getElementById('modal-root');
  const close = () => {
    scrim.remove();
    onClose?.();
  };
  const scrim = h(
    'div.scrim',
    { onmousedown: (e) => e.target === scrim && close() },
    h(
      'div.modal' + (wide ? '.wide' : ''),
      h('header', h('h2', title), h('button.btn.ghost.sm', { onclick: close }, icon('x'))),
      h('div.body', body),
      actions.length ? h('footer', actions.map((a) => a(close))) : null,
    ),
  );
  root.append(scrim);
  return { close, el: scrim };
}

export function confirmDialog(title, message, { confirm = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v, close) => {
      done = true;
      close();
      resolve(v);
    };
    modal({
      title,
      body: typeof message === 'string' ? h('p', message) : message,
      onClose: () => !done && resolve(false),
      actions: [
        (close) => btn('Cancel', { onclick: () => finish(false, close) }),
        (close) => btn(confirm, { cls: danger ? 'danger' : 'primary', onclick: () => finish(true, close) }),
      ],
    });
  });
}

export const fmtNum = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n ?? 0));
export function timeAgo(ts) {
  if (!ts) return 'never';
  const s = (Date.now() - (typeof ts === 'number' ? ts : Date.parse(ts))) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 60) return `${Math.floor(s / 86400)}d ago`;
  return new Date(typeof ts === 'number' ? ts : Date.parse(ts)).toLocaleDateString();
}
export const fmtPlay = (ms) => (ms < 60000 ? '0m' : ms < 3.6e6 ? `${Math.floor(ms / 60000)}m` : `${(ms / 3.6e6).toFixed(1)}h`);
export const LOADER_NAMES = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
export const profileLabel = (p) => `${p.mcVersion} · ${LOADER_NAMES[p.loader]}${p.loaderVersion && p.loader !== 'vanilla' ? ' ' + p.loaderVersion.replace(p.mcVersion + '-', '') : ''}`;

export function modIcon(url, title) {
  const box = h('div.micon', (title || '?').trim().slice(0, 2).toUpperCase());
  if (url) {
    const img = h('img', { src: url, loading: 'lazy', alt: '' });
    img.onload = () => (box.textContent = '', box.append(img));
  }
  return box;
}

export function switchEl(checked, onchange) {
  const input = h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked, e.target) });
  return h('label.switch', input, h('i'));
}

/* ---------- profiles ---------- */
export async function refreshProfiles() {
  state.profiles = (await safe(() => api('profiles:list'))) || [];
  if (!state.profiles.find((p) => p.id === state.profileId)) state.profileId = state.profiles[0]?.id || '';
  emit();
}
export const currentProfile = () => state.profiles.find((p) => p.id === state.profileId);
export function selectProfile(id) {
  state.profileId = id;
  localStorage.setItem('profileId', id);
  emit();
}

export function profileSelect(onchange) {
  const sel = h(
    'select.input',
    { style: { width: 'auto', minWidth: '220px' }, onchange: (e) => (selectProfile(e.target.value), onchange?.(e.target.value)) },
    state.profiles.map((p) => h('option', { value: p.id, selected: p.id === state.profileId }, `${p.name} - ${profileLabel(p)}`)),
  );
  return sel;
}

/* ---------- tasks ---------- */
const taskWaiters = new Map();
export function handleTaskUpdate(t) {
  state.tasks[t.id] = t;
  if (t.status !== 'running') {
    taskWaiters.get(t.id)?.(t);
    taskWaiters.delete(t.id);
    setTimeout(() => {
      delete state.tasks[t.id];
      emit();
    }, t.status === 'error' ? 15000 : 2500);
  }
  emit();
}
/** Resolve with the final task state once it finishes (done / error / cancelled). */
export function waitTask(id) {
  const cur = state.tasks[id];
  if (cur && cur.status !== 'running') return Promise.resolve(cur);
  return new Promise((res) => taskWaiters.set(id, res));
}

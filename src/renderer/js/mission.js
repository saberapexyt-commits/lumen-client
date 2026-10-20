import { api, h, icon, btn, toast, confirmDialog } from './core.js';

/** Mission Control: live console, loaded mods and screenshots for the game that was just launched. */
const LOADER_NAMES = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge', vanilla: 'Vanilla' };
const rail = document.getElementById('mc-rail');
const main = document.getElementById('mc-main');
const side = document.getElementById('mc-side');
const crumb = document.getElementById('mc-crumb');

let info = null;
let view = 'console';
let lines = [];
let query = '';
let opts = { autoscroll: true, wrap: true, errorsOnly: false };
try {
  Object.assign(opts, JSON.parse(localStorage.getItem('mc-opts') || '{}'));
} catch {
  /* defaults */
}
let log = null;
let popOpen = false;
let statusState = 'starting';

const isErr = (t, s) => s === 'err' || /ERROR|Exception|FATAL|Caused by/.test(t);
const isWarn = (t) => /WARN/.test(t);

function lineEl(t, s) {
  const el = h('div' + (isErr(t, s) ? '.err' : isWarn(t) ? '.warn' : ''), t);
  applyFilter(el, t, s);
  return el;
}
function applyFilter(el, t, s) {
  const q = query.trim().toLowerCase();
  const hidden = (q && !t.toLowerCase().includes(q)) || (opts.errorsOnly && !isErr(t, s) && !isWarn(t));
  el.classList.toggle('hide', !!hidden);
}
function refilter() {
  if (!log) return;
  [...log.children].forEach((el, i) => lines[i] && applyFilter(el, lines[i].line, lines[i].stream));
}
const stick = () => opts.autoscroll && log && (log.scrollTop = log.scrollHeight);
const saveOpts = () => {
  try {
    localStorage.setItem('mc-opts', JSON.stringify(opts));
  } catch {
    /* storage unavailable */
  }
};

function fmtUp(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function drawCrumb() {
  if (!info) return crumb.replaceChildren(h('b', 'Mission Control'));
  const p = info.profile;
  crumb.replaceChildren(h('b', 'Mission Control'), h('span', '/'), `Lumen Client ${p.mcVersion} with ${LOADER_NAMES[p.loader] || p.loader}`);
}

function drawRail() {
  const rb = (id, ic, title) => h('button.rb' + (view === id ? '.on' : ''), { title, onclick: () => ((view = id), (popOpen = false), drawRail(), drawMain()) }, icon(ic));
  rail.replaceChildren(
    rb('console', 'terminal', 'Console'),
    rb('mods', 'layers', 'Mods'),
    rb('shots', 'image', 'Screenshots'),
    h('div.sp'),
    h('button.rb.stop', { title: statusState === 'exited' ? 'Game has stopped' : 'Stop the game', disabled: statusState === 'exited', onclick: stopGame }, icon('stopcircle')),
    h('button.rb' + (popOpen ? '.on' : ''), { title: 'Console settings', onclick: () => ((popOpen = !popOpen), drawMain()) }, icon('settings')),
  );
}

async function stopGame() {
  if (!info) return;
  if (!(await confirmDialog('Stop Minecraft?', 'The game will be closed right away. Unsaved progress in a world can be lost.', { confirm: 'Stop game', danger: true }))) return;
  await api('game:kill', info.profile.id).catch((e) => toast(e.message, 'error'));
}

function popover() {
  const sw = (label, key, after) =>
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' } }, label, h('label.switch', h('input', { type: 'checkbox', checked: opts[key], onchange: (e) => ((opts[key] = e.target.checked), saveOpts(), after?.()) }), h('i')));
  return h(
    'div.mc-pop',
    sw('Auto-scroll', 'autoscroll', stick),
    sw('Wrap long lines', 'wrap', () => log?.classList.toggle('nowrap', !opts.wrap)),
    sw('Only warnings and errors', 'errorsOnly', refilter),
  );
}

async function drawMain() {
  main.replaceChildren();
  log = null;
  if (view === 'console') {
    const search = h('input.input', { placeholder: 'Search logs…', value: query, oninput: (e) => ((query = e.target.value), refilter()) });
    log = h('div.mc-log' + (opts.wrap ? '' : '.nowrap'));
    main.append(
      h(
        'div.mc-bar',
        search,
        btn('', { cls: 'ghost', icon: 'copy', title: 'Copy the log', onclick: () => navigator.clipboard.writeText(lines.map((l) => l.line).join('\n')).then(() => toast('Log copied.', 'ok')) }),
        btn('', { cls: 'ghost', icon: 'folder', title: "Open the game's logs folder", onclick: () => api('mission:openGameLogs') }),
      ),
      log,
    );
    if (!lines.length) log.append(h('div.mc-ctr', statusState === 'exited' ? 'The game printed no output.' : 'Launching…'));
    else lines.forEach((l) => log.append(lineEl(l.line, l.stream)));
    stick();
  } else if (view === 'mods') {
    const list = h('div.mc-mods', h('div.mc-ctr', 'Loading…'));
    main.append(h('h2.sec', { style: { margin: '0' } }, 'Mods in this profile'), list);
    const mods = await api('mods:list', info.profile.id).catch(() => []);
    list.replaceChildren(
      ...(mods.length ? mods.map((m) => h('div.mc-mod', h('b', m.title || m.fileName), h('span', m.versionNumber || ''), m.enabled === false ? h('span.chip', 'Disabled') : null)) : [h('div.mc-ctr', 'No mods installed.')]),
    );
  } else {
    const grid = h('div.mc-grid', h('div.mc-ctr', 'Loading…'));
    main.append(h('h2.sec', { style: { margin: '0' } }, 'Screenshots'), grid);
    const shots = await api('mission:screenshots').catch(() => []);
    grid.replaceChildren(
      ...(shots.length
        ? shots.map((s) => h('button.mc-shot', { onclick: () => api('mission:openScreenshot', s.name), title: 'Open' }, h('img', { src: s.dataUrl, alt: '' }), h('div', new Date(s.time).toLocaleString())))
        : [h('div.mc-ctr', 'No screenshots yet. Press F2 in game.')]),
    );
  }
  if (popOpen) main.append(popover());
  drawRail();
}

function drawSide() {
  if (!info) return side.replaceChildren(h('div.mc-card', h('h3', 'Session'), h('div.muted', 'No game has been started yet.')));
  const p = info.profile;
  const status = statusState === 'exited' ? h('span.chip', info.code ? `Closed (code ${info.code})` : 'Closed') : statusState === 'running' ? h('span.chip.ok', 'Running') : h('span.chip.warn', 'Launching');
  const kv = (k, v) => h('div.mc-kv', h('span', k), h('b', v));
  const up = h('b', '--:--:--');
  side.replaceChildren(
    h('div.mc-card', h('h3', 'Session'), kv('Status', status), h('div.mc-kv', h('span', statusState === 'running' ? 'Uptime' : 'Since launch'), up)),
    h('div.mc-card', h('h3', 'Profile'), kv('Name', p.name), kv('Minecraft', p.mcVersion), kv('Loader', `${LOADER_NAMES[p.loader] || p.loader}${p.loaderVersion ? ' ' + p.loaderVersion : ''}`), kv('Mods', String(info.modsCount ?? 0)), kv('Memory', p.ramMb ? `${(p.ramMb / 1024).toFixed(1)} GB` : 'Default')),
    h('div.mc-card', h('h3', 'Quick actions'), btn('Open game folder', { icon: 'folder', onclick: () => api('profiles:openFolder', p.id) }), btn('Open Lumen', { icon: 'home', onclick: () => api('mission:focusMain').catch(() => {}) })),
  );
  side.uptime = up;
}

async function refreshInfo() {
  info = await api('mission:info').catch(() => null);
  if (info) statusState = info.state;
  drawCrumb();
  drawSide();
}

window.lumen.on('game:log', ({ profileId, line, stream }) => {
  if (info && profileId !== info.profile.id) return;
  lines.push({ line, stream });
  if (lines.length > 6000) lines.splice(0, 1000);
  if (log) {
    if (log.firstChild?.classList?.contains('mc-ctr')) log.replaceChildren();
    const atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
    log.append(lineEl(line, stream));
    if (atEnd || opts.autoscroll) stick();
  }
});
window.lumen.on('game:state', async ({ state, code }) => {
  if (state === 'starting') {
    lines = [];
    await refreshInfo();
    if (view === 'console') drawMain();
    return;
  }
  statusState = state;
  if (info) info.code = code;
  if (state === 'exited') lines.push({ line: `--- Minecraft closed${code ? ` (exit code ${code})` : ''} ---`, stream: 'out' });
  drawSide();
  drawRail();
  if (view === 'console' && log) {
    log.append(lineEl(lines.at(-1)?.line ?? '', 'out'));
    stick();
  }
});

const maxBtn = document.getElementById('win-max');
document.getElementById('win-min').onclick = () => window.lumen.window.minimize();
maxBtn.onclick = () => window.lumen.window.maximize();
document.getElementById('win-close').onclick = () => window.lumen.window.close();

setInterval(() => {
  if (info && side.uptime && statusState === 'running') side.uptime.textContent = fmtUp(Date.now() - info.startedAt);
}, 1000);

(async function boot() {
  try {
    const s = await api('settings:get');
    document.documentElement.dataset.theme = s.theme || 'dark';
    if (s.accent) document.documentElement.style.setProperty('--accent', s.accent);
  } catch {
    /* defaults */
  }
  await refreshInfo();
  lines = (await api('mission:lines').catch(() => [])) || [];
  drawRail();
  await drawMain();
})();

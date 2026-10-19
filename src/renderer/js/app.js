import { api, state, h, icon, emit, onChange, safe, toast, handleTaskUpdate, refreshProfiles } from './core.js';
import { renderHome } from './pages/home.js';
import { renderProfiles } from './pages/profiles.js';
import { renderBrowse } from './pages/browse.js';
import { renderInstalled } from './pages/installed.js';
import { renderSettings } from './pages/settings.js';
import { renderConsole } from './pages/console.js';
import { renderClient } from './pages/client.js';

const GROUPS = [
  { label: 'Play', pages: [{ id: 'home', label: 'Home', icon: 'home', render: renderHome }, { id: 'profiles', label: 'Profiles', icon: 'gamepad', render: renderProfiles }] },
  { label: 'Mods', pages: [{ id: 'browse', label: 'Browse', icon: 'search', render: renderBrowse }, { id: 'installed', label: 'Installed', icon: 'layers', render: renderInstalled }] },
  { label: 'Client', pages: [{ id: 'client', label: 'Features', icon: 'spark', render: renderClient }, { id: 'console', label: 'Console', icon: 'terminal', render: renderConsole }] },
];
const SETTINGS = { id: 'settings', label: 'Settings', icon: 'settings', render: renderSettings };
const PAGES = [...GROUPS.flatMap((g) => g.pages), SETTINGS];

let page = localStorage.getItem('page') || 'home';
if (!PAGES.some((p) => p.id === page)) page = 'home';
let cleanup = null;
const view = document.getElementById('view');

export function navigate(id, params) {
  page = PAGES.some((p) => p.id === id) ? id : 'home';
  localStorage.setItem('page', page);
  cleanup?.();
  cleanup = null;
  document.body.classList.toggle('home', page === 'home');
  view.replaceChildren();
  view.scrollTop = 0;
  const result = PAGES.find((x) => x.id === page).render(view, params || {});
  Promise.resolve(result).then((c) => typeof c === 'function' && (cleanup = c));
  renderSidebar();
}
window.__navigate = navigate;

function navBtn(p) {
  return h('button.nav-btn' + (p.id === page ? '.active' : ''), { onclick: () => navigate(p.id), title: p.label }, icon(p.icon), h('span', p.label));
}

function renderSidebar() {
  const acc = state.accounts.accounts.find((a) => a.id === state.accounts.active);
  document.getElementById('sidebar').replaceChildren(
    h('div.brand', h('img', { src: 'assets/logo-mark.png', alt: '' }), h('div', h('b', 'LUMEN'), h('small', 'CLIENT'))),
    ...GROUPS.flatMap((g) => [h('div.nav-label', g.label), ...g.pages.map(navBtn)]),
    h('div.nav-spacer'),
    updateCard(),
    h(
      'button.acct',
      { onclick: () => navigate('settings', { tab: 'accounts' }), title: acc ? `Signed in as ${acc.name}` : 'Sign in with Microsoft' },
      h('div.avatar' + (acc ? '' : '.off'), acc ? acc.name.slice(0, 1).toUpperCase() : icon('user', 14)),
      h('div.t', h('b.ellipsis', acc ? acc.name : 'Not signed in'), h('span', acc ? 'Microsoft account' : 'Click to sign in')),
    ),
    navBtn(SETTINGS),
  );
}

function updateCard() {
  const u = state.update;
  if (!u || !['downloading', 'ready'].includes(u.status)) return null;
  if (u.status === 'ready')
    return h('div.update', h('b', `Update ${u.version} ready`), h('span.muted', 'Installs in a few seconds and reopens.'), h('button.btn.primary.sm', { onclick: () => api('update:install') }, icon('refresh'), h('span', 'Restart to update')));
  return h('div.update', h('b', `Downloading ${u.version}`), h('span.muted', `${u.percent ?? 0}%`), h('div.bar', h('i', { style: { width: (u.percent ?? 0) + '%' } })));
}

export async function refreshAccounts() {
  state.accounts = (await safe(() => api('auth:list'), { quiet: true })) || state.accounts;
  renderSidebar();
}

function applyTheme() {
  const s = state.settings;
  document.documentElement.dataset.theme = s.theme || 'dark';
  if (s.accent) document.documentElement.style.setProperty('--accent', s.accent);
}
export async function refreshSettings() {
  state.settings = (await safe(() => api('settings:get'))) || state.settings;
  applyTheme();
}

/* ---------- background tasks ---------- */
function renderDock() {
  const playIds = new Set(Object.values(state.playTasks));
  document.getElementById('dock').replaceChildren(
    ...Object.values(state.tasks)
      .filter((t) => !(playIds.has(t.id) && t.status === 'running' && page === 'home')) // Home shows launch progress inline
      .map((t) => {
        const pct = t.total ? Math.min(100, Math.round((t.done / t.total) * 100)) : null;
        const running = t.status === 'running';
        return h(
          'div.task' + (t.status === 'error' ? '.error' : t.status === 'done' ? '.done' : ''),
          h(
            'div.row',
            h('div.grow', h('b', t.title), h('div.small.muted.ellipsis', t.status === 'error' ? t.error : t.status === 'cancelled' ? 'Cancelled' : t.status === 'done' ? 'Done' : `${t.label || 'Working…'}${t.total ? `  ·  ${t.done}/${t.total}` : ''}`)),
            running ? h('button.btn.sm', { onclick: () => api('task:cancel', t.id) }, 'Cancel') : null,
          ),
          running ? h('div.bar' + (pct === null ? '.ind' : ''), h('i', pct === null ? {} : { style: { width: pct + '%' } })) : null,
        );
      }),
  );
}
onChange(renderDock);

window.lumen.on('task:update', (t) => {
  handleTaskUpdate(t);
  if (t.status === 'error') toast(t.error, 'error');
});
window.lumen.on('game:state', ({ profileId, state: st, code }) => {
  if (st === 'exited') {
    delete state.states[profileId];
    const p = state.profiles.find((x) => x.id === profileId);
    if (code && code !== 0) toast(`${p?.name || 'Minecraft'} closed unexpectedly (exit code ${code}). Open Console for the log.`, 'error');
    refreshProfiles();
  } else state.states[profileId] = st;
  emit();
});
window.lumen.on('game:log', ({ profileId, line, stream }) => {
  const arr = (state.gameLogs[profileId] ||= []);
  arr.push({ line, stream });
  if (arr.length > 3000) arr.splice(0, 500);
  window.dispatchEvent(new CustomEvent('gamelog', { detail: { profileId, line, stream } }));
});
window.lumen.on('update:state', (u) => {
  const was = state.update?.status;
  state.update = u;
  renderSidebar();
  emit();
  if (u.status === 'ready' && was !== 'ready') toast(`Update ${u.version} is ready. Use "Restart to update" in the sidebar.`, 'ok');
});
const maxBtn = document.getElementById('win-max');
window.lumen.on('window:state', ({ maximized }) => {
  maxBtn.innerHTML = maximized
    ? '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M3.5 3.5V1.5h7v7h-2M1.5 3.5h7v7h-7z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>'
    : '<svg width="11" height="11" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
  maxBtn.title = maximized ? 'Restore' : 'Maximize';
});
document.getElementById('win-min').onclick = () => window.lumen.window.minimize();
maxBtn.onclick = () => window.lumen.window.maximize();
document.getElementById('win-close').onclick = () => window.lumen.window.close();

(async function boot() {
  const started = Date.now();
  const status = document.getElementById('splash-status');
  status.textContent = 'LOADING SETTINGS';
  state.appInfo = (await safe(() => api('app:info'), { quiet: true })) || {};
  state.update = state.appInfo.update;
  await refreshSettings();
  status.textContent = 'CHECKING ACCOUNT';
  await refreshAccounts();
  status.textContent = 'LOADING PROFILES';
  await refreshProfiles();
  navigate(page);
  const wait = Math.max(0, 1300 - (Date.now() - started));
  setTimeout(() => {
    const sp = document.getElementById('splash');
    sp.classList.add('gone');
    setTimeout(() => sp.remove(), 600);
  }, wait);
})();

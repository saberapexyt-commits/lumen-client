import { api, state, h, icon, emit, onChange, safe, toast, handleTaskUpdate, refreshProfiles, currentProfile } from './core.js';
import { renderHome } from './pages/home.js';
import { renderProfiles } from './pages/profiles.js';
import { renderBrowse } from './pages/browse.js';
import { renderInstalled } from './pages/installed.js';
import { renderSettings } from './pages/settings.js';
import { renderConsole } from './pages/console.js';
import { renderClient } from './pages/client.js';

const PAGES = [
  { id: 'home', label: 'Home', icon: 'home', render: renderHome },
  { id: 'profiles', label: 'Play', icon: 'play', render: renderProfiles },
  { id: 'browse', label: 'Mods', icon: 'box', render: renderBrowse },
  { id: 'installed', label: 'Installed', icon: 'list', render: renderInstalled },
  { id: 'client', label: 'Client', icon: 'spark', render: renderClient },
  { id: 'console', label: 'Console', icon: 'terminal', render: renderConsole },
  { id: 'settings', label: 'Settings', icon: 'settings', render: renderSettings },
];

let page = localStorage.getItem('page') || 'home';
let cleanup = null;
const view = document.getElementById('view');

export function navigate(id, params) {
  page = PAGES.some((p) => p.id === id) ? id : 'home';
  localStorage.setItem('page', page);
  cleanup?.();
  cleanup = null;
  view.replaceChildren();
  view.scrollTop = 0;
  const p = PAGES.find((x) => x.id === page);
  const result = p.render(view, params || {});
  Promise.resolve(result).then((c) => typeof c === 'function' && (cleanup = c));
  renderSidebar();
}
window.__navigate = navigate;

function renderSidebar() {
  const nav = document.getElementById('sidebar');
  const acc = state.accounts.accounts.find((a) => a.id === state.accounts.active);
  nav.replaceChildren(
    ...PAGES.filter((p) => p.id !== 'settings').map((p) =>
      h('button.nav-btn' + (p.id === page ? '.active' : ''), { onclick: () => navigate(p.id), title: p.label }, icon(p.icon), p.label),
    ),
    h('div.nav-spacer'),
    h(
      'button.acct',
      { onclick: () => navigate('settings', { tab: 'accounts' }), title: acc ? `Signed in as ${acc.name}` : 'Sign in with Microsoft' },
      h('div.avatar', acc ? acc.name.slice(0, 1).toUpperCase() : '?'),
      h('span.nm', acc ? acc.name : 'Sign in'),
    ),
    h('button.nav-btn' + (page === 'settings' ? '.active' : ''), { onclick: () => navigate('settings') }, icon('settings'), 'Settings'),
  );
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

/* ---------- task dock ---------- */
function renderDock() {
  const dock = document.getElementById('dock');
  dock.replaceChildren(
    ...Object.values(state.tasks).map((t) => {
      const pct = t.total ? Math.min(100, Math.round((t.done / t.total) * 100)) : null;
      const running = t.status === 'running';
      return h(
        'div.task',
        h(
          'div.row',
          running ? h('span.spinner') : h('span', t.status === 'done' ? '✓' : t.status === 'error' ? '✕' : '–'),
          h('div.grow', h('b', t.title), h('div.small.muted', t.status === 'error' ? t.error : t.status === 'cancelled' ? 'Cancelled' : t.status === 'done' ? 'Done' : `${t.label || 'Working…'}${t.total ? `  ${t.done}/${t.total}` : ''}`)),
          running ? h('button.btn.sm', { onclick: () => api('task:cancel', t.id) }, 'Cancel') : null,
        ),
        running ? h('div.bar' + (pct === null ? '.ind' : ''), h('i', { style: pct === null ? {} : { width: pct + '%' } })) : null,
      );
    }),
  );
}
onChange(renderDock);

/* ---------- events from main ---------- */
window.lumen.on('task:update', (t) => {
  handleTaskUpdate(t);
  if (t.status === 'error') toast(t.error, 'error');
});
window.lumen.on('game:state', ({ profileId, state: st, code }) => {
  if (st === 'exited') {
    delete state.states[profileId];
    const p = state.profiles.find((x) => x.id === profileId);
    if (code && code !== 0) toast(`${p?.name || 'Minecraft'} closed unexpectedly (exit code ${code}). Open Console for details.`, 'error');
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
window.lumen.on('window:state', () => {});

document.getElementById('win-min').onclick = () => window.lumen.window.minimize();
document.getElementById('win-max').onclick = () => window.lumen.window.maximize();
document.getElementById('win-close').onclick = () => window.lumen.window.close();

(async function boot() {
  state.appInfo = (await safe(() => api('app:info'), { quiet: true })) || {};
  await refreshSettings();
  await refreshAccounts();
  await refreshProfiles();
  navigate(page);
})();
export { currentProfile };

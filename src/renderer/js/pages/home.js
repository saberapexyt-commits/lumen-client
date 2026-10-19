import { api, state, h, icon, btn, safe, currentProfile, profileLabel, timeAgo, fmtPlay, onChange } from '../core.js';
import { navigate } from '../app.js';
import { playProfile, openProfileDialog } from './profiles.js';

export async function renderHome(root) {
  const page = h('div.page');
  root.append(page);

  const hero = h('div.hero');
  const renderHero = () => {
    const p = currentProfile();
    const st = p && state.states[p.id];
    const acc = state.accounts.accounts.find((a) => a.id === state.accounts.active);
    hero.replaceChildren(
      h('div.muted.small', acc ? `Welcome back, ${acc.name}` : 'Welcome to Lumen'),
      h('h1', p ? p.name : 'Create your first profile'),
      h('p.sub', p ? `${profileLabel(p)}  ·  last played ${timeAgo(p.lastPlayed)}  ·  ${fmtPlay(p.playTimeMs || 0)} played` : 'A profile is a separate Minecraft setup with its own version, loader and mods.'),
      h(
        'div.row.wrap',
        p
          ? btn(st === 'running' ? 'Running…' : st === 'starting' ? 'Starting…' : 'Play', { cls: 'primary big', icon: 'play', disabled: !!st, onclick: () => playProfile(p.id) })
          : btn('New profile', { cls: 'primary big', icon: 'plus', onclick: () => openProfileDialog() }),
        p ? btn('Browse mods', { icon: 'box', onclick: () => navigate('browse') }) : null,
        p ? btn('Switch profile', { onclick: () => navigate('profiles') }) : null,
        !acc ? btn('Sign in with Microsoft', { icon: 'info', onclick: () => navigate('settings', { tab: 'accounts' }) }) : null,
      ),
    );
  };
  renderHero();
  const off = onChange(renderHero);

  const newsBox = h('div.news', h('div.empty', h('span.spinner')));
  page.append(
    hero,
    h('div.spacer'),
    h('div.row', h('h2.grow', 'Minecraft: Java Edition - latest updates'), btn('Refresh', { cls: 'sm ghost', icon: 'refresh', onclick: loadNews })),
    newsBox,
  );

  async function loadNews() {
    newsBox.replaceChildren(h('div.empty', h('span.spinner')));
    const news = await safe(() => api('news:get'), { quiet: true });
    if (!news) {
      newsBox.replaceChildren(h('div.empty', 'Could not load news right now. Check your connection.'));
      return;
    }
    newsBox.replaceChildren(
      ...news.map((n) =>
        h(
          'div.news-card',
          { onclick: () => n.url && api('shell:openExternal', n.url) },
          n.image ? h('img', { src: n.image, loading: 'lazy', alt: '' }) : null,
          h('div.b', h('span.chip' + (n.type === 'release' ? '.ok' : '.accent'), n.type), h('h3', n.title), h('p', n.text)),
        ),
      ),
    );
  }
  loadNews();
  return off;
}

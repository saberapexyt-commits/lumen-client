import { api, state, h, icon, btn, safe, currentProfile, selectProfile, profileLabel, timeAgo, fmtPlay, onChange, LOADER_NAMES } from '../core.js';
import { navigate } from '../app.js';
import { playProfile, openProfileDialog } from './profiles.js';

export async function renderHome(root) {
  const hub = h('div.hub');
  const bg = h('div.hub-bg');
  const main = h('div.hub-main');
  const side = h('div.hub-side', h('h3', 'Minecraft news'), h('div.news-list', h('div', { style: { padding: '16px', textAlign: 'center' } }, h('span.spinner'))));
  hub.append(bg, main, side);
  root.append(hub);

  let modCount = null;
  let countFor = '';

  async function loadCount(p) {
    if (!p || p.loader === 'vanilla' || countFor === p.id) return;
    countFor = p.id;
    modCount = await safe(() => api('mods:count', p.id), { quiet: true });
    draw();
  }

  function draw() {
    const p = currentProfile();
    const st = p && state.states[p.id];
    const acc = state.accounts.accounts.find((a) => a.id === state.accounts.active);
    const task = p && state.tasks[state.playTasks[p.id]];
    const busy = !!st || task?.status === 'running';
    main.replaceChildren(
      h('div.hub-eyebrow', p ? 'Selected profile' : 'Welcome'),
      h('h1.hub-title', p ? p.name : 'Set up your first profile'),
      p
        ? h(
            'div.hub-meta',
            h('span', icon('gamepad'), `Minecraft ${p.mcVersion}`),
            h('span', icon('cpu'), p.loader === 'vanilla' ? 'Vanilla' : `${LOADER_NAMES[p.loader]} ${(p.loaderVersion || '').replace(p.mcVersion + '-', '')}`),
            p.loader !== 'vanilla' && modCount !== null ? h('span', icon('layers'), `${modCount} mod${modCount === 1 ? '' : 's'}`) : null,
            h('span', icon('clock'), p.lastPlayed ? `Played ${timeAgo(p.lastPlayed)} · ${fmtPlay(p.playTimeMs || 0)} total` : 'Not played yet'),
          )
        : h('div.hub-meta', 'A profile is its own Minecraft installation: version, mod loader, mods and worlds.'),
      h(
        'div.hub-actions',
        p
          ? st === 'running'
            ? btn('Stop', { cls: 'play danger', onclick: () => api('game:kill', p.id) })
            : btn(busy ? 'Starting' : 'Play', { cls: 'primary play', icon: busy ? null : 'play', disabled: busy, onclick: () => playProfile(p.id) })
          : btn('Create profile', { cls: 'primary play', onclick: () => openProfileDialog() }),
        p
          ? h(
              'select.input',
              { style: { width: '230px', minHeight: '38px' }, title: 'Switch profile', onchange: (e) => (selectProfile(e.target.value), (countFor = ''), (modCount = null), loadCount(currentProfile())) },
              state.profiles.map((x) => h('option', { value: x.id, selected: x.id === p.id }, `${x.name}  ·  ${x.mcVersion} ${LOADER_NAMES[x.loader]}`)),
            )
          : null,
        p ? btn('', { icon: 'sliders', cls: 'icon', title: 'Edit profile', onclick: () => openProfileDialog(p) }) : null,
        p && p.loader !== 'vanilla' ? btn('Mods', { icon: 'layers', onclick: () => navigate('installed') }) : null,
      ),
      !acc && p ? h('div.note.info', { style: { marginTop: '16px', maxWidth: '460px', background: 'rgba(18,21,27,.85)' } }, icon('info'), h('div', 'Sign in with your Microsoft account to launch the game. ', h('a', { href: '#', style: { color: 'var(--accent)' }, onclick: (e) => (e.preventDefault(), navigate('settings', { tab: 'accounts' })) }, 'Open account settings'))) : null,
      busy && task
        ? h(
            'div.hub-progress',
            h('div.lbl', h('span', task.label || 'Preparing…'), task.total ? h('span', `${task.done} / ${task.total}`) : null),
            h('div.bar' + (task.total ? '' : '.ind'), h('i', task.total ? { style: { width: Math.min(100, (task.done / task.total) * 100) + '%' } } : {})),
            btn('Cancel', { cls: 'sm ghost', onclick: () => api('task:cancel', task.id) }),
          )
        : st === 'starting'
          ? h('div.hub-progress', h('div.lbl', h('span', 'Launching Minecraft…')), h('div.bar.ind', h('i')))
          : null,
    );
  }
  draw();
  loadCount(currentProfile());
  const off = onChange(() => (draw(), loadCount(currentProfile())));

  const news = await safe(() => api('news:get'), { quiet: true });
  const list = side.querySelector('.news-list');
  if (!news) {
    list.replaceChildren(h('div.small.muted', { style: { padding: '14px' } }, 'News is unavailable right now (offline?).'));
    return off;
  }
  const featured = news.find((n) => n.type === 'release' && n.image) || news.find((n) => n.image);
  if (featured) {
    bg.style.backgroundImage = `url("${featured.image}")`;
    const img = new Image();
    img.onload = () => bg.classList.add('on');
    img.src = featured.image;
  }
  list.replaceChildren(
    ...news.slice(0, 7).map((n) =>
      h(
        'button.news-item',
        { onclick: () => n.url && api('shell:openExternal', n.url) },
        n.image ? h('img', { src: n.image, loading: 'lazy', alt: '' }) : null,
        h('div', h('div.t', n.title), h('div.d', `${n.type === 'release' ? 'Release' : 'Snapshot'} · ${timeAgo(n.date)}`)),
      ),
    ),
  );
  return off;
}

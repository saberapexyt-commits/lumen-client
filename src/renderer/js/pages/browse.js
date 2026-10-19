import { api, state, h, icon, btn, safe, toast, modal, fmtNum, timeAgo, modIcon, profileSelect, currentProfile, profileLabel, waitTask, emptyState, LOADER_NAMES } from '../core.js';
import { navigate } from '../app.js';

const PAGE_SIZE = 25;
const SORTS = [['relevance', 'Relevance'], ['downloads', 'Downloads'], ['updated', 'Recently updated'], ['newest', 'Newest']];

export async function renderBrowse(root) {
  const q = { provider: localStorage.getItem('provider') || 'modrinth', query: '', sort: 'relevance', category: '', offset: 0, matchProfile: true };
  let installedKeys = new Set();
  let providerStatus = {};
  let loading = false;
  let seq = 0;

  const targetBar = h('div.target');
  const sourceSeg = h('div.seg');
  const sortSel = h('select.input', { style: { width: '170px' }, onchange: (e) => ((q.sort = e.target.value), run(true)) }, SORTS.map(([v, l]) => h('option', { value: v }, l)));
  const searchIn = h('input.input', { placeholder: 'Search mods by name…', oninput: debounce((e) => ((q.query = e.target.value.trim()), run(true)), 320) });
  const catList = h('div.catlist');
  const results = h('div.results');
  const notice = h('div');

  const side = h('div.browse-side', h('div.lbl', 'Categories'), catList);
  const top = h(
    'div.browse-top',
    targetBar,
    h('div.row', h('div.search.grow', icon('search'), searchIn), sourceSeg, sortSel),
    notice,
  );
  root.append(h('div.browse', side, h('div.browse-main', top, results)));

  /* ----- header pieces ----- */
  function drawTarget() {
    const p = currentProfile();
    targetBar.replaceChildren(
      h('span.muted', 'Installing for'),
      p ? h('span.ver', icon('gamepad', 14), `${p.mcVersion} · ${LOADER_NAMES[p.loader]}`) : h('span.chip.warn', 'No profile'),
      state.profiles.length ? (() => { const sel = profileSelect(() => (drawTarget(), loadInstalled().then(() => run(true)))); sel.style.minWidth = '0'; sel.style.width = '230px'; return sel; })() : null,
      h('div.grow'),
      h('label.row.small.muted', { title: "Hide mods that have no release for this profile's Minecraft version and loader" }, h('input', { type: 'checkbox', checked: q.matchProfile, onchange: (e) => ((q.matchProfile = e.target.checked), run(true)) }), 'Compatible only'),
    );
    top.querySelector('.target select')?.classList.add('sm');
  }
  function drawSource() {
    sourceSeg.replaceChildren(
      ...[['modrinth', 'Modrinth'], ['curseforge', 'CurseForge']].map(([id, label]) =>
        h('button' + (q.provider === id ? '.on' : ''), { onclick: () => ((q.provider = id), localStorage.setItem('provider', id), drawSource(), loadCategories(), run(true)) }, label),
      ),
    );
    const st = providerStatus[q.provider];
    notice.replaceChildren(
      st && !st.ok
        ? h('div.note.warn', { style: { margin: '10px 0 0' } }, icon('alert'), h('div.grow', h('b', 'CurseForge is not set up. '), st.reason), btn('Add API key', { cls: 'sm', onclick: () => navigate('settings', { tab: 'sources' }) }))
        : null,
    );
  }
  sortSel.value = q.sort;

  async function loadInstalled() {
    const p = currentProfile();
    installedKeys = new Set();
    if (!p || p.loader === 'vanilla') return;
    for (const m of (await safe(() => api('mods:list', p.id), { quiet: true })) || []) if (m.projectId) installedKeys.add(`${m.provider}:${m.projectId}`);
  }

  async function loadCategories() {
    q.category = '';
    const draw = (cats) =>
      catList.replaceChildren(
        h('button.cat' + (q.category === '' ? '.on' : ''), { onclick: () => pick('') }, 'All mods'),
        ...cats.map((c) => h('button.cat' + (q.category === c.id ? '.on' : ''), { onclick: () => pick(c.id) }, c.name)),
      );
    const pick = (id) => ((q.category = id), draw(cache), run(true));
    let cache = [];
    draw(cache);
    const st = providerStatus[q.provider];
    if (st && !st.ok) return;
    cache = (await safe(() => api('mods:categories', q.provider), { quiet: true })) || [];
    draw(cache);
  }

  /* ----- results ----- */
  const skeleton = () => Array.from({ length: 7 }, () => h('div.mrow', h('div.micon.skel'), h('div.info', h('div.skel', { style: { height: '13px', width: '200px', marginBottom: '7px' } }), h('div.skel', { style: { height: '11px', width: '70%' } }))));

  async function run(reset) {
    if (loading && !reset) return;
    const my = ++seq;
    const p = currentProfile();
    if (reset) {
      q.offset = 0;
      results.replaceChildren(...skeleton());
      results.scrollTop = 0;
    }
    const st = providerStatus[q.provider];
    if (st && !st.ok) {
      results.replaceChildren(emptyState('alert', 'This source needs setup', st.reason));
      return;
    }
    loading = true;
    const filters = q.matchProfile && p && p.loader !== 'vanilla' ? { mcVersion: p.mcVersion, loader: p.loader } : {};
    let r;
    try {
      r = await api('mods:search', q.provider, { query: q.query, sort: q.sort, category: q.category || undefined, offset: q.offset, limit: PAGE_SIZE, ...filters });
    } catch (e) {
      if (my !== seq) return;
      loading = false;
      results.replaceChildren(emptyState('alert', 'Search failed', String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), btn('Try again', { icon: 'refresh', onclick: () => run(true) })));
      return;
    }
    if (my !== seq) return;
    loading = false;
    results.querySelector('.more')?.remove();
    if (reset) results.replaceChildren();
    if (reset && !r.hits.length) {
      results.append(emptyState('search', 'No mods found', p && q.matchProfile ? `Nothing matches "${q.query}" for ${p.mcVersion} ${LOADER_NAMES[p.loader]}.` : 'Try a different search.', q.matchProfile && p ? btn('Show incompatible too', { onclick: () => ((q.matchProfile = false), drawTarget(), run(true)) }) : null));
      return;
    }
    r.hits.forEach((m) => results.append(modRow(m)));
    q.offset += r.hits.length;
    if (q.offset < r.total) results.append(h('div.more', { style: { textAlign: 'center', padding: '14px' } }, btn(`Show more  ·  ${fmtNum(r.total - q.offset)} remaining`, { onclick: () => run(false) })));
  }

  function modRow(m) {
    const p = currentProfile();
    const have = installedKeys.has(`${m.provider}:${m.id}`);
    const can = p && p.loader !== 'vanilla';
    const installBtn = have
      ? h('span.chip.ok', icon('check'), 'Installed')
      : btn('Install', { cls: 'primary sm', disabled: !can, title: can ? '' : 'Choose a profile with a mod loader first', onclick: () => openInstall(m, undefined, installBtn) });
    return h(
      'div.mrow',
      modIcon(m.iconUrl, m.title),
      h(
        'div.info',
        h('div.name', m.title, h('small', `by ${m.author || 'unknown'}`), m.allowDistribution === false ? h('span.chip.warn', 'Manual download') : null),
        h('div.desc', m.summary),
        h('div.meta', h('span', icon('download'), fmtNum(m.downloads)), m.updated ? h('span', icon('clock'), timeAgo(m.updated)) : null, ...m.categories.filter((c) => !/^(fabric|forge|neoforge|quilt|liteloader|rift)$/.test(c)).slice(0, 2).map((c) => h('span', { style: { textTransform: 'capitalize' } }, c))),
      ),
      h('div.acts', installBtn, btn('', { cls: 'sm ghost', icon: 'list', title: 'Choose another version', disabled: !can, onclick: () => openVersions(m) }), btn('', { cls: 'sm ghost', icon: 'link', title: `Open on ${m.provider === 'modrinth' ? 'Modrinth' : 'CurseForge'}`, onclick: () => api('shell:openExternal', m.url) })),
    );
  }

  /* ----- install flow: resolve -> review -> install ----- */
  async function openInstall(m, fileId, trigger) {
    const p = currentProfile();
    const busy = modal({ title: `Install ${m.title}`, body: h('div.empty', h('span.spinner'), 'Finding a compatible file and its dependencies…') });
    const plan = await safe(() => api('mods:plan', p.id, { provider: m.provider, projectId: m.id, fileId }));
    busy.close();
    if (!plan) return;
    const optional = new Set();
    const files = plan.items.filter((i) => i.file.url).length;
    modal({
      title: `Install ${m.title}`,
      wide: true,
      body: h(
        'div',
        h('div.row', { style: { marginBottom: '12px' } }, h('span.muted', 'For profile'), h('b', p.name), h('span.chip.accent', profileLabel(p))),
        plan.blockers.length ? h('div.note.bad', icon('alert'), h('div', plan.blockers.map((b) => h('div', b)))) : null,
        plan.warnings.length ? h('div.note.warn', icon('alert'), h('div', plan.warnings.map((b) => h('div', b)))) : null,
        h('h2.sec', { style: { marginTop: 0 } }, `Will be installed (${plan.items.length})`),
        plan.items.map((it) =>
          h('div.plan-item', modIcon(it.project.iconUrl, it.project.title), h('div.grow', h('b', it.project.title), h('div.small.muted.ellipsis', `${it.file.versionNumber}  ·  ${it.file.fileName}`), it.role === 'dependency' ? h('div.small.faint', `Required by ${it.requiredBy}`) : null, it.loaderNote ? h('div.small.faint', it.loaderNote) : null), it.file.url ? h('span.chip' + (it.role === 'requested' ? '.accent' : ''), it.role === 'requested' ? 'Mod' : 'Dependency') : h('span.chip.warn', 'Manual download')),
        ),
        plan.optional.length
          ? [h('h2.sec', 'Optional (only installed if ticked)'), plan.optional.map((o) => h('label.plan-item', h('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? optional.add(o.project.id) : optional.delete(o.project.id)) }), modIcon(o.project.iconUrl, o.project.title), h('div.grow', h('b', o.project.title), h('div.small.faint', `Recommended by ${o.requiredBy}`))))]
          : null,
        plan.manualDownloads.length ? h('div.note.info', { style: { marginTop: '10px' } }, icon('info'), h('div', 'Mods marked "Manual download" are skipped. Download them from the website and add them with Installed → Add files.')) : null,
      ),
      actions: [
        (close) => btn('Cancel', { onclick: close }),
        (close) =>
          btn(plan.blockers.length ? 'Install anyway' : `Install ${files} file${files === 1 ? '' : 's'}`, {
            cls: 'primary',
            disabled: !files,
            onclick: async () => {
              close();
              const taskId = await safe(() => api('mods:install', p.id, { provider: m.provider, projectId: m.id, fileId, ignoreBlockers: plan.blockers.length > 0 }, [...optional].map((id) => ({ provider: m.provider, projectId: id }))));
              if (!taskId) return;
              const t = await waitTask(taskId);
              if (t.status === 'done') {
                toast(`Installed ${t.result.installed.join(', ')}`, 'ok');
                await loadInstalled();
                const row = trigger?.closest?.('.mrow');
                if (row) trigger.replaceWith(h('span.chip.ok', icon('check'), 'Installed'));
              }
            },
          }),
      ],
    });
  }

  async function openVersions(m) {
    const p = currentProfile();
    const busy = modal({ title: `${m.title} versions`, body: h('div.empty', h('span.spinner')) });
    const list = await safe(() => api('mods:versions', p.id, m.provider, m.id));
    busy.close();
    if (!list) return;
    modal({
      title: `${m.title} - versions`,
      wide: true,
      body: h(
        'div',
        h('div.note.info', icon('info'), h('div.small', `Target: ${profileLabel(p)}. Releases for another Minecraft version or loader can still be installed, but may not work.`)),
        list.slice(0, 80).map((v) =>
          h(
            'div.plan-item',
            h('div.grow', h('b', v.file.versionNumber), h('div.small.muted', `${v.file.gameVersions.slice(0, 4).join(', ')}${v.file.gameVersions.length > 4 ? '…' : ''}  ·  ${v.file.loaders.join('/')}  ·  ${timeAgo(v.file.datePublished)}`), v.compatible ? null : h('div.small', { style: { color: 'var(--warn)' } }, v.reason)),
            v.file.releaseType !== 'release' ? h('span.chip.warn', v.file.releaseType) : null,
            v.recommended ? h('span.chip.gold', icon('star'), 'Recommended') : v.compatible ? h('span.chip.ok', v.viaFabric ? 'Fabric build' : 'Compatible') : h('span.chip.bad', 'Incompatible'),
            btn(v.compatible ? 'Install' : 'Install anyway', { cls: 'sm' + (v.compatible ? ' primary' : ''), onclick: () => (document.querySelectorAll('.scrim').forEach((s) => s.remove()), openInstall(m, v.file.fileId)) }),
          ),
        ),
      ),
      actions: [(close) => btn('Close', { onclick: close })],
    });
  }

  drawTarget();
  drawSource();
  providerStatus = (await safe(() => api('mods:providers'), { quiet: true })) || {};
  drawSource();
  await Promise.all([loadInstalled(), loadCategories()]);
  run(true);
}

function debounce(fn, ms) {
  let t;
  return (...a) => (clearTimeout(t), (t = setTimeout(() => fn(...a), ms)));
}

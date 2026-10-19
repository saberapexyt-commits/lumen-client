import { api, state, h, icon, btn, safe, toast, modal, fmtNum, timeAgo, modIcon, profileSelect, currentProfile, profileLabel, waitTask, onChange, LOADER_NAMES } from '../core.js';
import { navigate } from '../app.js';

const PAGE_SIZE = 20;

export async function renderBrowse(root) {
  const page = h('div.page');
  root.append(page);
  const q = { provider: localStorage.getItem('provider') || 'modrinth', query: '', sort: 'relevance', category: '', offset: 0, matchProfile: true, mc: '', loader: '' };
  let installedKeys = new Set();
  let providerStatus = {};
  let loading = false;

  const profileBox = h('div.row.wrap');
  const results = h('div');
  const more = h('div', { style: { textAlign: 'center', margin: '10px' } });
  const catSel = h('select.input', { onchange: (e) => ((q.category = e.target.value), run(true)) });
  const sortSel = h(
    'select.input',
    { onchange: (e) => ((q.sort = e.target.value), run(true)) },
    [['relevance', 'Relevance'], ['downloads', 'Most downloads'], ['updated', 'Recently updated'], ['newest', 'Newest']].map(([v, l]) => h('option', { value: v }, l)),
  );
  const search = h('input.input', { placeholder: 'Search mods…', oninput: debounce((e) => ((q.query = e.target.value), run(true)), 350) });
  const providerSeg = h('div.seg');
  const notice = h('div');

  function drawProfile() {
    const p = currentProfile();
    profileBox.replaceChildren(
      h('span.muted', 'Installing into'),
      state.profiles.length ? profileSelect(() => (drawProfile(), loadInstalled().then(() => run(true)))) : h('span.chip.warn', 'No profile yet'),
      p ? h('span.chip.accent', `${p.mcVersion} · ${LOADER_NAMES[p.loader]}`) : null,
      p && p.loader === 'vanilla' ? h('span.chip.bad', 'Vanilla cannot load mods') : null,
      h('label.row.small.muted', { style: { marginLeft: 'auto' }, title: 'Only show mods that have a release for this profile\'s Minecraft version and loader' }, h('input', { type: 'checkbox', checked: q.matchProfile, onchange: (e) => ((q.matchProfile = e.target.checked), run(true)) }), 'Only compatible with this profile'),
    );
  }
  function drawProviders() {
    providerSeg.replaceChildren(
      ...['modrinth', 'curseforge'].map((id) =>
        h('button' + (q.provider === id ? '.on' : ''), { onclick: () => ((q.provider = id), localStorage.setItem('provider', id), drawProviders(), loadCategories(), run(true)) }, id === 'modrinth' ? 'Modrinth' : 'CurseForge'),
      ),
    );
    const st = providerStatus[q.provider];
    notice.replaceChildren(
      st && !st.ok
        ? h('div.banner.warn', icon('alert'), h('div.grow', h('b', 'CurseForge is not set up. '), st.reason), btn('Open settings', { cls: 'sm', onclick: () => navigate('settings', { tab: 'sources' }) }))
        : null,
    );
  }

  async function loadInstalled() {
    const p = currentProfile();
    installedKeys = new Set();
    if (!p || p.loader === 'vanilla') return;
    const list = await safe(() => api('mods:list', p.id), { quiet: true });
    for (const m of list || []) if (m.projectId) installedKeys.add(`${m.provider}:${m.projectId}`);
  }

  async function loadCategories() {
    catSel.replaceChildren(h('option', { value: '' }, 'All categories'));
    q.category = '';
    const st = providerStatus[q.provider];
    if (st && !st.ok) return;
    const cats = await safe(() => api('mods:categories', q.provider), { quiet: true });
    for (const c of cats || []) catSel.append(h('option', { value: c.id }, c.name));
  }

  async function run(reset) {
    if (loading) return;
    const p = currentProfile();
    if (reset) {
      q.offset = 0;
      results.replaceChildren(h('div.empty', h('span.spinner')));
      more.replaceChildren();
    }
    const st = providerStatus[q.provider];
    if (st && !st.ok) return void results.replaceChildren();
    loading = true;
    const filters = q.matchProfile && p && p.loader !== 'vanilla' ? { mcVersion: p.mcVersion, loader: p.loader } : {};
    const r = await safe(() => api('mods:search', q.provider, { query: q.query, sort: q.sort, category: q.category || undefined, offset: q.offset, limit: PAGE_SIZE, ...filters }));
    loading = false;
    if (!r) return void results.replaceChildren(h('div.empty', 'Search failed.'));
    if (reset) results.replaceChildren();
    if (reset && !r.hits.length) results.append(h('div.empty', h('div.big', '🔍'), 'No mods found. Try a different search or uncheck the compatibility filter.'));
    r.hits.forEach((m) => results.append(modCard(m)));
    q.offset += r.hits.length;
    more.replaceChildren(q.offset < r.total ? btn(`Load more (${fmtNum(r.total - q.offset)} left)`, { onclick: () => run(false) }) : null);
  }

  function modCard(m) {
    const p = currentProfile();
    const isInstalled = installedKeys.has(`${m.provider}:${m.id}`);
    const canInstall = p && p.loader !== 'vanilla';
    return h(
      'div.mod',
      modIcon(m.iconUrl, m.title),
      h(
        'div.grow',
        h('h3', m.title, h('span.muted.small', `by ${m.author || 'unknown'}`), isInstalled ? h('span.chip.ok', 'Installed') : null, m.allowDistribution === false ? h('span.chip.warn', 'Manual download') : null),
        h('p', m.summary),
        h('div.stats', h('span.chip', `⬇ ${fmtNum(m.downloads)}`), m.updated ? h('span.chip', `Updated ${timeAgo(m.updated)}`) : null, ...m.categories.slice(0, 3).map((c) => h('span.chip', c))),
      ),
      h(
        'div.acts',
        btn(isInstalled ? 'Reinstall' : 'Install', { cls: 'primary sm', icon: 'download', disabled: !canInstall, title: canInstall ? '' : 'Pick a profile with a mod loader first', onclick: () => openInstall(m) }),
        btn('Versions', { cls: 'sm', icon: 'list', disabled: !canInstall, onclick: () => openVersions(m) }),
        btn('Website', { cls: 'sm ghost', icon: 'link', onclick: () => api('shell:openExternal', m.url) }),
      ),
    );
  }

  /* ---- install flow: plan -> review -> install ---- */
  async function openInstall(m, fileId) {
    const p = currentProfile();
    const loadingModal = modal({ title: `Install ${m.title}`, body: h('div.empty', h('span.spinner'), h('p', 'Finding compatible files and dependencies…')) });
    const plan = await safe(() => api('mods:plan', p.id, { provider: m.provider, projectId: m.id, fileId }));
    loadingModal.close();
    if (!plan) return;
    const optional = new Set();
    const body = h(
      'div',
      h('p.muted.small', `Target: ${profileLabel(p)}. Only files that explicitly support this version and loader are used.`),
      plan.blockers.length ? h('div.banner.bad', icon('alert'), h('div', plan.blockers.map((b) => h('div', b)))) : null,
      plan.warnings.length ? h('div.banner.warn', icon('alert'), h('div', plan.warnings.map((b) => h('div', b)))) : null,
      h('h2', 'Will be installed'),
      plan.items.map((it) =>
        h('div.plan-item', modIcon(it.project.iconUrl, it.project.title), h('div.grow', h('b', it.project.title), h('div.small.muted', `${it.file.versionNumber}  ·  ${it.file.fileName}`, it.role === 'dependency' ? `  ·  required by ${it.requiredBy}` : ''), it.loaderNote ? h('div.small.muted', it.loaderNote) : null), it.file.url ? h('span.chip' + (it.role === 'requested' ? '.accent' : ''), it.role === 'requested' ? 'Mod' : 'Dependency') : h('span.chip.warn', 'Manual download')),
      ),
      plan.optional.length
        ? [
            h('h2', { style: { marginTop: '14px' } }, 'Optional extras (not installed unless ticked)'),
            plan.optional.map((o) => h('label.plan-item', h('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? optional.add(o.project.id) : optional.delete(o.project.id)) }), modIcon(o.project.iconUrl, o.project.title), h('div.grow', h('b', o.project.title), h('div.small.muted', `recommended by ${o.requiredBy}`)))),
          ]
        : null,
      plan.manualDownloads.length ? h('div.banner', icon('info'), h('div.small', 'Mods marked "Manual download" will be skipped. Download them from the website and add them via Installed → Add files.')) : null,
    );
    modal({
      title: `Install ${m.title}`,
      body,
      wide: true,
      actions: [
        (close) => btn('Cancel', { onclick: close }),
        (close) =>
          btn(plan.blockers.length ? 'Install anyway' : `Install ${plan.items.filter((i) => i.file.url).length} file(s)`, {
            cls: 'primary',
            disabled: !plan.items.some((i) => i.file.url),
            onclick: async () => {
              close();
              const taskId = await safe(() => api('mods:install', p.id, { provider: m.provider, projectId: m.id, fileId, ignoreBlockers: plan.blockers.length > 0 }, [...optional].map((id) => ({ provider: m.provider, projectId: id }))));
              if (!taskId) return;
              const t = await waitTask(taskId);
              if (t.status === 'done') {
                toast(`Installed: ${t.result.installed.join(', ')}`, 'ok');
                await loadInstalled();
                run(true);
              }
            },
          }),
      ],
    });
  }

  async function openVersions(m) {
    const p = currentProfile();
    const lm = modal({ title: `${m.title} - versions`, body: h('div.empty', h('span.spinner')), wide: true });
    const list = await safe(() => api('mods:versions', p.id, m.provider, m.id));
    lm.close();
    if (!list) return;
    modal({
      title: `${m.title} - versions for ${profileLabel(p)}`,
      wide: true,
      body: h(
        'div',
        h('p.muted.small', 'Green builds match this profile. Others target a different Minecraft version or loader - you can still install one, but it may not work.'),
        list.slice(0, 80).map((v) =>
          h(
            'div.plan-item',
            h('div.grow', h('b', v.file.versionNumber), h('div.small.muted', `${v.file.gameVersions.slice(0, 4).join(', ')}${v.file.gameVersions.length > 4 ? '…' : ''}  ·  ${v.file.loaders.join('/')}  ·  ${timeAgo(v.file.datePublished)}`), v.compatible ? null : h('div.small', { style: { color: 'var(--warn)' } }, v.reason)),
            h('span.chip' + (v.file.releaseType === 'release' ? '' : '.warn'), v.file.releaseType),
            v.recommended ? h('span.chip.ok', 'Recommended') : v.compatible ? h('span.chip.ok', v.viaFabric ? 'Fabric build' : 'Compatible') : h('span.chip.bad', 'Incompatible'),
            btn(v.compatible ? 'Install' : 'Install anyway', { cls: 'sm' + (v.compatible ? ' primary' : ''), onclick: () => (document.querySelectorAll('.scrim').forEach((s) => s.remove()), openInstall(m, v.file.fileId)) }),
          ),
        ),
      ),
      actions: [(close) => btn('Close', { onclick: close })],
    });
  }

  page.append(
    h('h1', 'Mods'),
    h('p.sub', 'Search Modrinth and CurseForge. Compatible releases and required dependencies are selected for you.'),
    profileBox,
    h('div.spacer', { style: { height: '8px' } }),
    h('div.row', providerSeg, h('div.grow', search)),
    h('div.spacer', { style: { height: '8px' } }),
    h('div.row', h('div.grow', catSel), h('div', { style: { width: '200px' } }, sortSel)),
    h('div.spacer', { style: { height: '10px' } }),
    notice,
    results,
    more,
  );

  drawProfile();
  providerStatus = (await safe(() => api('mods:providers'), { quiet: true })) || {};
  drawProviders();
  await Promise.all([loadInstalled(), loadCategories()]);
  run(true);
  const off = onChange(() => {});
  return off;
}

function debounce(fn, ms) {
  let t;
  return (...a) => (clearTimeout(t), (t = setTimeout(() => fn(...a), ms)));
}

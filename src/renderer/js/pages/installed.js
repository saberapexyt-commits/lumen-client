import { api, state, h, icon, btn, safe, toast, confirmDialog, modIcon, profileSelect, currentProfile, profileLabel, waitTask, switchEl, emptyState } from '../core.js';
import { navigate } from '../app.js';

const KINDS = [['mod', 'Mods'], ['resourcepack', 'Resource packs'], ['shader', 'Shaders']];
const KIND_WORD = { mod: 'mods', resourcepack: 'resource packs', shader: 'shaders' };

export async function renderInstalled(root) {
  const page = h('div.page');
  root.append(page);
  let kind = localStorage.getItem('installedKind') || 'mod';
  let items = []; // mods or packs of the current kind
  let updates = new Map(); // key -> update info
  let problems = [];
  let view = 'all';
  let text = '';
  let loaded = false;
  const head = h('div');
  const bar = h('div.ibar');
  const health = h('div');
  const list = h('div');
  const cur = () => currentProfile();
  const isMods = () => kind === 'mod';

  async function load() {
    const p = cur();
    loaded = false;
    draw();
    if (p && (kind !== 'mod' || p.loader !== 'vanilla')) {
      items = (isMods() ? await safe(() => api('mods:list', p.id)) : await safe(() => api('packs:list', p.id, kind))) || [];
      problems = isMods() ? (await safe(() => api('mods:diagnose', p.id), { quiet: true })) || [] : [];
    } else items = [];
    loaded = true;
    draw();
  }

  async function addFiles() {
    const p = cur();
    const r = await safe(() => api(isMods() ? 'mods:importFiles' : 'packs:addFiles', ...(isMods() ? [p.id] : [p.id, kind])));
    if (!r) return;
    toast(r.added.length ? `Added ${r.added.length} file${r.added.length === 1 ? '' : 's'}.` : 'Nothing added (already present or not a supported file).', r.added.length ? 'ok' : '');
    load();
  }

  async function importFolder() {
    const r = await safe(() => api('mods:importFolder', cur().id));
    if (!r) return;
    toast(r.added.length ? `Added ${r.added.length} mod${r.added.length === 1 ? '' : 's'}${r.skipped.length ? ` (${r.skipped.length} skipped)` : ''}.` : `Nothing added: ${r.skipped.join(', ') || 'no jar files found'}`, r.added.length ? 'ok' : '');
    load();
  }

  async function checkUpdates(btnEl) {
    btnEl.disabled = true;
    const r = await safe(() => (isMods() ? api('mods:checkUpdates', cur().id) : api('packs:checkUpdates', cur().id, kind)));
    btnEl.disabled = false;
    if (!r) return;
    updates = new Map(r.updates.map((u) => [u.key, u]));
    toast(r.updates.length ? `${r.updates.length} update${r.updates.length === 1 ? '' : 's'} available.` : 'Everything is up to date.', r.updates.length ? 'ok' : '');
    if (r.unchecked.length) toast(`Could not check: ${r.unchecked.join(', ')}`, 'error');
    draw();
  }

  async function updateItems(keys) {
    const taskId = await safe(() => api(isMods() ? 'mods:update' : 'packs:update', cur().id, keys));
    if (!taskId) return;
    const t = await waitTask(taskId);
    if (t.status === 'done') {
      toast('Updated. Previous versions were moved to the profile trash.', 'ok');
      keys.forEach((k) => updates.delete(k));
      load();
    }
  }

  async function remove(m) {
    const p = cur();
    const deps = isMods() ? (await safe(() => api('mods:dependents', p.id, m.key))) || [] : [];
    const body = h('div', h('p', { style: { marginTop: 0 } }, `Remove ${m.title} from ${p.name}?`), deps.length ? h('div.note.warn', icon('alert'), h('div', h('b', 'Needed by: '), deps.map((d) => d.title).join(', '))) : null, h('p.muted.small', "The file is moved to this profile's trash folder, not deleted."));
    if (!(await confirmDialog(`Remove ${isMods() ? 'mod' : 'pack'}`, body, { confirm: 'Remove', danger: true }))) return;
    const r = await safe(() => api(isMods() ? 'mods:remove' : 'packs:remove', p.id, m.key));
    if (!r) return;
    toast(`Removed ${m.title}.`);
    if (isMods() && r?.orphans?.length && (await confirmDialog('Remove unused dependencies?', `${r.orphans.map((o) => o.title).join(', ')} ${r.orphans.length > 1 ? 'were' : 'was'} only installed as a dependency and nothing needs ${r.orphans.length > 1 ? 'them' : 'it'} anymore.`, { confirm: 'Remove them' }))) {
      for (const o of r.orphans) await safe(() => api('mods:remove', p.id, o.key));
    }
    load();
  }

  async function toggle(m, on) {
    await safe(() => (isMods() ? api('mods:toggle', cur().id, m.key, on) : api('packs:toggle', cur().id, m.key, on)));
    load();
  }

  function row(m) {
    const u = updates.get(m.key);
    const neededBy = isMods() ? m.requiredBy.map((k) => items.find((x) => x.key === k)?.title).filter(Boolean) : [];
    const tip = kind === 'shader' ? 'Use this shader in game' : kind === 'resourcepack' ? 'Turn this pack on in game' : 'Enable or disable this mod';
    return h(
      'div.mrow' + (m.enabled ? '' : isMods() ? '.off' : ''),
      h('div', { title: tip }, switchEl(m.enabled, (on) => toggle(m, on))),
      modIcon(m.iconUrl, m.title),
      h(
        'div.info',
        h(
          'div.name',
          m.title,
          m.versionNumber ? h('small', m.versionNumber) : null,
          !isMods() && m.enabled ? h('span.chip.ok', kind === 'shader' ? 'Active' : 'On') : null,
          isMods() && m.role === 'dependency' ? h('span.chip', neededBy.length ? `Needed by ${neededBy.join(', ')}` : 'Dependency') : null,
          u ? h('span.chip.gold', icon('up'), `Update ${u.latest.versionNumber}`) : null,
          m.releaseType && m.releaseType !== 'release' ? h('span.chip.warn', m.releaseType) : null,
          m.missing ? h('span.chip.bad', 'File missing') : null,
          m.loaderMismatch ? h('span.chip.bad', { title: m.loaderMismatch }, 'Wrong loader') : null,
        ),
        h('div.desc', m.summary || m.meta?.name || m.fileName),
        h('div.meta', h('span', m.provider === 'local' ? 'Local file' : m.provider === 'modrinth' ? 'Modrinth' : 'CurseForge'), h('span.ellipsis', m.fileName + (isMods() && !m.enabled ? '.disabled' : ''))),
      ),
      h(
        'div.acts',
        u ? btn('Update', { cls: 'primary sm', onclick: () => updateItems([m.key]) }) : null,
        m.pageUrl ? btn('', { cls: 'sm ghost', icon: 'link', title: 'Open on website', onclick: () => api('shell:openExternal', m.pageUrl) }) : null,
        btn('', { cls: 'sm ghost danger', icon: 'trash', title: 'Remove', onclick: () => remove(m) }),
      ),
    );
  }

  function draw() {
    const p = cur();
    head.replaceChildren(
      h('div.page-head', h('div.grow', h('h1', 'Installed'), h('div.sub', p ? `${p.name}  ·  ${profileLabel(p)}` : '')), state.profiles.length ? profileSelect(() => ((updates = new Map()), load())) : null),
      h('div.row', { style: { marginBottom: '12px' } }, h('div.seg', KINDS.map(([id, label]) => h('button' + (kind === id ? '.on' : ''), { onclick: () => ((kind = id), localStorage.setItem('installedKind', id), (updates = new Map()), (view = 'all'), load()) }, label)))),
    );
    const blocked = !p || (isMods() && p.loader === 'vanilla');
    const counts = { all: items.length, updates: updates.size, disabled: items.filter((m) => !m.enabled).length, issues: items.filter((m) => m.missing || m.loaderMismatch).length };
    const views = isMods() ? [['all', 'All'], ['updates', 'Updates'], ['disabled', 'Disabled'], ['issues', 'Issues']] : [['all', 'All'], ['updates', 'Updates']];
    if (!views.some(([id]) => id === view)) view = 'all';
    bar.replaceChildren(
      h('div.seg', views.map(([id, label]) => h('button' + (view === id ? '.on' : ''), { onclick: () => ((view = id), draw()) }, label, counts[id] ? h('span.count', counts[id]) : null))),
      h('div.search', { style: { width: '220px' } }, icon('search'), h('input.input', { placeholder: 'Filter…', value: text, style: { minHeight: '30px', fontSize: '13px' }, oninput: (e) => ((text = e.target.value.toLowerCase()), drawList()) })),
      h('div.grow'),
      updates.size ? btn(`Update all (${updates.size})`, { cls: 'primary sm', icon: 'up', onclick: () => updateItems([...updates.keys()]) }) : null,
      (() => { const b = btn('Check for updates', { cls: 'sm', icon: 'refresh', disabled: !items.some((m) => m.provider !== 'local') }); b.onclick = () => checkUpdates(b); return b; })(),
      btn('Add files', { cls: 'sm', icon: 'plus', disabled: blocked, onclick: addFiles }),
      isMods() ? btn('', { cls: 'sm', icon: 'folder', title: 'Import every mod from a folder…', disabled: blocked, onclick: importFolder }) : null,
      btn('', { cls: 'sm', icon: 'copy', title: `Open the ${KIND_WORD[kind]} folder`, onclick: () => p && api(isMods() ? 'mods:openFolder' : 'packs:openFolder', ...(isMods() ? [p.id] : [p.id, kind])) }),
      btn('', { cls: 'sm', icon: 'trash', title: 'Open trash (removed files are kept here)', onclick: () => p && api('mods:openTrash', p.id) }),
    );
    bar.style.display = blocked ? 'none' : '';
    const errs = problems.filter((x) => x.severity === 'error');
    health.replaceChildren(
      isMods() && p && !blocked && loaded && items.length
        ? problems.length
          ? h('div.health.' + (errs.length ? 'bad' : 'warn'), h('div.grow', h('b', errs.length ? `${errs.length} problem${errs.length === 1 ? '' : 's'} may stop the game from starting` : `${problems.length} warning${problems.length === 1 ? '' : 's'}`), h('ul', problems.map((x) => h('li', `${x.mod}: ${x.message}`)))))
          : h('div.health', icon('check'), h('span.muted', 'Health check passed - no missing dependencies or conflicts found.'))
        : null,
      !isMods() && kind === 'shader' && p && p.loader !== 'vanilla' && items.length ? h('div.note.info', icon('info'), h('div.small', 'Only one shader is active at a time. Shaders need Iris (Oculus on Forge), which is installed for you with your first shader.')) : null,
    );
    drawList();
  }

  function drawList() {
    const p = cur();
    const goBrowse = () => (localStorage.setItem('contentType', kind), navigate('browse'));
    if (!p) return list.replaceChildren(emptyState('gamepad', 'No profile selected', 'Create a profile first.', btn('Go to profiles', { cls: 'primary', onclick: () => navigate('profiles') })));
    if (isMods() && p.loader === 'vanilla') return list.replaceChildren(emptyState('cpu', 'Vanilla cannot load mods', 'Edit this profile and choose Fabric, Quilt, Forge or NeoForge.', btn('Edit profile', { cls: 'primary', onclick: () => navigate('profiles') })));
    if (kind === 'shader' && p.loader === 'vanilla') return list.replaceChildren(emptyState('cpu', 'Shaders need a mod loader', 'Edit this profile and choose Fabric, Quilt, Forge or NeoForge. Iris is installed for you with your first shader.', btn('Edit profile', { cls: 'primary', onclick: () => navigate('profiles') })));
    if (!loaded) return list.replaceChildren(h('div.empty', h('span.spinner')));
    let shown = items.filter((m) => !text || m.title.toLowerCase().includes(text) || m.fileName.toLowerCase().includes(text));
    if (view === 'updates') shown = shown.filter((m) => updates.has(m.key));
    if (view === 'disabled') shown = shown.filter((m) => !m.enabled);
    if (view === 'issues') shown = shown.filter((m) => m.missing || m.loaderMismatch);
    list.replaceChildren(
      ...(shown.length
        ? shown.map(row)
        : [items.length ? emptyState('search', view === 'updates' ? 'No updates found' : 'Nothing here', view === 'updates' ? 'Press "Check for updates" to look again.' : '') : emptyState('layers', `No ${KIND_WORD[kind]} yet`, `${KIND_WORD[kind][0].toUpperCase() + KIND_WORD[kind].slice(1)} you install for ${p.name} will appear here.`, btn(`Browse ${KIND_WORD[kind]}`, { cls: 'primary', icon: 'search', onclick: goBrowse }))]),
    );
  }

  page.append(head, bar, health, list);
  draw();
  await load();
}

import { api, state, h, icon, btn, safe, toast, modal, confirmDialog, timeAgo, modIcon, profileSelect, currentProfile, profileLabel, waitTask, switchEl, emptyState, LOADER_NAMES } from '../core.js';
import { navigate } from '../app.js';

export async function renderInstalled(root) {
  const page = h('div.page');
  root.append(page);
  let mods = [];
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

  async function load() {
    const p = cur();
    loaded = false;
    draw();
    if (p && p.loader !== 'vanilla') {
      mods = (await safe(() => api('mods:list', p.id))) || [];
      problems = (await safe(() => api('mods:diagnose', p.id), { quiet: true })) || [];
    } else mods = [];
    loaded = true;
    draw();
  }

  async function doImport(channel) {
    const r = await safe(() => api(channel, cur().id));
    if (!r) return;
    toast(r.added.length ? `Added ${r.added.length} mod${r.added.length === 1 ? '' : 's'}${r.skipped.length ? ` (${r.skipped.length} skipped)` : ''}.` : `Nothing added: ${r.skipped.join(', ') || 'no jar files found'}`, r.added.length ? 'ok' : '');
    load();
  }

  async function checkUpdates(btnEl) {
    btnEl.disabled = true;
    const r = await safe(() => api('mods:checkUpdates', cur().id));
    btnEl.disabled = false;
    if (!r) return;
    updates = new Map(r.updates.map((u) => [u.key, u]));
    toast(r.updates.length ? `${r.updates.length} update${r.updates.length === 1 ? '' : 's'} available.` : 'Everything is up to date.', r.updates.length ? 'ok' : '');
    if (r.unchecked.length) toast(`Could not check: ${r.unchecked.join(', ')}`, 'error');
    draw();
  }

  async function updateMods(keys) {
    const taskId = await safe(() => api('mods:update', cur().id, keys));
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
    const deps = (await safe(() => api('mods:dependents', p.id, m.key))) || [];
    const body = h('div', h('p', { style: { marginTop: 0 } }, `Remove ${m.title} from ${p.name}?`), deps.length ? h('div.note.warn', icon('alert'), h('div', h('b', 'Needed by: '), deps.map((d) => d.title).join(', '))) : null, h('p.muted.small', "The file is moved to this profile's trash folder, not deleted."));
    if (!(await confirmDialog('Remove mod', body, { confirm: 'Remove', danger: true }))) return;
    const r = await safe(() => api('mods:remove', p.id, m.key));
    if (!r) return;
    toast(`Removed ${m.title}.`);
    if (r.orphans.length && (await confirmDialog('Remove unused dependencies?', `${r.orphans.map((o) => o.title).join(', ')} ${r.orphans.length > 1 ? 'were' : 'was'} only installed as a dependency and nothing needs ${r.orphans.length > 1 ? 'them' : 'it'} anymore.`, { confirm: 'Remove them' }))) {
      for (const o of r.orphans) await safe(() => api('mods:remove', p.id, o.key));
    }
    load();
  }

  function row(m) {
    const u = updates.get(m.key);
    const neededBy = m.requiredBy.map((k) => mods.find((x) => x.key === k)?.title).filter(Boolean);
    const issue = m.missing || m.loaderMismatch;
    return h(
      'div.mrow' + (m.enabled ? '' : '.off'),
      switchEl(m.enabled, async (on) => {
        await safe(() => api('mods:toggle', cur().id, m.key, on));
        load();
      }),
      modIcon(m.iconUrl, m.title),
      h(
        'div.info',
        h('div.name', m.title, m.versionNumber ? h('small', m.versionNumber) : null, m.role === 'dependency' ? h('span.chip', neededBy.length ? `Needed by ${neededBy.join(', ')}` : 'Dependency') : null, u ? h('span.chip.gold', icon('up'), `Update ${u.latest.versionNumber}`) : null, m.releaseType && m.releaseType !== 'release' ? h('span.chip.warn', m.releaseType) : null, m.missing ? h('span.chip.bad', 'File missing') : null, m.loaderMismatch ? h('span.chip.bad', { title: m.loaderMismatch }, 'Wrong loader') : null),
        h('div.desc', m.summary || m.meta?.name || m.fileName),
        h('div.meta', h('span', m.provider === 'local' ? 'Local file' : m.provider === 'modrinth' ? 'Modrinth' : 'CurseForge'), h('span.ellipsis', m.fileName + (m.enabled ? '' : '.disabled'))),
      ),
      h(
        'div.acts',
        u ? btn('Update', { cls: 'primary sm', onclick: () => updateMods([m.key]) }) : null,
        m.pageUrl ? btn('', { cls: 'sm ghost', icon: 'link', title: 'Open on website', onclick: () => api('shell:openExternal', m.pageUrl) }) : null,
        btn('', { cls: 'sm ghost danger', icon: 'trash', title: 'Remove', onclick: () => remove(m) }),
      ),
    );
  }

  function draw() {
    const p = cur();
    head.replaceChildren(
      h('div.page-head', h('div.grow', h('h1', 'Installed mods'), h('div.sub', p ? `${p.name}  ·  ${profileLabel(p)}` : '')), state.profiles.length ? profileSelect(() => ((updates = new Map()), load())) : null),
    );
    const vanilla = p && p.loader === 'vanilla';
    const counts = { all: mods.length, updates: updates.size, disabled: mods.filter((m) => !m.enabled).length, issues: mods.filter((m) => m.missing || m.loaderMismatch).length };
    bar.replaceChildren(
      h('div.seg', [['all', 'All'], ['updates', 'Updates'], ['disabled', 'Disabled'], ['issues', 'Issues']].map(([id, l]) => h('button' + (view === id ? '.on' : ''), { onclick: () => ((view = id), draw()) }, l, counts[id] ? h('span.count', counts[id]) : null))),
      h('div.search', { style: { width: '220px' } }, icon('search'), h('input.input', { placeholder: 'Filter…', value: text, style: { minHeight: '30px', fontSize: '13px' }, oninput: (e) => ((text = e.target.value.toLowerCase()), drawList()) })),
      h('div.grow'),
      updates.size ? btn(`Update all (${updates.size})`, { cls: 'primary sm', icon: 'up', onclick: () => updateMods([...updates.keys()]) }) : null,
      (() => { const b = btn('Check for updates', { cls: 'sm', icon: 'refresh', disabled: !mods.some((m) => m.provider !== 'local') }); b.onclick = () => checkUpdates(b); return b; })(),
      btn('Add files', { cls: 'sm', icon: 'plus', disabled: !p || vanilla, onclick: () => doImport('mods:importFiles') }),
      btn('', { cls: 'sm', icon: 'folder', title: 'Import every mod from a folder…', disabled: !p || vanilla, onclick: () => doImport('mods:importFolder') }),
      btn('', { cls: 'sm', icon: 'copy', title: 'Open mods folder', onclick: () => p && api('mods:openFolder', p.id) }),
      btn('', { cls: 'sm', icon: 'trash', title: 'Open trash (removed mods are kept here)', onclick: () => p && api('mods:openTrash', p.id) }),
    );
    bar.style.display = !p || vanilla ? 'none' : '';
    const errs = problems.filter((x) => x.severity === 'error');
    health.replaceChildren(
      p && !vanilla && loaded && mods.length
        ? problems.length
          ? h('div.health.' + (errs.length ? 'bad' : 'warn'), h('div.grow', h('b', errs.length ? `${errs.length} problem${errs.length === 1 ? '' : 's'} may stop the game from starting` : `${problems.length} warning${problems.length === 1 ? '' : 's'}`), h('ul', problems.map((x) => h('li', `${x.mod}: ${x.message}`)))))
          : h('div.health', icon('check'), h('span.muted', 'Health check passed - no missing dependencies or conflicts found.'))
        : null,
    );
    drawList();
  }

  function drawList() {
    const p = cur();
    if (!p) return list.replaceChildren(emptyState('gamepad', 'No profile selected', 'Create a profile first.', btn('Go to profiles', { cls: 'primary', onclick: () => navigate('profiles') })));
    if (p.loader === 'vanilla') return list.replaceChildren(emptyState('cpu', 'Vanilla cannot load mods', 'Edit this profile and choose Fabric, Quilt, Forge or NeoForge.', btn('Edit profile', { cls: 'primary', onclick: () => navigate('profiles') })));
    if (!loaded) return list.replaceChildren(h('div.empty', h('span.spinner')));
    let shown = mods.filter((m) => !text || m.title.toLowerCase().includes(text) || m.fileName.toLowerCase().includes(text));
    if (view === 'updates') shown = shown.filter((m) => updates.has(m.key));
    if (view === 'disabled') shown = shown.filter((m) => !m.enabled);
    if (view === 'issues') shown = shown.filter((m) => m.missing || m.loaderMismatch);
    list.replaceChildren(
      ...(shown.length
        ? shown.map(row)
        : [mods.length ? emptyState('search', view === 'updates' ? 'No updates found' : 'Nothing here', view === 'updates' ? 'Press "Check for updates" to look again.' : '') : emptyState('layers', 'No mods yet', `Mods you install for ${p.name} will appear here.`, btn('Browse mods', { cls: 'primary', icon: 'search', onclick: () => navigate('browse') }))]),
    );
  }

  page.append(head, bar, health, list);
  draw();
  await load();
}

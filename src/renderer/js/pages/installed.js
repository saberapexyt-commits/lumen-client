import { api, state, h, icon, btn, safe, toast, modal, confirmDialog, timeAgo, modIcon, profileSelect, currentProfile, profileLabel, waitTask, switchEl, LOADER_NAMES } from '../core.js';
import { navigate } from '../app.js';

export async function renderInstalled(root) {
  const page = h('div.page');
  root.append(page);
  let mods = [];
  let updates = new Map(); // key -> UpdateInfo
  let problems = [];
  let filter = '';
  const list = h('div');
  const banners = h('div');
  const head = h('div.toolbar');

  const p0 = () => currentProfile();

  async function load() {
    const p = p0();
    if (!p) return draw();
    if (p.loader === 'vanilla') {
      mods = [];
      return draw();
    }
    list.replaceChildren(h('div.empty', h('span.spinner')));
    mods = (await safe(() => api('mods:list', p.id))) || [];
    problems = (await safe(() => api('mods:diagnose', p.id), { quiet: true })) || [];
    draw();
  }

  function drawHead() {
    const p = p0();
    head.replaceChildren(
      state.profiles.length ? profileSelect(() => ((updates = new Map()), load())) : null,
      p ? h('span.chip.accent', profileLabel(p)) : null,
      h('input.input', { style: { width: '220px' }, placeholder: 'Filter installed…', oninput: (e) => ((filter = e.target.value.toLowerCase()), draw()) }),
      h('div.grow'),
      btn('Check updates', { icon: 'refresh', onclick: checkUpdates, disabled: !mods.some((m) => m.provider !== 'local') }),
      updates.size ? btn(`Update all (${updates.size})`, { cls: 'primary', icon: 'download', onclick: () => updateMods([...updates.keys()]) }) : null,
      btn('Add files…', { icon: 'plus', onclick: () => doImport('mods:importFiles'), disabled: !p || p.loader === 'vanilla' }),
      btn('Import folder…', { icon: 'folder', onclick: () => doImport('mods:importFolder'), disabled: !p || p.loader === 'vanilla' }),
      btn('', { icon: 'folder', title: 'Open mods folder', onclick: () => p && api('mods:openFolder', p.id) }),
      btn('', { icon: 'trash', title: 'Open trash (removed mods are kept here)', onclick: () => p && api('mods:openTrash', p.id) }),
    );
  }

  async function doImport(channel) {
    const p = p0();
    const r = await safe(() => api(channel, p.id));
    if (!r) return;
    toast(`Added ${r.added.length} mod(s)${r.skipped.length ? `; skipped: ${r.skipped.join(', ')}` : ''}.`, r.added.length ? 'ok' : '');
    load();
  }

  async function checkUpdates() {
    const p = p0();
    toast('Checking for compatible updates…');
    const r = await safe(() => api('mods:checkUpdates', p.id));
    if (!r) return;
    updates = new Map(r.updates.map((u) => [u.key, u]));
    toast(r.updates.length ? `${r.updates.length} update(s) available.` : 'Everything is up to date.', r.updates.length ? 'ok' : '');
    if (r.unchecked.length) toast(`Could not check: ${r.unchecked.join(', ')}`, 'error');
    draw();
  }

  async function updateMods(keys) {
    const p = p0();
    const taskId = await safe(() => api('mods:update', p.id, keys));
    if (!taskId) return;
    const t = await waitTask(taskId);
    if (t.status === 'done') {
      toast('Updated. Previous versions were moved to the profile trash.', 'ok');
      keys.forEach((k) => updates.delete(k));
      load();
    }
  }

  async function remove(m) {
    const p = p0();
    const deps = (await safe(() => api('mods:dependents', p.id, m.key))) || [];
    const msg = h('div', h('p', `Remove "${m.title}" from ${p.name}?`), deps.length ? h('div.banner.warn', icon('alert'), h('div', h('b', 'These mods need it: '), deps.map((d) => d.title).join(', '))) : null, h('p.muted.small', 'The jar is moved to this profile\'s trash folder, not deleted.'));
    if (!(await confirmDialog('Remove mod', msg, { confirm: 'Remove', danger: true }))) return;
    const r = await safe(() => api('mods:remove', p.id, m.key));
    if (!r) return;
    toast(`Removed ${m.title}.`);
    if (r.orphans.length && (await confirmDialog('Remove unused dependencies?', `${r.orphans.map((o) => o.title).join(', ')} ${r.orphans.length > 1 ? 'were' : 'was'} only installed as a dependency and nothing needs ${r.orphans.length > 1 ? 'them' : 'it'} anymore.`, { confirm: 'Remove them' }))) {
      for (const o of r.orphans) await safe(() => api('mods:remove', p.id, o.key));
    }
    load();
  }

  function modRow(m) {
    const u = updates.get(m.key);
    const requiredBy = m.requiredBy.map((k) => mods.find((x) => x.key === k)?.title).filter(Boolean);
    return h(
      'div.mod' + (m.enabled ? '' : '.off'),
      modIcon(m.iconUrl, m.title),
      h(
        'div.grow',
        h(
          'h3',
          m.title,
          m.versionNumber ? h('span.muted.small', m.versionNumber) : null,
          h('span.chip', m.provider === 'local' ? 'Local file' : m.provider === 'modrinth' ? 'Modrinth' : 'CurseForge'),
          m.role === 'dependency' ? h('span.chip', requiredBy.length ? `Needed by ${requiredBy.join(', ')}` : 'Dependency') : null,
          m.missing ? h('span.chip.bad', 'File missing') : null,
          m.loaderMismatch ? h('span.chip.bad', { title: m.loaderMismatch }, 'Wrong loader') : null,
          u ? h('span.chip.accent', `Update → ${u.latest.versionNumber}`) : null,
          m.releaseType && m.releaseType !== 'release' ? h('span.chip.warn', m.releaseType) : null,
        ),
        h('p', m.summary || m.meta?.name || m.fileName),
        h('div.small.muted', m.fileName + (m.enabled ? '' : '.disabled')),
      ),
      h(
        'div.row',
        { style: { alignSelf: 'center' } },
        u ? btn('Update', { cls: 'primary sm', onclick: () => updateMods([m.key]) }) : null,
        m.pageUrl ? btn('', { cls: 'sm ghost', icon: 'link', title: 'Open on website', onclick: () => api('shell:openExternal', m.pageUrl) }) : null,
        btn('', { cls: 'sm ghost danger', icon: 'trash', title: 'Remove', onclick: () => remove(m) }),
        switchEl(m.enabled, async (on, el) => {
          const ok = await safe(() => api('mods:toggle', p0().id, m.key, on));
          if (ok === undefined && !on === false) {
            /* error toast already shown */
          }
          load();
        }),
      ),
    );
  }

  function draw() {
    drawHead();
    const p = p0();
    banners.replaceChildren();
    if (!p) return list.replaceChildren(h('div.empty', h('div.big', '📦'), 'Create a profile first.', h('div.spacer'), btn('New profile', { cls: 'primary', onclick: () => navigate('profiles') })));
    if (p.loader === 'vanilla') return list.replaceChildren(h('div.empty', h('div.big', '🧊'), 'This is a Vanilla profile - it can\'t load mods.', h('div.spacer'), btn('Change loader', { cls: 'primary', onclick: () => navigate('profiles') })));
    if (problems.length) {
      const errs = problems.filter((x) => x.severity === 'error');
      banners.append(
        h(
          'div.banner.' + (errs.length ? 'bad' : 'warn'),
          icon('alert'),
          h('div', h('b', errs.length ? 'These problems will likely stop the game from starting:' : 'Heads up:'), problems.map((x) => h('div.small', `• ${x.mod}: ${x.message}`))),
        ),
      );
    } else if (mods.length) banners.append(h('div.banner.ok', icon('check'), h('div.small', 'Health check passed - no missing dependencies or conflicts detected.')));
    const shown = mods.filter((m) => !filter || m.title.toLowerCase().includes(filter) || m.fileName.toLowerCase().includes(filter));
    list.replaceChildren(
      ...(shown.length ? shown.map(modRow) : [h('div.empty', h('div.big', '📦'), mods.length ? 'No mods match your filter.' : 'No mods installed yet.', h('div.spacer'), mods.length ? null : btn('Browse mods', { cls: 'primary', icon: 'box', onclick: () => navigate('browse') }))]),
    );
  }

  page.append(h('h1', 'Installed mods'), h('p.sub', 'Enable, disable, update and remove mods for the selected profile. Nothing here touches your other profiles.'), head, banners, list);
  drawHead();
  await load();
}

import {
  api, state, h, icon, btn, safe, toast, modal, confirmDialog, refreshProfiles, selectProfile, profileLabel, timeAgo, fmtPlay,
  LOADER_NAMES, waitTask, onChange, emit,
} from '../core.js';
import { navigate } from '../app.js';

export async function playProfile(id) {
  if (!state.accounts.accounts.length) {
    toast('Sign in with your Microsoft account first (Settings → Accounts).', 'error');
    navigate('settings', { tab: 'accounts' });
    return;
  }
  state.states[id] = 'starting';
  const taskId = await safe(() => api('game:play', id));
  if (!taskId) delete state.states[id];
  else {
    selectProfile(id);
    const t = await waitTask(taskId);
    if (t.status !== 'done') {
      delete state.states[id];
      emit();
    }
  }
}

export async function renderProfiles(root) {
  const page = h('div.page');
  root.append(page);
  const grid = h('div.pgrid');
  const draw = () => {
    grid.replaceChildren(
      ...state.profiles.map((p) => profileCard(p)),
      h('button.pcard', { style: { alignItems: 'center', justifyContent: 'center', minHeight: '150px', cursor: 'pointer', border: '1px dashed var(--border)', color: 'var(--muted)' }, onclick: () => openProfileDialog() }, icon('plus', 28), 'New profile'),
    );
  };
  page.append(
    h('h1', 'Play'),
    h('p.sub', 'Every profile is a separate installation - its own Minecraft version, loader, mods, configs and worlds.'),
    h('div.toolbar', btn('New profile', { cls: 'primary', icon: 'plus', onclick: () => openProfileDialog() }), btn('Import modpack…', { icon: 'download', onclick: importPack }), h('span.muted.small', 'Supports Modrinth .mrpack, CurseForge packs and Lumen backups')),
    grid,
  );
  draw();
  return onChange(draw);
}

async function importPack() {
  const taskId = await safe(() => api('packs:import'));
  if (!taskId) return;
  const t = await waitTask(taskId);
  if (t.status === 'done') {
    await refreshProfiles();
    const r = t.result;
    toast(`Imported "${r.profile.name}"${r.warnings?.length ? '\n' + r.warnings.join('\n') : ''}`, 'ok');
    if (r.manualDownloads?.length) {
      modal({
        title: 'Some mods need a manual download',
        body: h('div', h('p.muted', 'These authors disable third-party downloads. Download each from CurseForge, then use Installed → Add files.'), r.manualDownloads.map((m) => h('div.plan-item', h('div.grow', m.name), m.url ? btn('Open page', { cls: 'sm', icon: 'link', onclick: () => api('shell:openExternal', m.url) }) : null))),
        actions: [(close) => btn('Close', { onclick: close })],
      });
    }
  }
}

function profileCard(p) {
  const st = state.states[p.id];
  return h(
    'div.pcard',
    { style: { '--pc': p.color } },
    h(
      'div.row',
      h('div.ptile', p.name.slice(0, 1).toUpperCase()),
      h('div.grow', h('div.nm', p.name), h('div.small.muted', profileLabel(p))),
      st === 'running' ? h('span.chip.ok', 'Running') : st === 'starting' ? h('span.chip.warn', 'Starting') : null,
    ),
    h('div.small.muted', `Last played ${timeAgo(p.lastPlayed)}  ·  ${fmtPlay(p.playTimeMs || 0)} played`),
    h(
      'div.row',
      st === 'running'
        ? btn('Stop', { cls: 'danger grow', onclick: () => api('game:kill', p.id) })
        : btn(st === 'starting' ? 'Starting…' : 'Play', { cls: 'primary grow', icon: 'play', disabled: !!st, onclick: () => playProfile(p.id) }),
      btn('Mods', { icon: 'box', onclick: () => (selectProfile(p.id), navigate('installed')) }),
      btn('', { icon: 'edit', title: 'Edit profile', onclick: () => openProfileDialog(p) }),
    ),
  );
}

/* ---------------- create / edit dialog ---------------- */
export async function openProfileDialog(existing) {
  const manifest = await safe(() => api('versions:list'));
  if (!manifest) return;
  const isEdit = !!existing;
  const data = {
    name: existing?.name || '',
    mcVersion: existing?.mcVersion || manifest.latest.release,
    loader: existing?.loader || 'fabric',
    loaderVersion: existing?.loaderVersion || '',
    ramMb: existing?.ramMb || state.settings.defaultRamMb || 4096,
    showSnap: false,
  };
  const supported = {}; // loader -> versions[]
  const nameIn = h('input.input', { value: data.name, placeholder: 'e.g. Survival, PvP, Performance…', maxlength: 40, oninput: (e) => (data.name = e.target.value) });
  const verSel = h('select.input', { onchange: (e) => ((data.mcVersion = e.target.value), checkLoaders()) });
  const fillVersions = () => {
    const list = manifest.versions.filter((v) => v.type === 'release' || (data.showSnap && v.type === 'snapshot') || v.id === data.mcVersion);
    verSel.replaceChildren(...list.map((v) => h('option', { value: v.id, selected: v.id === data.mcVersion }, v.id + (v.type !== 'release' ? ` (${v.type})` : ''))));
  };
  const loaderSeg = h('div.seg');
  const loaderVerSel = h('select.input', { onchange: (e) => (data.loaderVersion = e.target.value) });
  const loaderNote = h('div.small.muted');
  const ramVal = h('b', `${(data.ramMb / 1024).toFixed(1)} GB`);
  const ram = h('input', { type: 'range', min: 1024, max: 16384, step: 512, value: data.ramMb, oninput: (e) => ((data.ramMb = +e.target.value), (ramVal.textContent = `${(data.ramMb / 1024).toFixed(1)} GB`)) });

  const drawLoaders = () => {
    loaderSeg.replaceChildren(
      ...['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].map((l) => {
        const ok = l === 'vanilla' || (supported[l] && supported[l].length > 0);
        return h('button' + (data.loader === l ? '.on' : ''), { disabled: !ok, title: ok ? '' : `${LOADER_NAMES[l]} does not support Minecraft ${data.mcVersion}`, onclick: () => ((data.loader = l), (data.loaderVersion = ''), drawLoaders(), drawLoaderVersions()) }, LOADER_NAMES[l]);
      }),
    );
  };
  const drawLoaderVersions = () => {
    const list = supported[data.loader] || [];
    loaderVerSel.style.display = data.loader === 'vanilla' ? 'none' : '';
    loaderVerSel.replaceChildren(...list.map((v, i) => h('option', { value: v.version, selected: data.loaderVersion ? v.version === data.loaderVersion : v === (list.find((x) => x.stable) || list[0]) }, v.version + (v.stable ? '' : ' (unstable)'))));
    if (!data.loaderVersion && list.length) data.loaderVersion = (list.find((x) => x.stable) || list[0]).version;
  };
  let token = 0;
  async function checkLoaders() {
    const my = ++token;
    loaderNote.textContent = 'Checking which loaders support this version…';
    await Promise.all(['fabric', 'quilt', 'forge', 'neoforge'].map(async (l) => (supported[l] = (await safe(() => api('loaders:versions', l, data.mcVersion), { quiet: true })) || [])));
    if (my !== token) return;
    if (data.loader !== 'vanilla' && !supported[data.loader]?.length) {
      data.loader = ['fabric', 'quilt', 'neoforge', 'forge'].find((l) => supported[l]?.length) || 'vanilla';
      data.loaderVersion = '';
    }
    loaderNote.textContent = '';
    drawLoaders();
    drawLoaderVersions();
  }
  fillVersions();
  checkLoaders();

  const body = h(
    'div',
    h('label.field', h('span', 'Name'), nameIn),
    h('label.field', h('span', 'Minecraft version'), h('div.row', h('div.grow', verSel), h('label.row.small.muted', h('input', { type: 'checkbox', onchange: (e) => ((data.showSnap = e.target.checked), fillVersions()) }), 'Snapshots'))),
    h('label.field', h('span', 'Mod loader'), loaderSeg, h('div.spacer', { style: { height: '8px' } }), loaderVerSel, loaderNote),
    h('label.field', h('span', 'Memory (RAM)'), h('div.row', h('div.grow', ram), ramVal)),
    isEdit ? h('div.banner.warn', icon('alert'), h('div.small', 'Changing the version or loader keeps your mods on disk, but mods built for the old version are flagged on the Installed page.')) : null,
  );

  const save = async (close) => {
    if (!data.name.trim()) return toast('Please enter a name.', 'error');
    const payload = { name: data.name, mcVersion: data.mcVersion, loader: data.loader, loaderVersion: data.loader === 'vanilla' ? undefined : data.loaderVersion, ramMb: data.ramMb };
    const r = await safe(() => (isEdit ? api('profiles:update', existing.id, payload) : api('profiles:create', payload)));
    if (!r) return;
    close();
    await refreshProfiles();
    if (!isEdit) selectProfile(r.id);
    toast(isEdit ? 'Profile saved.' : `Created "${r.name}". Files download when you press Play.`, 'ok');
  };

  modal({
    title: isEdit ? `Edit "${existing.name}"` : 'New profile',
    body,
    actions: [
      ...(isEdit ? [(close) => btn('More…', { onclick: () => (close(), openProfileMore(existing)) })] : []),
      (close) => btn('Cancel', { onclick: close }),
      (close) => btn(isEdit ? 'Save' : 'Create', { cls: 'primary', onclick: () => save(close) }),
    ],
  });
}

/* ---------------- advanced options, quick settings, export, delete ---------------- */
async function openProfileMore(p) {
  const presets = (await safe(() => api('profiles:presets'))) || [];
  const opts = await safe(() => api('options:get', p.id));
  const d = { jvmPreset: p.jvmPreset, jvmArgs: p.jvmArgs, javaPath: p.javaPath, width: p.width || '', height: p.height || '', fullscreen: p.fullscreen, notes: p.notes };
  const q = {};
  const quick = opts
    ? Object.entries(opts.spec).map(([k, s]) => {
        const cur = opts.values[k];
        const input =
          s.type === 'bool'
            ? h('input', { type: 'checkbox', checked: cur === 'true', onchange: (e) => (q[k] = e.target.checked) })
            : h('input.input', { type: 'number', min: s.min, max: s.max, step: s.type === 'float' ? 0.1 : 1, placeholder: cur ?? 'default', value: cur ?? '', style: { width: '110px' }, oninput: (e) => e.target.value !== '' && (q[k] = e.target.value) });
        return h('label.row', { style: { marginBottom: '8px' } }, h('span.grow', s.label, h('span.muted.small', s.hint ? `  ${s.hint}` : '')), input);
      })
    : [];

  const body = h(
    'div',
    h('label.field', h('span', 'JVM preset'), h('select.input', { onchange: (e) => (d.jvmPreset = e.target.value) }, presets.map((x) => h('option', { value: x.id, selected: x.id === d.jvmPreset }, x.name)))),
    h('label.field', h('span', 'Extra JVM arguments'), h('input.input', { value: d.jvmArgs, placeholder: '-XX:+UseStringDeduplication', oninput: (e) => (d.jvmArgs = e.target.value) })),
    h('label.field', h('span', 'Custom Java path (blank = automatic Mojang runtime)'), h('input.input', { value: d.javaPath, oninput: (e) => (d.javaPath = e.target.value) })),
    h('div.row', h('label.field.grow', h('span', 'Window width'), h('input.input', { type: 'number', value: d.width, oninput: (e) => (d.width = e.target.value) })), h('label.field.grow', h('span', 'Window height'), h('input.input', { type: 'number', value: d.height, oninput: (e) => (d.height = e.target.value) })), h('label.row', h('input', { type: 'checkbox', checked: d.fullscreen, onchange: (e) => (d.fullscreen = e.target.checked) }), 'Fullscreen')),
    h('h2', 'Quick game settings'),
    h('p.muted.small', 'Written to this profile\'s options.txt. The previous file is kept as options.txt.lumen-bak.'),
    quick,
    h('h2', 'Backup & sharing'),
    h(
      'div.row.wrap',
      btn('Export .mrpack', { icon: 'download', onclick: async () => { const r = await safe(() => api('packs:exportMrpack', p.id)); if (r) toast(`Exported ${r.included} Modrinth mods.${r.skipped.length ? `\nNot included (not hosted on Modrinth): ${r.skipped.join(', ')}` : ''}`, 'ok'); } }),
      btn('Full backup (.zip)', { icon: 'download', onclick: async () => { const r = await safe(() => api('packs:exportBackup', p.id, false)); if (r) toast('Backup saved.', 'ok'); } }),
      btn('Open folder', { icon: 'folder', onclick: () => api('profiles:openFolder', p.id) }),
    ),
    h('h2', { style: { marginTop: '16px' } }, 'Manage'),
    h(
      'div.row.wrap',
      btn('Duplicate', { icon: 'copy', onclick: async () => { const r = await safe(() => api('profiles:duplicate', p.id)); if (r) { await refreshProfiles(); toast(`Created "${r.name}".`, 'ok'); } } }),
      btn('Delete…', {
        cls: 'danger',
        icon: 'trash',
        onclick: async () => {
          if (await confirmDialog('Delete profile?', `"${p.name}" will be moved to the "deleted-profiles" folder in your Lumen data directory (nothing is erased immediately).`, { confirm: 'Delete', danger: true })) {
            if (await safe(() => api('profiles:delete', p.id)) !== undefined) { await refreshProfiles(); toast('Profile removed.'); document.querySelectorAll('.scrim').forEach((x) => x.remove()); }
          }
        },
      }),
    ),
  );
  modal({
    title: `${p.name} - advanced`,
    body,
    wide: true,
    actions: [
      (close) => btn('Cancel', { onclick: close }),
      (close) =>
        btn('Save', {
          cls: 'primary',
          onclick: async () => {
            const patch = { ...d, width: d.width ? +d.width : undefined, height: d.height ? +d.height : undefined };
            const ok = await safe(() => api('profiles:update', p.id, patch));
            if (ok && Object.keys(q).length) await safe(() => api('options:set', p.id, q));
            if (ok) { close(); await refreshProfiles(); toast('Saved.', 'ok'); }
          },
        }),
    ],
  });
}

import { api, state, h, icon, btn, safe, toast, modal } from '../core.js';
import { refreshAccounts, refreshSettings } from '../app.js';

const ACCENTS = ['#3db8ff', '#7c8cff', '#4cd98a', '#ffd23f', '#ff8a4c', '#ff6b8a'];
const TABS = [['general', 'General'], ['accounts', 'Accounts'], ['sources', 'Mod sources'], ['about', 'About']];

export async function renderSettings(root, params = {}) {
  let tab = params.tab || 'general';
  const nav = h('div.settings-nav');
  const body = h('div.settings-body');
  root.append(h('div.settings', nav, body));

  const set = async (patch) => {
    await safe(() => api('settings:set', patch));
    await refreshSettings();
  };
  const setting = (title, desc, control, stack) => h('div.setting' + (stack ? '.stack' : ''), h('div.l', h('b', title), desc ? h('span', desc) : null), control);

  function general() {
    const s = state.settings;
    return [
      h('h2.sec', 'Appearance'),
      setting('Theme', null, h('div.seg', ['dark', 'light'].map((t) => h('button' + (s.theme === t ? '.on' : ''), { onclick: async () => (await set({ theme: t }), draw()) }, t[0].toUpperCase() + t.slice(1))))),
      setting('Accent colour', 'Used for buttons, selection and highlights.', h('div.swatches', ACCENTS.map((c) => h('div.swatch' + (s.accent === c ? '.on' : ''), { style: { background: c }, title: c, onclick: async () => (await set({ accent: c }), draw()) })))),
      h('h2.sec', 'Game'),
      setting('Default memory', `New profiles start with ${(s.defaultRamMb / 1024).toFixed(1)} GB. Each profile can override this.`, h('input', { type: 'range', min: 1024, max: 16384, step: 512, value: s.defaultRamMb, onchange: (e) => set({ defaultRamMb: +e.target.value }).then(draw) })),
      setting('Minimise while playing', 'Minimise the launcher after Minecraft starts.', h('div', h('label.switch', h('input', { type: 'checkbox', checked: s.closeOnLaunch, onchange: (e) => set({ closeOnLaunch: e.target.checked }) }), h('i')))),
      setting('Lumen menu theme', 'Restyles the Minecraft title screen (background, logo, buttons) with a resource pack added to each profile. Your other resource packs are not touched. Takes effect next launch.', h('div', h('label.switch', h('input', { type: 'checkbox', checked: s.lumenTheme, onchange: (e) => set({ lumenTheme: e.target.checked }) }), h('i')))),
      setting('Lumen in-game mod', 'Adds the Lumen main menu (with saved-server quick join) and a settings screen on Right Shift to Fabric/Quilt profiles on Minecraft 1.20.1, 1.21.1 and 26.3. Installs Fabric API too. Takes effect next launch.', h('div', h('label.switch', h('input', { type: 'checkbox', checked: s.lumenMod, onchange: (e) => set({ lumenMod: e.target.checked }) }), h('i')))),
      setting('Java executable', 'Leave blank to use the runtime Mojang provides for each version.', h('input.input', { value: s.javaPathOverride, placeholder: 'Automatic', onchange: (e) => set({ javaPathOverride: e.target.value.trim() }) })),
    ];
  }

  function accounts() {
    const s = state.settings;
    const list = state.accounts.accounts;
    const signIn = async () => {
      if (!state.appInfo.signInReady && !s.msClientId) {
        toast('Sign-in is not configured in this build yet. See "Advanced" below.', 'error');
        document.getElementById('adv')?.setAttribute('open', '');
        return;
      }
      const dev = await safe(() => api('auth:begin'));
      if (!dev) return;
      const off = window.lumen.on('auth:done', async (r) => {
        off();
        m.close();
        toast(r.ok ? `Signed in as ${r.name}` : r.error, r.ok ? 'ok' : 'error');
        await refreshAccounts();
        draw();
      });
      const m = modal({
        title: 'Sign in with Microsoft',
        onClose: () => (off(), api('auth:cancel')),
        body: h('div', h('p', { style: { marginTop: 0 } }, 'Your browser opened ', h('b', dev.verificationUri), '. Enter this code when asked:'), h('div', { style: { fontSize: '34px', letterSpacing: '8px', fontWeight: 800, textAlign: 'center', margin: '18px 0', fontFamily: 'Consolas, monospace', color: 'var(--accent)' } }, dev.userCode), h('p.muted.small', 'You sign in on microsoft.com. Lumen never sees your password. Waiting for you to finish…'), h('div', { style: { textAlign: 'center' } }, h('span.spinner'))),
        actions: [() => btn('Open page again', { onclick: () => api('shell:openExternal', dev.verificationUri) }), (close) => btn('Cancel', { onclick: close })],
      });
    };
    return [
      h('h2.sec', 'Microsoft account'),
      ...(list.length
        ? list.map((a) => h('div.plan-item', h('div.avatar', a.name[0].toUpperCase()), h('div.grow', h('b', a.name), state.accounts.active === a.id ? h('span.chip.ok', { style: { marginLeft: '8px' } }, 'Active') : null), state.accounts.active !== a.id ? btn('Use', { cls: 'sm', onclick: async () => (await api('auth:setActive', a.id), await refreshAccounts(), draw()) }) : null, btn('Sign out', { cls: 'sm danger', onclick: async () => (await api('auth:remove', a.id), await refreshAccounts(), draw()) })))
        : [h('p.muted', { style: { marginTop: 0 } }, 'Not signed in. You need a Minecraft: Java Edition licence to play.')]),
      h('div', { style: { margin: '12px 0' } }, btn(list.length ? 'Add another account' : 'Sign in with Microsoft', { cls: 'primary', onclick: signIn })),
      !state.appInfo.signInReady && !s.msClientId ? h('div.note.warn', { style: { marginTop: '12px' } }, icon('alert'), h('div', h('b', 'Sign-in is not set up in this build. '), 'The distributor has to register a Microsoft app once and build its client ID in (docs/SETUP.md). Until then you can paste one under Advanced.')) : null,
      h('details#adv', { style: { marginTop: '18px' } }, h('summary.muted', { style: { cursor: 'pointer' } }, 'Advanced: use a different Microsoft app registration'), setting('Client ID', 'Only for developers. Overrides the one built into this launcher.', h('input.input', { value: s.msClientId, placeholder: state.appInfo.signInReady ? 'Using the built-in ID' : '00000000-0000-0000-0000-000000000000', onchange: async (e) => (await set({ msClientId: e.target.value.trim() }), state.appInfo.signInReady = true, draw()) }))),
    ];
  }

  function sources() {
    const s = state.settings;
    return [
      h('h2.sec', 'Modrinth'),
      setting('Status', 'Works without a key.', h('div', h('span.chip.ok', icon('check'), 'Ready'))),
      h('h2.sec', 'CurseForge'),
      setting('API key', 'Stored encrypted with your OS keychain and sent only to api.curseforge.com. Get a free key at console.curseforge.com.', h('div.row', h('input.input', { type: 'password', id: 'cf-key', placeholder: s.curseforgeKeySet ? 'Saved - paste to replace' : 'Paste API key' }), btn('Save', { cls: 'primary', onclick: async () => { const v = document.getElementById('cf-key').value.trim(); if (!v) return; await set({ curseforgeKey: v }); toast('CurseForge key saved.', 'ok'); draw(); } }), s.curseforgeKeySet ? btn('Remove', { cls: 'danger', onclick: async () => (await set({ curseforgeKey: '' }), draw()) }) : null)),
      h('h2.sec', 'Behaviour'),
      setting('Allow alpha builds', 'Releases are always preferred. Alphas are only chosen automatically when nothing else exists, and always show a warning.', h('div', h('label.switch', h('input', { type: 'checkbox', checked: s.allowBetaMods, onchange: (e) => set({ allowBetaMods: e.target.checked }) }), h('i')))),
    ];
  }

  function updateButton() {
    const u = state.update;
    if (u?.status === 'ready') return btn(`Restart to update to ${u.version}`, { cls: 'primary', icon: 'refresh', onclick: () => api('update:install') });
    if (u?.status === 'downloading') return btn(`Downloading ${u.version} (${u.percent ?? 0}%)`, { disabled: true });
    if (u?.status === 'unavailable') return h('span.chip', 'Updates are checked in the installed app');
    return btn('Check for updates', { icon: 'refresh', onclick: async (e) => { const r = await safe(() => api('update:check')); toast(r?.status === 'downloading' || r?.status === 'ready' ? `Update ${r.version} found.` : 'You are on the latest version.', r?.status === 'downloading' || r?.status === 'ready' ? 'ok' : ''); draw(); } });
  }

  function about() {
    const i = state.appInfo;
    return [
      h('h2.sec', 'Lumen Client'),
      h('div.kv', ...[['Version', i.version], ['Data folder', i.root], ['Secret storage', i.safeStorage ? 'OS keychain (encrypted)' : 'Unavailable on this system']].flatMap(([k, v]) => [h('div.k', k), h('div', String(v ?? ''))])),
      h('div.row.wrap', { style: { marginTop: '16px' } }, updateButton(), btn('Open logs folder', { icon: 'folder', onclick: () => api('shell:openLogs') }), btn('GitHub', { icon: 'link', onclick: () => api('shell:openExternal', 'https://github.com/saberapexyt-commits/lumen-client') })),
      h('p.muted.small', { style: { marginTop: '18px' } }, 'Lumen Client is not affiliated with Mojang, Microsoft, CurseForge or Modrinth. Minecraft is a trademark of Mojang AB.'),
    ];
  }

  function draw() {
    nav.replaceChildren(...TABS.map(([id, label]) => h('button' + (tab === id ? '.on' : ''), { onclick: () => ((tab = id), draw()) }, label)));
    body.replaceChildren(h('div.inner', h('h1', TABS.find((t) => t[0] === tab)[1]), ...{ general, accounts, sources, about }[tab]()));
  }
  draw();
}

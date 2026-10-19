import { api, state, h, icon, btn, safe, toast, modal, confirmDialog } from '../core.js';
import { refreshAccounts, refreshSettings } from '../app.js';

const ACCENTS = ['#7c5cff', '#22d3ee', '#ff6b6b', '#f7b733', '#3ddc97', '#f472b6', '#fb923c', '#60a5fa'];

export async function renderSettings(root, params = {}) {
  const page = h('div.page');
  root.append(page);
  let tab = params.tab || 'general';
  const body = h('div');
  const tabs = h('div.seg');

  const set = async (patch) => {
    await safe(() => api('settings:set', patch));
    await refreshSettings();
  };

  function drawTabs() {
    tabs.replaceChildren(
      ...[['general', 'General'], ['accounts', 'Accounts'], ['sources', 'Mod sources'], ['about', 'About & data']].map(([id, label]) =>
        h('button' + (tab === id ? '.on' : ''), { onclick: () => ((tab = id), draw()) }, label),
      ),
    );
  }

  function general() {
    const s = state.settings;
    return h(
      'div.card',
      h('h2', 'Appearance'),
      h('div.row.wrap', h('span.muted', 'Theme'), h('div.seg', ['dark', 'light'].map((t) => h('button' + (s.theme === t ? '.on' : ''), { onclick: async () => (await set({ theme: t }), draw()) }, t[0].toUpperCase() + t.slice(1))))),
      h('div.spacer'),
      h('div.row.wrap', h('span.muted', 'Accent'), h('div.swatches', ACCENTS.map((c) => h('div.swatch' + (s.accent === c ? '.on' : ''), { style: { background: c }, onclick: async () => (await set({ accent: c }), draw()) })))),
      h('div.spacer'),
      h('h2', 'Game'),
      h('label.field', h('span', `Default memory for new profiles: ${(s.defaultRamMb / 1024).toFixed(1)} GB`), h('input', { type: 'range', min: 1024, max: 16384, step: 512, value: s.defaultRamMb, onchange: (e) => set({ defaultRamMb: +e.target.value }).then(draw) })),
      h('label.row', { style: { marginBottom: '10px' } }, h('input', { type: 'checkbox', checked: s.closeOnLaunch, onchange: (e) => set({ closeOnLaunch: e.target.checked }) }), 'Minimize the launcher when the game starts'),
      h('label.field', h('span', 'Custom Java executable for all profiles (blank = the Java runtime downloaded from Mojang for each version)'), h('input.input', { value: s.javaPathOverride, placeholder: 'C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe', onchange: (e) => set({ javaPathOverride: e.target.value.trim() }) })),
    );
  }

  function accounts() {
    const s = state.settings;
    const list = state.accounts.accounts;
    const status = h('div');
    const signIn = async () => {
      if (!s.msClientId) return toast('Enter your Microsoft application client ID first (see the box above).', 'error');
      const dev = await safe(() => api('auth:begin'));
      if (!dev) return;
      const off = window.lumen.on('auth:done', async (r) => {
        off();
        m.close();
        if (r.ok) toast(`Signed in as ${r.name}`, 'ok');
        else toast(r.error, 'error');
        await refreshAccounts();
        draw();
      });
      const m = modal({
        title: 'Sign in with Microsoft',
        onClose: () => (off(), api('auth:cancel')),
        body: h('div', h('p', 'Your browser was opened to ', h('b', dev.verificationUri), '. Enter this code when asked:'), h('div', { style: { fontSize: '34px', letterSpacing: '6px', fontWeight: 800, textAlign: 'center', margin: '18px 0', fontFamily: 'Consolas, monospace' } }, dev.userCode), h('p.muted.small', 'Sign in on microsoft.com - Lumen never sees your password. Waiting for you to finish…'), h('div', { style: { textAlign: 'center' } }, h('span.spinner'))),
        actions: [(close) => btn('Open page again', { onclick: () => api('shell:openExternal', dev.verificationUri) }), (close) => btn('Cancel', { onclick: close })],
      });
    };
    return h(
      'div',
      h(
        'div.card',
        h('h2', 'Microsoft accounts'),
        list.length
          ? list.map((a) => h('div.plan-item', h('div.avatar', a.name[0].toUpperCase()), h('div.grow', h('b', a.name), state.accounts.active === a.id ? h('span.chip.ok', { style: { marginLeft: '8px' } }, 'Active') : null), state.accounts.active !== a.id ? btn('Use', { cls: 'sm', onclick: async () => (await api('auth:setActive', a.id), await refreshAccounts(), draw()) }) : null, btn('Sign out', { cls: 'sm danger', onclick: async () => (await api('auth:remove', a.id), await refreshAccounts(), draw()) })))
          : h('p.muted', 'No account yet. You need a Minecraft: Java Edition licence to play.'),
        h('div.spacer'),
        btn('Sign in with Microsoft', { cls: 'primary', icon: 'play', onclick: signIn }),
        status,
      ),
      h('div.spacer'),
      h(
        'div.card',
        h('h2', 'Microsoft application client ID'),
        h('p.muted.small', 'Microsoft requires every launcher to use its own registered application (Entra ID, "Mobile and desktop", public client, device-code flow enabled) that has been approved for the Minecraft API at aka.ms/AppRegistrationForm. Paste your application (client) ID here. No secret is needed. Full steps: docs/SETUP.md.'),
        h('input.input', { value: s.msClientId, placeholder: '00000000-0000-0000-0000-000000000000', onchange: async (e) => { await set({ msClientId: e.target.value.trim() }); draw(); } }),
        !s.msClientId ? h('div.banner.warn', { style: { marginTop: '10px' } }, icon('alert'), h('div.small', 'Not configured - sign-in is unavailable until you add a client ID.')) : null,
      ),
    );
  }

  function sources() {
    const s = state.settings;
    return h(
      'div',
      h('div.card', h('h2', 'Modrinth'), h('p.muted.small', 'Works out of the box. No key required.'), h('span.chip.ok', 'Ready')),
      h('div.spacer'),
      h(
        'div.card',
        h('h2', 'CurseForge'),
        h('p.muted.small', 'CurseForge requires an API key. Request a free key at console.curseforge.com and paste it below. It is stored encrypted with your operating system\'s keychain and is never sent anywhere except api.curseforge.com.'),
        h('div.row', h('input.input', { type: 'password', placeholder: s.curseforgeKeySet ? '•••••••• (saved - paste a new key to replace)' : 'Paste your CurseForge API key', id: 'cf-key' }), btn('Save', { cls: 'primary', onclick: async () => { const v = document.getElementById('cf-key').value.trim(); if (!v) return; await set({ curseforgeKey: v }); toast('CurseForge key saved.', 'ok'); draw(); } }), s.curseforgeKeySet ? btn('Remove', { cls: 'danger', onclick: async () => { await set({ curseforgeKey: '' }); draw(); } }) : null),
        s.curseforgeKeySet ? h('span.chip.ok', { style: { marginTop: '10px' } }, 'Key saved') : h('span.chip.warn', { style: { marginTop: '10px' } }, 'No key'),
      ),
      h('div.spacer'),
      h('div.card', h('h2', 'Behaviour'), h('label.row', h('input', { type: 'checkbox', checked: s.allowBetaMods, onchange: (e) => set({ allowBetaMods: e.target.checked }) }), 'Allow alpha builds to be chosen automatically when no release/beta exists'), h('p.muted.small', 'Releases are always preferred. Beta/alpha-only installs always show a warning.')),
    );
  }

  function about() {
    const i = state.appInfo;
    return h(
      'div.card',
      h('h2', 'Lumen Client'),
      h('table.status-table', [
        ['Version', i.version],
        ['Data folder', i.root],
        ['Secret storage', i.safeStorage ? 'OS keychain (encrypted)' : 'Unavailable - tokens cannot be saved securely on this system'],
      ].map(([k, v]) => h('tr', h('td.muted', k), h('td', String(v ?? ''))))),
      h('div.spacer'),
      h('div.row.wrap', btn('Open logs folder', { icon: 'folder', onclick: () => api('shell:openLogs') })),
      h('p.muted.small', 'Lumen Client is not affiliated with Mojang, Microsoft, CurseForge or Modrinth. Minecraft is a trademark of Mojang AB.'),
    );
  }

  function draw() {
    drawTabs();
    body.replaceChildren({ general, accounts, sources, about }[tab]());
  }
  page.append(h('h1', 'Settings'), h('div.spacer'), tabs, h('div.spacer'), body);
  draw();
}

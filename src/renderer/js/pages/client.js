import { api, state, h, icon, btn, safe, toast, currentProfile, profileSelect, profileLabel, waitTask } from '../core.js';

/**
 * Honest feature status. "Available" items are implemented in this launcher today. "Planned" items
 * need code running inside Minecraft, which a launcher alone cannot provide - see docs/ARCHITECTURE.md.
 */
export async function renderClient(root) {
  const page = h('div.page');
  root.append(page);
  const p = currentProfile();

  const perf = h(
    'div.card',
    h('h2', 'Performance pack'),
    h('p.muted.small', 'One click installs a curated set of well-known optimisation mods from Modrinth (rendering, game logic, memory) - only builds that explicitly support the selected profile\'s Minecraft version and loader. Anything without a compatible release is skipped and reported.'),
    h('div.row.wrap', state.profiles.length ? profileSelect(() => (root.replaceChildren(), renderClient(root))) : null, p ? h('span.chip.accent', profileLabel(p)) : null),
    h('div.spacer'),
    btn('Install performance pack', {
      cls: 'primary', icon: 'download', disabled: !p || p.loader === 'vanilla',
      title: p && p.loader === 'vanilla' ? 'Choose a profile with a mod loader' : '',
      onclick: async () => {
        const taskId = await safe(() => api('mods:performancePack', p.id));
        if (!taskId) return;
        const t = await waitTask(taskId);
        if (t.status === 'done') toast(`Installed: ${t.result.installed.join(', ') || 'nothing new'}${t.result.unavailable.length ? `\nNo compatible release: ${t.result.unavailable.join(', ')}` : ''}`, 'ok');
      },
    }),
  );

  const chip = (t, k) => h('span.chip.' + k, t);
  const row = (name, status, note) => h('tr', h('td', h('b', name)), h('td', status), h('td.muted.small', note));
  page.append(
    h('h1', 'Client features'),
    h('p.sub', 'What works today, and what needs an in-game component.'),
    perf,
    h('div.spacer'),
    h(
      'div.card',
      h('h2', 'Feature status'),
      h(
        'table.status-table',
        row('JVM tuning presets', chip('Available', 'ok'), 'Profile → Edit → More: G1GC / ZGC flag presets and custom arguments.'),
        row('FPS, render distance, VSync, GUI scale', chip('Available', 'ok'), 'Profile → Edit → More → Quick game settings (writes options.txt).'),
        row('Themes & accent colour', chip('Available', 'ok'), 'Settings → General.'),
        row('Per-profile mods, configs and worlds', chip('Available', 'ok'), 'Every profile has its own game directory.'),
        row('HUD customisation (FPS / CPS / keystrokes / armour)', chip('Planned', 'warn'), 'Must render inside Minecraft, so it needs a client-side companion mod (Fabric/NeoForge). The launcher will install it automatically per profile once it exists.'),
        row('In-game overlays and menus', chip('Planned', 'warn'), 'Same companion mod. The launcher cannot draw over the game safely.'),
        row('Keybind management', chip('Planned', 'warn'), 'options.txt editing is possible; a safe key-capture UI is not built yet.'),
        row('Server list / quick-join', chip('Planned', 'warn'), 'Will use Minecraft\'s built-in --quickPlayMultiplayer argument; not wired up yet.'),
      ),
    ),
  );
}

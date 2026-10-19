import { api, state, h, icon, btn, safe, toast, currentProfile, profileSelect, profileLabel, waitTask } from '../core.js';

/**
 * Honest feature status. "Available" items are implemented in the launcher today. "Planned" items need
 * code running inside Minecraft, which a launcher alone cannot provide - see docs/ARCHITECTURE.md.
 */
export async function renderClient(root) {
  const page = h('div.page');
  root.append(page);
  const p = currentProfile();

  const row = (name, ok, note) => h('div.setting', h('div.l', h('b', name), h('span', note)), h('div', ok ? h('span.chip.ok', icon('check'), 'Available') : h('span.chip.warn', 'Planned')));

  page.append(
    h('div.page-head', h('div.grow', h('h1', 'Client features'), h('div.sub', 'What the launcher does today, and what needs an in-game component.'))),
    h('h2.sec', { style: { marginTop: 0 } }, 'Performance pack'),
    h('p.muted', { style: { margin: '0 0 12px', maxWidth: '640px' } }, "Installs a curated set of open-source optimisation mods from Modrinth (rendering, game logic, memory). Only releases that explicitly support the profile's Minecraft version and loader are used; anything without one is skipped and listed."),
    h(
      'div.row.wrap',
      state.profiles.length ? profileSelect(() => (root.replaceChildren(), renderClient(root))) : null,
      btn('Install performance pack', {
        cls: 'primary', icon: 'download', disabled: !p || p.loader === 'vanilla', title: p && p.loader === 'vanilla' ? 'Choose a profile with a mod loader' : '',
        onclick: async () => {
          const taskId = await safe(() => api('mods:performancePack', p.id));
          if (!taskId) return;
          const t = await waitTask(taskId);
          if (t.status === 'done') toast(`Installed: ${t.result.installed.join(', ') || 'nothing new'}${t.result.unavailable.length ? `\nNo compatible release: ${t.result.unavailable.join(', ')}` : ''}`, 'ok');
        },
      }),
    ),
    h('h2.sec', 'Feature status'),
    row('JVM tuning presets', true, 'Profile → Advanced: G1GC / ZGC flag presets and custom arguments.'),
    row('FPS, render distance, VSync, GUI scale', true, 'Profile → Advanced → Quick game settings (writes options.txt).'),
    row('Themes and accent colour', true, 'Settings → General.'),
    row('Per-profile mods, configs and worlds', true, 'Every profile has its own game directory.'),
    row('HUD (FPS, CPS, keystrokes, armour)', false, 'Renders inside Minecraft, so it needs a client-side companion mod that the launcher will install per profile.'),
    row('In-game overlays and menus', false, 'Same companion mod. A launcher cannot safely draw over the game.'),
    row('Keybind management', false, 'options.txt is editable today; a conflict-aware key-capture UI belongs in-game.'),
    row('Server quick-join', false, "Will use Minecraft's built-in quick-play argument; not wired up yet."),
  );
}

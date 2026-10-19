import { api, state, h, icon, btn, safe, toast, modal, confirmDialog, emptyState } from '../core.js';
import { navigate } from '../app.js';

/* ------------------------------------------------------------------ skin rendering helpers */

const loadImage = (src) =>
  new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Could not read that skin image'));
    i.src = src;
  });

/** Returns a 64x64 canvas; old 64x32 skins get their left limbs mirrored from the right ones. */
function normalise(img) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: false });
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0);
  if (img.height === 32) {
    // snapshot first so mirroring reads the untouched right-limb data
    const snap = document.createElement('canvas');
    snap.width = 64;
    snap.height = 64;
    snap.getContext('2d').drawImage(c, 0, 0);
    const flipFrom = (u, v, w, hh, d, du, dv) => {
      const piece = (sx, sy, sw, sh, dx, dy) => {
        g.save();
        g.translate(dx + sw, dy);
        g.scale(-1, 1);
        g.drawImage(snap, sx, sy, sw, sh, 0, 0, sw, sh);
        g.restore();
      };
      piece(u + d + w, v + d, d, hh, du, dv + d);
      piece(u, v + d, d, hh, du + d + w, dv + d);
      piece(u + d, v + d, w, hh, du + d, dv + d);
      piece(u + d + w + d, v + d, w, hh, du + d + w + d, dv + d);
      piece(u + d, v, w, d, du + d, dv);
      piece(u + d + w, v, w, d, du + d + w, dv);
    };
    flipFrom(0, 16, 4, 12, 4, 16, 48); // left leg
    flipFrom(40, 16, 4, 12, 4, 32, 48); // left arm
  }
  return c;
}

const crop = (canvas, x, y, w, hh) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hh;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, x, y, w, hh, 0, 0, w, hh);
  return c.toDataURL();
};

/** Parts of the player model: [name, u, v, w, h, d, centre x, centre y, overlay u, overlay v, grow] */
function parts(slim) {
  const aw = slim ? 3 : 4;
  return [
    ['head', 0, 0, 8, 8, 8, 0, -4, 32, 0, 0.5],
    ['body', 16, 16, 8, 12, 4, 0, 6, 16, 32, 0.25],
    ['rarm', 40, 16, aw, 12, 4, -(4 + aw / 2), 6, 40, 32, 0.25],
    ['larm', 32, 48, aw, 12, 4, 4 + aw / 2, 6, 48, 48, 0.25],
    ['rleg', 0, 16, 4, 12, 4, -2, 18, 0, 32, 0.25],
    ['lleg', 16, 48, 4, 12, 4, 2, 18, 0, 48, 0.25],
  ];
}

const FACES = (u, v, w, hh, d) => ({
  front: [u + d, v + d, w, hh],
  back: [u + d + w + d, v + d, w, hh],
  right: [u, v + d, d, hh], // character's right = viewer's left
  left: [u + d + w, v + d, d, hh],
  top: [u + d, v, w, d],
  bottom: [u + d + w, v, w, d],
});

/** A rotating CSS-3D player. `s` = pixels per skin pixel. */
function build3d(canvas, slim, s) {
  const root = h('div.sk3d', { style: { width: `${16 * s}px`, height: `${32 * s}px` } });
  const rig = h('div.sk3d-rig');
  root.append(rig);
  const mk = (u, v, w, hh, d, cx, cy, grow, overlay) => {
    const W = (w + grow * 2) * s;
    const H = (hh + grow * 2) * s;
    const D = (d + grow * 2) * s;
    const box = h('div.sk3d-box', { style: { width: `${W}px`, height: `${H}px`, transform: `translate3d(${(cx + 8) * s - W / 2}px, ${(cy + 4) * s - H / 2 + 4 * s}px, 0)` } });
    const f = FACES(u, v, w, hh, d);
    const face = (name, fw, fh, transform) => {
      const [x, y, cw, ch] = f[name];
      box.append(h('div.sk3d-face' + (overlay ? '.ov' : ''), { style: { width: `${fw}px`, height: `${fh}px`, left: `${(W - fw) / 2}px`, top: `${(H - fh) / 2}px`, backgroundImage: `url(${crop(canvas, x, y, cw, ch)})`, transform } }));
    };
    face('front', W, H, `translateZ(${D / 2}px)`);
    face('back', W, H, `rotateY(180deg) translateZ(${D / 2}px)`);
    face('right', D, H, `rotateY(-90deg) translateZ(${W / 2}px)`);
    face('left', D, H, `rotateY(90deg) translateZ(${W / 2}px)`);
    face('top', W, D, `rotateX(90deg) translateZ(${H / 2}px)`);
    face('bottom', W, D, `rotateX(-90deg) translateZ(${H / 2}px)`);
    return box;
  };
  for (const [, u, v, w, hh, d, cx, cy, ou, ov, grow] of parts(slim)) {
    rig.append(mk(u, v, w, hh, d, cx, cy, 0, false));
    rig.append(mk(ou, ov, w, hh, d, cx, cy, grow, true));
  }
  return { root, rig };
}

/** Flat front-facing thumbnail. */
function thumb(canvas, slim, scale = 5) {
  const c = document.createElement('canvas');
  c.width = 16 * scale;
  c.height = 32 * scale;
  c.className = 'sk-thumb';
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const put = (u, v, w, hh, d, cx, cy, ou, ov) => {
    const [fx, fy, fw, fh] = FACES(u, v, w, hh, d).front;
    const [gx, gy] = FACES(ou, ov, w, hh, d).front;
    const dx = (cx + 8 - w / 2) * scale;
    const dy = (cy + 8 - hh / 2) * scale;
    g.drawImage(canvas, fx, fy, fw, fh, dx, dy, w * scale, hh * scale);
    g.drawImage(canvas, gx, gy, fw, fh, dx, dy, w * scale, hh * scale);
  };
  for (const p of parts(slim)) put(p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9]);
  return c;
}

/* ------------------------------------------------------------------ page */

export async function renderSkins(root) {
  const page = h('div.page');
  root.append(page);

  let library = [];
  let selected = null;
  let account = null; // { name, skin, capes } | { error }
  let spin = null;
  const cache = new Map(); // id -> normalised canvas

  const canvasFor = async (key, dataUrl) => {
    if (!cache.has(key)) cache.set(key, normalise(await loadImage(dataUrl)));
    return cache.get(key);
  };

  const list = h('div.sk-grid');
  const side = h('div.sk-side');
  page.append(
    h(
      'div.page-head',
      h('div.grow', h('h1', 'Skins'), h('div.sub', 'Keep a library of skins, preview them in 3D, and apply one to your Minecraft account.')),
      btn('Add by username', { icon: 'user', onclick: addByName }),
      btn('Import PNG', { cls: 'primary', icon: 'plus', onclick: importFile }),
    ),
    h('div.sk-layout', h('div.sk-main', h('h2.sec', { style: { marginTop: 0 } }, 'Your library'), list), side),
  );

  async function refresh(keep) {
    library = (await safe(() => api('skins:list'), { quiet: true })) || [];
    if (keep) selected = library.find((s) => s.id === keep)?.id ?? null;
    if (!selected || !library.some((s) => s.id === selected)) selected = library[0]?.id ?? null;
    await drawList();
    await drawSide();
  }

  async function drawList() {
    if (!library.length) {
      list.replaceChildren(emptyState('user', 'No skins yet', 'Import a 64×64 PNG, or add any player’s skin by their username.', btn('Import PNG', { cls: 'primary', icon: 'plus', onclick: importFile }), btn('Add by username', { icon: 'user', onclick: addByName })));
      return;
    }
    const cards = [];
    for (const s of library) {
      const cv = await canvasFor(s.id, s.dataUrl).catch(() => null);
      cards.push(
        h(
          'button.sk-card' + (s.id === selected ? '.on' : ''),
          { onclick: () => ((selected = s.id), drawList(), drawSide()) },
          cv ? thumb(cv, s.model === 'slim') : h('div.sk-thumb'),
          h('b.ellipsis', s.name),
          h('span', s.model === 'slim' ? 'Slim arms' : 'Classic arms'),
        ),
      );
    }
    list.replaceChildren(...cards);
  }

  async function drawSide() {
    if (spin) cancelAnimationFrame(spin);
    spin = null;
    const s = library.find((x) => x.id === selected);
    if (!s) {
      side.replaceChildren(h('div.sk-panel', h('div.muted', 'Select a skin to preview it.')), await accountPanel());
      return;
    }
    const cv = await canvasFor(s.id, s.dataUrl).catch((e) => (toast(e.message, 'error'), null));
    const stage = h('div.sk-stage');
    if (cv) {
      const { root: model, rig } = build3d(cv, s.model === 'slim', 11);
      stage.append(model);
      let ang = 25;
      let drag = null;
      let last = performance.now();
      const apply = () => (rig.style.transform = `rotateX(-8deg) rotateY(${ang}deg)`);
      const tick = (t) => {
        if (!drag) ang += (t - last) * 0.025;
        last = t;
        apply();
        if (stage.isConnected) spin = requestAnimationFrame(tick);
      };
      stage.onpointerdown = (e) => ((drag = { x: e.clientX, a: ang }), stage.setPointerCapture(e.pointerId));
      stage.onpointermove = (e) => drag && ((ang = drag.a + (e.clientX - drag.x) * 0.6), apply());
      stage.onpointerup = () => (drag = null);
      spin = requestAnimationFrame(tick);
    }
    const name = h('input.input', { value: s.name, maxlength: 40, onchange: async (e) => (await safe(() => api('skins:update', s.id, { name: e.target.value })), refresh(s.id)) });
    const model = h(
      'div.seg',
      ...['classic', 'slim'].map((m) => h('button' + (s.model === m ? '.on' : ''), { onclick: async () => (await safe(() => api('skins:update', s.id, { model: m })), refresh(s.id)) }, m === 'classic' ? 'Classic (4px arms)' : 'Slim (3px arms)')),
    );
    side.replaceChildren(
      h(
        'div.sk-panel',
        stage,
        h('div.muted', { style: { textAlign: 'center', fontSize: '11.5px' } }, 'Drag to rotate'),
        h('label.fl', 'Name', name),
        h('label.fl', 'Arm style', model),
        h(
          'div.row.wrap',
          btn('Apply to my account', { cls: 'primary', icon: 'check', onclick: () => applyToAccount(s) }),
          btn('', { cls: 'ghost', icon: 'trash', title: 'Remove from library', onclick: () => removeSkin(s) }),
        ),
      ),
      await accountPanel(),
    );
  }

  async function accountPanel() {
    if (!state.accounts.accounts.length) {
      return h('div.sk-panel', h('b', 'Minecraft account'), h('div.muted', 'Sign in with Microsoft to apply skins and equip capes.'), btn('Sign in', { icon: 'user', onclick: () => navigate('settings', { tab: 'accounts' }) }));
    }
    if (!account) {
      account = await safe(() => api('skins:account'), { quiet: true });
      if (!account) account = { error: true };
    }
    if (account.error) {
      return h('div.sk-panel', h('b', 'Minecraft account'), h('div.muted', 'Could not load your account’s skin and capes. Try signing in again in Settings → Accounts.'), btn('Retry', { icon: 'refresh', onclick: () => ((account = null), drawSide()) }));
    }
    const el = h('div.sk-panel', h('b', `${account.name} — current skin`));
    if (account.skin) {
      const cv = await canvasFor('acct' + account.skin.dataUrl.length, account.skin.dataUrl).catch(() => null);
      if (cv) {
        el.append(
          h(
            'div.row',
            thumb(cv, account.skin.model === 'slim', 4),
            btn('Save to library', {
              icon: 'download',
              onclick: async () => {
                const r = await safe(() => api('skins:addByName', account.name));
                if (r) (toast('Saved to your library.', 'ok'), refresh(r.id));
              },
            }),
          ),
        );
      }
    }
    el.append(h('b', { style: { marginTop: '10px' } }, 'Capes'));
    if (!account.capes.length) el.append(h('div.muted', 'This account has no capes.'));
    else {
      const row = h('div.sk-capes');
      row.append(h('button.sk-cape' + (account.capes.some((c) => c.active) ? '' : '.on'), { onclick: () => changeCape(null), title: 'No cape' }, h('div.cp.none', icon('x')), h('span', 'None')));
      for (const c of account.capes) {
        row.append(h('button.sk-cape' + (c.active ? '.on' : ''), { onclick: () => changeCape(c.id), title: c.alias }, h('div.cp', { style: { backgroundImage: `url(${c.url})` } }), h('span.ellipsis', c.alias)));
      }
      el.append(row);
    }
    return el;
  }

  async function changeCape(id) {
    const r = await safe(() => api('skins:setCape', id));
    if (r) (toast(id ? 'Cape equipped.' : 'Cape removed.', 'ok'), (account = null), drawSide());
  }

  async function applyToAccount(s) {
    if (!state.accounts.accounts.length) {
      toast('Sign in with your Microsoft account first (Settings → Accounts).', 'error');
      return navigate('settings', { tab: 'accounts' });
    }
    const r = await safe(() => api('skins:apply', s.id));
    if (r) (toast(`"${s.name}" is now your skin. It shows up next time you join a world or server.`, 'ok'), (account = null), drawSide());
  }

  async function removeSkin(s) {
    if (!(await confirmDialog('Remove skin?', `"${s.name}" will be removed from your library. Your Minecraft account is not changed.`, { confirm: 'Remove', danger: true }))) return;
    await safe(() => api('skins:remove', s.id));
    refresh();
  }

  async function importFile() {
    const r = await safe(() => api('skins:importFile', 'classic'));
    if (r) (toast(`Added "${r.name}". Set the arm style on the right if it uses slim arms.`, 'ok'), (selected = r.id), refresh(r.id));
  }

  function addByName() {
    const input = h('input.input', { placeholder: 'Minecraft username', maxlength: 16, style: { width: '100%' } });
    const go = async (close) => {
      const r = await safe(() => api('skins:addByName', input.value));
      if (r) (close(), toast(`Added ${r.name}'s skin.`, 'ok'), (selected = r.id), refresh(r.id));
    };
    const m = modal({
      title: 'Add a skin by username',
      body: h('div', h('p.muted', { style: { marginTop: 0 } }, 'Copies that player’s current public skin into your library. Their account is not touched.'), input),
      actions: [(close) => btn('Cancel', { onclick: close }), (close) => btn('Add skin', { cls: 'primary', onclick: () => go(close) })],
    });
    input.onkeydown = (e) => e.key === 'Enter' && go(m.close);
    setTimeout(() => (window.focus(), input.focus()), 60);
  }

  await refresh();
  return () => spin && cancelAnimationFrame(spin);
}

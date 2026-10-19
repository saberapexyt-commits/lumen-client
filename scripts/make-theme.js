// Generates resources/lumen-theme.zip, a resource pack that restyles Minecraft's title screen:
// panorama background (from the supplied artwork), Lumen logo, dark UI buttons, splash texts.
// Only original artwork is used - no Mojang textures are copied.
// Run:  npx electron scripts/make-theme.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const root = path.join(__dirname, '..');
const dataUrl = (p, mime) => `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;

const drawing = `
(async (logoUrl, bgUrl, markUrl, wideUrl) => {
  const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  const [logo, bg, mark, wide] = await Promise.all([load(logoUrl), load(bgUrl), load(markUrl), load(wideUrl)]);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const out = {};
  // ladder of logo sizes, 12% apart; the Java side builds the same list so it can pick the closest one
  const LOGO_SIZES = []; for (let w = 200; w < 2000; w = Math.round(w * 1.12)) LOGO_SIZES.push(w); LOGO_SIZES.push(2000);
  out.logoSizes = LOGO_SIZES.join(',');
  const png = (name, c) => (out[name] = c.toDataURL('image/png'));
  // Canvas stores premultiplied alpha, so transparent pixels lose their colour (they come back black). Bilinear
  // filtering in older Minecraft versions then blends that black into the logo edge as a dark outline. This exports
  // raw RGBA after "bleeding" the nearest visible colour into the transparent area, so edges filter to clean colour.
  const rawPng = (name, c, iters, pow = 1) => {
    const w = c.width, h = c.height;
    const d = c.getContext('2d').getImageData(0, 0, w, h).data;
    if (pow !== 1) for (let i = 3; i < d.length; i += 4) d[i] = Math.round(255 * Math.pow(d[i] / 255, pow));
    const filled = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) filled[i] = d[i * 4 + 3] > 0 ? 1 : 0;
    for (let it = 0; it < iters; it++) {
      const upd = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (filled[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx; if (!filled[j]) continue;
          r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++;
        }
        if (n) upd.push(i, r / n, g / n, b / n);
      }
      for (let k = 0; k < upd.length; k += 4) { const i = upd[k]; d[i * 4] = upd[k + 1]; d[i * 4 + 1] = upd[k + 2]; d[i * 4 + 2] = upd[k + 3]; filled[i] = 1; }
    }
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, i + CH));
    out[name] = { raw: true, w, h, b64: btoa(bin) };
  };

  /* ---- panorama: 6 cube faces. Side faces alternate mirrored so neighbouring edges match exactly. ---- */
  const S = 1024;
  const base = mk(S, S);
  { const g = base.getContext('2d'); g.filter = 'blur(5px) saturate(1.1) brightness(0.8)';
    const sc = S / bg.height; const w = bg.width * sc; g.drawImage(bg, (S - w) / 2, 0, w, S); g.filter = 'none'; }
  const avg = (c, y0, h) => { const t = mk(1, 1); const g = t.getContext('2d'); g.drawImage(c, 0, y0, c.width, h, 0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
  const sky = avg(base, 0, 80), ground = avg(base, S - 160, 160);
  const face = (mirror) => {
    const c = mk(S, S); const g = c.getContext('2d');
    if (mirror) { g.translate(S, 0); g.scale(-1, 1); }
    g.drawImage(base, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const top = g.createLinearGradient(0, 0, 0, S * 0.22); top.addColorStop(0, 'rgba(' + sky + ',1)'); top.addColorStop(1, 'rgba(' + sky + ',0)');
    g.fillStyle = top; g.fillRect(0, 0, S, S * 0.22);
    const bot = g.createLinearGradient(0, S * 0.78, 0, S); bot.addColorStop(0, 'rgba(' + ground + ',0)'); bot.addColorStop(1, 'rgba(' + ground + ',1)');
    g.fillStyle = bot; g.fillRect(0, S * 0.78, S, S * 0.22);
    return c;
  };
  png('panorama_0', face(false)); png('panorama_1', face(true)); png('panorama_2', face(false)); png('panorama_3', face(true));
  const small = (c) => { const t = mk(512, 512); t.getContext('2d').drawImage(c, 0, 0, 512, 512); return t; };
  for (let i = 0; i < 4; i++) png('mod_pan_' + i, small(face(i % 2 === 1)));
  { const c = mk(S, S); const g = c.getContext('2d'); g.fillStyle = 'rgb(' + sky + ')'; g.fillRect(0, 0, S, S); png('panorama_4', c); }
  { const c = mk(512, 512); const g = c.getContext('2d'); g.fillStyle = 'rgb(' + sky + ')'; g.fillRect(0, 0, 512, 512); png('mod_pan_4', c); }
  { const c = mk(S, S); const g = c.getContext('2d'); g.fillStyle = 'rgb(' + ground + ')'; g.fillRect(0, 0, S, S); png('panorama_5', c); }
  { const c = mk(512, 512); const g = c.getContext('2d'); g.fillStyle = 'rgb(' + ground + ')'; g.fillRect(0, 0, 512, 512); png('mod_pan_5', c); }
  { const c = mk(1600, 900); const g = c.getContext('2d'); g.filter = 'blur(5px) saturate(1.1) brightness(0.8)'; const sc = Math.max(1600 / bg.width, 900 / bg.height); g.drawImage(bg, (1600 - bg.width * sc) / 2, (900 - bg.height * sc) / 2, bg.width * sc, bg.height * sc); png('mod_bg', c); }
  { const c = mk(256, 144); const g = c.getContext('2d');
    const r = g.createRadialGradient(128, 72, 40, 128, 72, 150); r.addColorStop(0, 'rgba(6,9,14,0.18)'); r.addColorStop(1, 'rgba(6,9,14,0.72)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 144); png('panorama_overlay', c); }

  /* ---- logo: turn the artwork's dark background into transparency (alpha from brightness) ---- */
  const cut = (img, sx, sy, sw, sh, dw, dh) => {
    const c = mk(dw, dh); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    const d = g.getImageData(0, 0, dw, dh); const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const m = Math.max(p[i], p[i + 1], p[i + 2]);
      const a = Math.min(1, Math.max(0, (m - 66) / 60)); p[i + 3] = Math.round(a * 255);
    }
    g.putImageData(d, 0, 0); return c;
  };
  // The wide logo sits on a flat navy background: derive alpha from distance to that colour and
  // un-premultiply, so glows keep their colour instead of turning into a grey halo.
  // The title screen draws only the top 44 of 64 rows of this texture, so everything stays inside that band.
  // Emblem and wordmark are scaled independently (each keeps its own proportions) so LUMEN can be large.
  let wordCenterX = 1300;
  const logoC = mk(2048, 512); {
    const t = mk(wide.width, wide.height); const tg = t.getContext('2d'); tg.drawImage(wide, 0, 0);
    const d = tg.getImageData(0, 0, t.width, t.height); const p = d.data;
    const bgc = [p[0], p[1], p[2]]; // top-left pixel = background
    for (let i = 0; i < p.length; i += 4) {
      const dist = Math.max(Math.abs(p[i] - bgc[0]), Math.abs(p[i + 1] - bgc[1]), Math.abs(p[i + 2] - bgc[2]));
      const a = Math.min(1, Math.max(0, (dist - 50) / 22)); // keep only the solid logo; the soft outer glow is cut away
      if (a > 0) for (let k = 0; k < 3; k++) p[i + k] = Math.max(0, Math.min(255, Math.round((p[i + k] - bgc[k] * (1 - a)) / a)));
      p[i + 3] = Math.round(a * 255);
    }
    tg.putImageData(d, 0, 0);
    const W = t.width, H = t.height, A = (x, y) => p[(y * W + x) * 4 + 3];
    const colMax = (x) => { let m = 0; for (let y = 0; y < H; y++) m = Math.max(m, A(x, y)); return m; };
    // find the gap between emblem and wordmark: first run of 6 empty columns after the emblem started
    let started = false, split = -1;
    for (let x = 0; x < W - 6 && split < 0; x++) {
      if (colMax(x) > 40) started = true;
      if (started && x > 150) { let empty = true; for (let k = 0; k < 6; k++) if (colMax(x + k) > 14) empty = false; if (empty) split = x + 3; }
    }
    if (split < 0) split = Math.round(W * 0.36);
    const box = (x0, x1) => { let a0 = H, a1 = 0, b0 = x1, b1 = x0; for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) if (A(x, y) > 8) { if (y < a0) a0 = y; if (y > a1) a1 = y; if (x < b0) b0 = x; if (x > b1) b1 = x; } const pd = 18; return { x: Math.max(x0, b0 - pd), y: Math.max(0, a0 - pd), w: Math.min(x1, b1 + pd) - Math.max(x0, b0 - pd), h: Math.min(H - 1, a1 + pd) - Math.max(0, a0 - pd) }; };
    const em = box(0, split), wd = box(split, W);
    const VIS = 512 * (44 / 64); // rows the title screen actually draws (352)
    const ke = (VIS - 6) / em.h;                 // emblem fills the band
    const kw = Math.min(ke * 1.02, (VIS - 6) / wd.h * 0.94); // wordmark: as tall as the emblem allows
    const gap = 8;
    let ew = em.w * ke, ww = wd.w * kw;
    let shrink = Math.min(1, 1990 / (ew + gap + ww)); // never exceed the texture width
    const ke2 = ke * shrink, kw2 = kw * shrink; ew *= shrink; ww *= shrink;
    const total = ew + gap + ww, x0 = (2048 - total) / 2;
    const g = logoC.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(t, em.x, em.y, em.w, em.h, x0, (VIS - em.h * ke2) / 2, ew, em.h * ke2);
    g.drawImage(t, wd.x, wd.y, wd.w, wd.h, x0 + ew + gap, (VIS - wd.h * kw2) / 2 - 4, ww, wd.h * kw2);
    wordCenterX = x0 + ew + gap + ww / 2;
    {
      const MW = 2000, MH = 840, m = 20;
      const ke3 = (MH - 2 * m) / em.h;
      const kw3 = Math.min(ke3 * 1.02, (MH - 2 * m) / wd.h * 0.94);
      let a = em.w * ke3, b = wd.w * kw3; const sh = Math.min(1, (MW - 2 * m - 28) / (a + 28 + b)); a *= sh; b *= sh;
      const mc = mk(MW, MH); const mg = mc.getContext('2d'); mg.imageSmoothingQuality = 'high';
      const ox = (MW - (a + 28 + b)) / 2;
      mg.drawImage(t, em.x, em.y, em.w, em.h, ox, (MH - em.h * ke3 * sh) / 2, a, em.h * ke3 * sh);
      mg.drawImage(t, wd.x, wd.y, wd.w, wd.h, ox + a + 28, (MH - wd.h * kw3 * sh) / 2, b, wd.h * kw3 * sh);
      rawPng('lumen_logo', mc, 8); rawPng('legacy_lumen_logo', mc, 8, 1.0);
      // Pre-shrunk copies. The game samples textures bilinearly, which turns a 4x downscale into noise, so the mod
      // picks the variant closest to the size it is actually drawn at.
      const shrink = (src, w) => {
        const h = Math.round(w * src.height / src.width);
        let cur = src;
        while (cur.width / 2 > w) { const t2 = mk(Math.round(cur.width / 2), Math.round(cur.height / 2)); const g2 = t2.getContext('2d'); g2.imageSmoothingQuality = 'high'; g2.drawImage(cur, 0, 0, t2.width, t2.height); cur = t2; }
        const out2 = mk(w, h); const g3 = out2.getContext('2d'); g3.imageSmoothingQuality = 'high'; g3.drawImage(cur, 0, 0, w, h); return out2;
      };
      for (const w of LOGO_SIZES) if (w < 2000) { const sc = shrink(mc, w); rawPng('lumen_logo_' + w, sc, 4); rawPng('legacy_lumen_logo_' + w, sc, 4, 1.0); }
    }
  }
  rawPng('minecraft', logoC, 4);
  rawPng('minceraft', logoC, 4);
  { const c = mk(1024, 128); const g = c.getContext('2d');
    g.font = '700 50px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '14px'; g.fillStyle = '#9fdcff'; g.shadowColor = 'rgba(61,184,255,0.8)'; g.shadowBlur = 20;
    g.fillText('JAVA EDITION', Math.max(330, Math.min(744, wordCenterX - 556)), 24); rawPng('edition', c, 4); }

  /* ---- buttons (200x20 nine-slice, 3px border) ---- */
  const btn = (fill, edge, bottom, hi) => { const c = mk(200, 20); const g = c.getContext('2d');
    g.fillStyle = edge; g.fillRect(0, 0, 200, 20); g.fillStyle = fill; g.fillRect(1, 1, 198, 18);
    g.fillStyle = bottom; g.fillRect(1, 17, 198, 2); if (hi) { g.fillStyle = hi; g.fillRect(1, 1, 198, 1); } return c; };
  png('button', btn('rgba(16,21,30,0.86)', 'rgba(52,62,78,1)', 'rgba(6,9,14,0.7)', 'rgba(255,255,255,0.07)'));
  png('button_highlighted', btn('rgba(24,44,66,0.92)', 'rgba(61,184,255,1)', 'rgba(8,24,38,0.8)', 'rgba(150,220,255,0.18)'));
  png('button_disabled', btn('rgba(14,17,23,0.55)', 'rgba(36,42,54,1)', 'rgba(6,9,14,0.5)', null));
  png('slider', btn('rgba(10,13,19,0.9)', 'rgba(44,52,66,1)', 'rgba(4,6,9,0.6)', null));
  png('slider_highlighted', btn('rgba(16,22,32,0.95)', 'rgba(61,184,255,1)', 'rgba(4,10,18,0.7)', null));
  const handle = (fill, edge) => { const c = mk(8, 20); const g = c.getContext('2d'); g.fillStyle = edge; g.fillRect(0, 0, 8, 20); g.fillStyle = fill; g.fillRect(1, 1, 6, 18); return c; };
  png('slider_handle', handle('rgba(120,140,165,1)', 'rgba(30,38,50,1)'));
  png('slider_handle_highlighted', handle('rgba(61,184,255,1)', 'rgba(10,40,60,1)'));

  /* ---- pack icon ---- */
  { const c = mk(128, 128); const g = c.getContext('2d'); g.fillStyle = '#0b0d11'; g.fillRect(0, 0, 128, 128); g.drawImage(cut(logo, 342, 50, 338, 336, 120, 120), 4, 4); png('pack', c); }
  return out;
})
`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('about:blank');
  const logo = dataUrl(path.join(root, 'src/renderer/assets/logo-full.png'), 'image/png');
  const bg = dataUrl(path.join(root, 'src/renderer/assets/bg.webp'), 'image/webp');
  const mark = dataUrl(path.join(root, 'src/renderer/assets/logo-mark.png'), 'image/png');
  const wide = dataUrl(path.join(root, 'src/renderer/assets/logo-wide.png'), 'image/png');
  const out = await win.webContents.executeJavaScript(`(${drawing})(${JSON.stringify(logo)}, ${JSON.stringify(bg)}, ${JSON.stringify(mark)}, ${JSON.stringify(wide)})`);
  const zlib = require('zlib');
  const encodePng = (w, h, rgba) => {
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  };
  const buf = (n) => (out[n].raw ? encodePng(out[n].w, out[n].h, Buffer.from(out[n].b64, 'base64')) : Buffer.from(out[n].split(',')[1], 'base64'));

  const zip = new AdmZip();
  const T = 'assets/minecraft/textures/gui/';
  for (let i = 0; i < 6; i++) zip.addFile(`${T}title/background/panorama_${i}.png`, buf('panorama_' + i));
  zip.addFile(`${T}title/background/panorama_overlay.png`, buf('panorama_overlay'));
  zip.addFile(`${T}title/minecraft.png`, buf('minecraft'));
  zip.addFile(`${T}title/minceraft.png`, buf('minceraft'));
  zip.addFile(`${T}title/edition.png`, buf('edition'));
  const smooth = Buffer.from(JSON.stringify({ texture: { blur: true } }));
  for (const n of ['minecraft', 'minceraft', 'edition']) zip.addFile(`${T}title/${n}.png.mcmeta`, smooth);
  const nine = Buffer.from(JSON.stringify({ gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: 3 } } }));
  for (const b of ['button', 'button_highlighted', 'button_disabled']) {
    zip.addFile(`${T}sprites/widget/${b}.png`, buf(b));
    zip.addFile(`${T}sprites/widget/${b}.png.mcmeta`, nine);
  }
  const nineH = Buffer.from(JSON.stringify({ gui: { scaling: { type: 'nine_slice', width: 8, height: 20, border: 3 } } }));
  for (const b of ['slider', 'slider_highlighted']) { zip.addFile(`${T}sprites/widget/${b}.png`, buf(b)); zip.addFile(`${T}sprites/widget/${b}.png.mcmeta`, nine); }
  for (const b of ['slider_handle', 'slider_handle_highlighted']) { zip.addFile(`${T}sprites/widget/${b}.png`, buf(b)); zip.addFile(`${T}sprites/widget/${b}.png.mcmeta`, nineH); }
  // Older versions (before 1.20.2) draw buttons from widgets.png, so only the background/logo/splashes apply there.
  // An empty splash list means the title screen shows no yellow splash text at all.
  zip.addFile('assets/minecraft/texts/splashes.txt', Buffer.from('\n'));
  zip.addFile('pack.png', buf('pack'));
  zip.addFile(
    'pack.mcmeta',
    Buffer.from(
      JSON.stringify(
        {
          pack: {
            description: '§bLumen Client§r menu theme',
            pack_format: 34,
            supported_formats: { min_inclusive: 1, max_inclusive: 999 },
            min_format: [1, 0],
            max_format: [999, 0],
          },
        },
        null,
        2,
      ),
    ),
  );
  // In-game mod resources (so the mod looks right even without the resource pack)
  const modRes = path.join(root, 'mod/common/assets');
  const put = (rel, b) => { const f = path.join(modRes, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
  for (let i = 0; i < 6; i++) put(`lumen/textures/gui/panorama/panorama_${i}.png`, buf('mod_pan_' + i));
  const blurMeta = Buffer.from(JSON.stringify({ texture: { blur: true } }));
  // Two logo sets. Minecraft 26.x blends the logo's soft glow lightly; 1.20.1 / 1.21.1 blend it at full strength, which
  // reads as a thick outline. The legacy set has the glow baked softer so all versions look the same.
  const logoSets = [['mod/logo-modern/assets', ''], ['mod/logo-legacy/assets', 'legacy_']];
  for (const [dir, prefix] of logoSets) {
    const putL = (rel, b) => { const f = path.join(root, dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
    putL('lumen/textures/gui/logo_2000.png', buf(prefix + 'lumen_logo'));
    putL('lumen/textures/gui/logo_2000.png.mcmeta', blurMeta);
    for (const w of out.logoSizes.split(',').map(Number)) if (w < 2000) { putL(`lumen/textures/gui/logo_${w}.png`, buf(prefix + 'lumen_logo_' + w)); putL(`lumen/textures/gui/logo_${w}.png.mcmeta`, blurMeta); }
  }
  put('lumen/textures/gui/background.png', buf('mod_bg'));
  put('lumen/textures/gui/background.png.mcmeta', Buffer.from(JSON.stringify({ texture: { blur: true } })));
  put('lumen/icon.png', buf('pack'));
  for (const b of ['button', 'button_highlighted', 'button_disabled']) {
    put(`minecraft/textures/gui/sprites/widget/${b}.png`, buf(b));
    put(`minecraft/textures/gui/sprites/widget/${b}.png.mcmeta`, nine);
  }
  for (const b of ['slider', 'slider_highlighted']) { put(`minecraft/textures/gui/sprites/widget/${b}.png`, buf(b)); put(`minecraft/textures/gui/sprites/widget/${b}.png.mcmeta`, nine); }
  for (const b of ['slider_handle', 'slider_handle_highlighted']) { put(`minecraft/textures/gui/sprites/widget/${b}.png`, buf(b)); put(`minecraft/textures/gui/sprites/widget/${b}.png.mcmeta`, nineH); }
  fs.mkdirSync(path.join(root, 'resources'), { recursive: true });
  zip.writeZip(path.join(root, 'resources/lumen-theme.zip'));
  // previews for eyeballing
  const prev = path.join(root, '.theme-preview');
  fs.mkdirSync(prev, { recursive: true });
  for (const n of ['minecraft', 'edition', 'button_highlighted', 'panorama_0', 'panorama_overlay']) fs.writeFileSync(path.join(prev, n + '.png'), buf(n));
  console.log('theme written');
  app.quit();
});

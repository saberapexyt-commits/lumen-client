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
  const png = (name, c) => (out[name] = c.toDataURL('image/png'));

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
  { const c = mk(S, S); const g = c.getContext('2d'); g.fillStyle = 'rgb(' + sky + ')'; g.fillRect(0, 0, S, S); png('panorama_4', c); }
  { const c = mk(S, S); const g = c.getContext('2d'); g.fillStyle = 'rgb(' + ground + ')'; g.fillRect(0, 0, S, S); png('panorama_5', c); }
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
  const logoC = mk(2048, 512); {
    const t = mk(wide.width, wide.height); const tg = t.getContext('2d'); tg.drawImage(wide, 0, 0);
    const d = tg.getImageData(0, 0, t.width, t.height); const p = d.data;
    const bgc = [p[0], p[1], p[2]]; // top-left pixel = background
    for (let i = 0; i < p.length; i += 4) {
      const dist = Math.max(Math.abs(p[i] - bgc[0]), Math.abs(p[i + 1] - bgc[1]), Math.abs(p[i + 2] - bgc[2]));
      const a = Math.min(1, Math.max(0, (dist - 10) / 70));
      if (a > 0) for (let k = 0; k < 3; k++) p[i + k] = Math.max(0, Math.min(255, Math.round((p[i + k] - bgc[k] * (1 - a)) / a)));
      p[i + 3] = Math.round(a * 255);
    }
    tg.putImageData(d, 0, 0);
    // crop to the visible artwork so the logo fills its slot instead of floating in padding
    let x0 = t.width, y0 = t.height, x1 = 0, y1 = 0;
    for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (p[(y * t.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const pad = 28; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(t.width - 1, x1 + pad); y1 = Math.min(t.height - 1, y1 + pad);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const g = logoC.getContext('2d'); g.imageSmoothingQuality = 'high';
    const VISIBLE = 512 * (44 / 64); // rows the title screen actually draws
    const k = Math.min(1990 / cw, (VISIBLE - 8) / ch); const w = cw * k, h = ch * k;
    g.drawImage(t, x0, y0, cw, ch, (2048 - w) / 2, (VISIBLE - h) / 2, w, h);
  }
  png('minecraft', logoC);
  png('minceraft', logoC);
  { const c = mk(1024, 128); const g = c.getContext('2d');
    g.font = '700 50px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '14px'; g.fillStyle = '#9fdcff'; g.shadowColor = 'rgba(61,184,255,0.8)'; g.shadowBlur = 20;
    g.fillText('JAVA EDITION', 668, 62); png('edition', c); }

  /* ---- buttons (200x20 nine-slice, 3px border) ---- */
  const btn = (fill, edge, bottom, hi) => { const c = mk(200, 20); const g = c.getContext('2d');
    g.fillStyle = edge; g.fillRect(0, 0, 200, 20); g.fillStyle = fill; g.fillRect(1, 1, 198, 18);
    g.fillStyle = bottom; g.fillRect(1, 17, 198, 2); if (hi) { g.fillStyle = hi; g.fillRect(1, 1, 198, 1); } return c; };
  png('button', btn('rgba(16,21,30,0.86)', 'rgba(52,62,78,1)', 'rgba(6,9,14,0.7)', 'rgba(255,255,255,0.07)'));
  png('button_highlighted', btn('rgba(24,44,66,0.92)', 'rgba(61,184,255,1)', 'rgba(8,24,38,0.8)', 'rgba(150,220,255,0.18)'));
  png('button_disabled', btn('rgba(14,17,23,0.55)', 'rgba(36,42,54,1)', 'rgba(6,9,14,0.5)', null));

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
  const buf = (n) => Buffer.from(out[n].split(',')[1], 'base64');

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
  fs.mkdirSync(path.join(root, 'resources'), { recursive: true });
  zip.writeZip(path.join(root, 'resources/lumen-theme.zip'));
  // previews for eyeballing
  const prev = path.join(root, '.theme-preview');
  fs.mkdirSync(prev, { recursive: true });
  for (const n of ['minecraft', 'edition', 'button_highlighted', 'panorama_0', 'panorama_overlay']) fs.writeFileSync(path.join(prev, n + '.png'), buf(n));
  console.log('theme written');
  app.quit();
});

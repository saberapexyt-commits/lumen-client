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
(async (logoUrl, bgUrl, markUrl) => {
  const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  const [logo, bg, mark] = await Promise.all([load(logoUrl), load(bgUrl), load(markUrl)]);
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
  const logoC = mk(1024, 256); { const g = logoC.getContext('2d');
    const emb = cut(logo, 342, 50, 338, 336, 236, 234); g.drawImage(emb, 20, 11);
    const word = cut(logo, 352, 394, 320, 106, 726, 240); g.drawImage(word, 268, 8); }
  png('minecraft', logoC);
  png('minceraft', logoC);
  { const c = mk(512, 64); const g = c.getContext('2d');
    g.font = '700 30px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '8px'; g.fillStyle = '#9fdcff'; g.shadowColor = 'rgba(61,184,255,0.8)'; g.shadowBlur = 10;
    g.fillText('JAVA EDITION', 256, 34); png('edition', c); }

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
  const out = await win.webContents.executeJavaScript(`(${drawing})(${JSON.stringify(logo)}, ${JSON.stringify(bg)}, ${JSON.stringify(mark)})`);
  const buf = (n) => Buffer.from(out[n].split(',')[1], 'base64');

  const zip = new AdmZip();
  const T = 'assets/minecraft/textures/gui/';
  for (let i = 0; i < 6; i++) zip.addFile(`${T}title/background/panorama_${i}.png`, buf('panorama_' + i));
  zip.addFile(`${T}title/background/panorama_overlay.png`, buf('panorama_overlay'));
  zip.addFile(`${T}title/minecraft.png`, buf('minecraft'));
  zip.addFile(`${T}title/minceraft.png`, buf('minceraft'));
  zip.addFile(`${T}title/edition.png`, buf('edition'));
  const nine = Buffer.from(JSON.stringify({ gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: 3 } } }));
  for (const b of ['button', 'button_highlighted', 'button_disabled']) {
    zip.addFile(`${T}sprites/widget/${b}.png`, buf(b));
    zip.addFile(`${T}sprites/widget/${b}.png.mcmeta`, nine);
  }
  // Older versions (before 1.20.2) draw buttons from widgets.png, so only the background/logo/splashes apply there.
  zip.addFile('assets/minecraft/texts/splashes.txt', fs.readFileSync(path.join(root, 'resources/theme/splashes.txt')));
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

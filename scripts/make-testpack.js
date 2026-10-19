// Dev/test helper: builds a deliberately ugly resource pack (red buttons, green panorama, red logo) to prove that
// Lumen's own screens are not affected by a player's resource packs.   npx electron scripts/make-testpack.js <out.zip>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const AdmZip = require('adm-zip');

app.whenReady().then(async () => {
  const out = process.argv[process.argv.length - 1];
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  const png = await win.webContents.executeJavaScript(`(() => {
    const make = (w, h, color) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h); return c.toDataURL('image/png').split(',')[1]; };
    return { red: make(200, 20, '#ff0000'), green: make(64, 64, '#00ff00'), logo: make(1024, 256, '#ff0000') };
  })()`);
  const buf = (b64) => Buffer.from(b64, 'base64');
  const zip = new AdmZip();
  const T = 'assets/minecraft/textures/gui/';
  const nine = Buffer.from(JSON.stringify({ gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: 3 } } }));
  for (const b of ['button', 'button_highlighted', 'button_disabled']) {
    zip.addFile(`${T}sprites/widget/${b}.png`, buf(png.red));
    zip.addFile(`${T}sprites/widget/${b}.png.mcmeta`, nine);
  }
  for (let i = 0; i < 6; i++) zip.addFile(`${T}title/background/panorama_${i}.png`, buf(png.green));
  zip.addFile(`${T}title/minecraft.png`, buf(png.logo));
  zip.addFile('pack.mcmeta', Buffer.from(JSON.stringify({ pack: { description: 'ugly test pack', pack_format: 34, min_format: [1, 0], max_format: [999, 0], supported_formats: { min_inclusive: 1, max_inclusive: 999 } } })));
  zip.writeZip(out);
  console.log('wrote', out);
  app.quit();
});

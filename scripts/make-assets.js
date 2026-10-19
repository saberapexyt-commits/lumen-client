// Derives the emblem-only crop and the app icon from the supplied full logo (run with: npx electron scripts/make-assets.js).
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
app.whenReady().then(() => {
  const root = path.join(__dirname, '..');
  const full = nativeImage.createFromPath(path.join(root, 'src/renderer/assets/logo-full.png'));
  const { width, height } = full.getSize();
  console.log('full logo', width, height);
  const S = 340, cx = 512, cy = 217;
  const mark = full.crop({ x: cx - S / 2, y: cy - S / 2, width: S, height: S });
  fs.writeFileSync(path.join(root, 'src/renderer/assets/logo-mark.png'), mark.resize({ width: 512, height: 512, quality: 'best' }).toPNG());
  fs.writeFileSync(path.join(root, 'build/icon.png'), mark.resize({ width: 512, height: 512, quality: 'best' }).toPNG());
  app.quit();
});

// Copies the plain-JS renderer into dist/ so packaging only needs dist/.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'src', 'renderer');
const dst = path.join(__dirname, '..', 'dist', 'renderer');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });

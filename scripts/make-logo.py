"""
Builds every logo asset from the artwork pieces in branding/ (cut out of the master logo, see branding/README.md):

  branding/icon.png         L + crystal (transparent)
  branding/name.png         "LUMEN" over "CLIENT" (transparent)
  branding/horizontal.png   icon left, name right (transparent), used for the vanilla title-screen logo slot

Outputs: in-game mod logo textures (all sizes, edge colour bled so older Minecraft versions show no dark outline),
launcher / website / installer icons, and the logo + pack icon inside resources/lumen-theme.zip.

    python scripts/make-logo.py
"""
import os, zipfile, shutil
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
P = lambda *a: os.path.join(ROOT, *a)

LOGO_W, LOGO_H = 2000, 1280  # master canvas of the in-game logo texture (the Java title screens use the same numbers)


def load(name):
    return Image.open(P('branding', name)).convert('RGBA')


def trim(im, thr=8):
    al = np.asarray(im.split()[3])
    ys, xs = np.where(al > thr)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def fit(im, w, h):
    k = min(w / im.width, h / im.height)
    return im.convert('RGBa').resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS).convert('RGBA')


def bleed(im, iters=6):
    """Copy the nearest visible colour into fully transparent texels (alpha stays 0), so bilinear filtering never
    mixes in black."""
    a = np.array(im)
    rgb = a[..., :3].astype(np.float32)
    filled = a[..., 3] > 0
    for _ in range(iters):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(filled.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                f = np.roll(np.roll(filled, dy, 0), dx, 1)
                c = np.roll(np.roll(rgb, dy, 0), dx, 1)
                acc += c * f[..., None]
                cnt += f
        new = (~filled) & (cnt > 0)
        rgb[new] = acc[new] / cnt[new][:, None]
        filled = filled | new
    a[..., :3] = rgb.clip(0, 255).astype(np.uint8)
    return Image.fromarray(a, 'RGBA')


icon = trim(load('icon.png'))
name = trim(load('name.png'))
horiz = trim(load('horizontal.png'))

# ---------------------------------------------------------------- lockup: icon over name
PAD = 30
name_w = LOGO_W - 2 * PAD
name_s = fit(name, name_w, LOGO_H)
icon_h = int(name_s.width * 0.43)
icon_s = fit(icon, LOGO_W, icon_h)
gap = int(icon_s.height * 0.11)
block_h = icon_s.height + gap + name_s.height
scale_down = min(1.0, (LOGO_H - 2 * PAD) / block_h)
if scale_down < 1.0:
    icon_s = fit(icon_s, int(icon_s.width * scale_down), int(icon_s.height * scale_down))
    name_s = fit(name_s, int(name_s.width * scale_down), int(name_s.height * scale_down))
    gap = int(gap * scale_down)
    block_h = icon_s.height + gap + name_s.height
master = Image.new('RGBA', (LOGO_W, LOGO_H), (0, 0, 0, 0))
y = (LOGO_H - block_h) // 2
master.alpha_composite(icon_s, ((LOGO_W - icon_s.width) // 2, y))
y += icon_s.height + gap
master.alpha_composite(name_s, ((LOGO_W - name_s.width) // 2, y))
lockup = trim(master)
print('lockup', lockup.size)

# ---------------------------------------------------------------- in-game mod textures
ladder = []
w = 200
while w < 2000:
    ladder.append(w)
    w = round(w * 1.12)
ladder.append(2000)
meta = b'{"texture":{"blur":true}}'
for d in ('mod/logo-modern', 'mod/logo-legacy'):
    gui = P(d, 'assets/lumen/textures/gui')
    os.makedirs(gui, exist_ok=True)
    for w in ladder:
        h = round(w * LOGO_H / LOGO_W)
        t = master if w == LOGO_W else master.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
        bleed(t, 4 if w < 2000 else 8).save(os.path.join(gui, f'logo_{w}.png'), optimize=True)
        with open(os.path.join(gui, f'logo_{w}.png.mcmeta'), 'wb') as f:
            f.write(meta)
print('mod textures', len(ladder), 'sizes')

# ---------------------------------------------------------------- launcher, website, installer
mark = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
ms = fit(icon, 470, 470)
mark.alpha_composite(ms, ((512 - ms.width) // 2, (512 - ms.height) // 2))
full = fit(lockup, 1024, 1024)
for d in ('src/renderer/assets', 'docs/assets'):
    mark.save(P(d, 'logo-mark.png'), optimize=True)
    full.save(P(d, 'logo-full.png'), optimize=True)
mark.save(P('build', 'icon.png'), optimize=True)
print('launcher assets, full', full.size)

# ---------------------------------------------------------------- vanilla title screen slot (resource pack)
# The vanilla logo slot is 2048x512 and only the top 44/64 rows are drawn.
slot = Image.new('RGBA', (2048, 512), (0, 0, 0, 0))
VIS = int(512 * 44 / 64)
hs = fit(horiz, 1900, VIS - 12)
slot.alpha_composite(hs, ((2048 - hs.width) // 2, (VIS - hs.height) // 2))
slot = bleed(slot, 4)
import io
def png_bytes(im):
    b = io.BytesIO()
    im.save(b, 'PNG', optimize=True)
    return b.getvalue()

pack_icon = Image.new('RGBA', (128, 128), (11, 13, 17, 255))
pi = fit(icon, 108, 108)
pack_icon.alpha_composite(pi, ((128 - pi.width) // 2, (128 - pi.height) // 2))
zin = P('resources', 'lumen-theme.zip')
tmp = zin + '.tmp'
repl = {
    'assets/minecraft/textures/gui/title/minecraft.png': png_bytes(slot),
    'assets/minecraft/textures/gui/title/minceraft.png': png_bytes(slot),
    'pack.png': png_bytes(pack_icon),
}
with zipfile.ZipFile(zin) as zi, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zo:
    for item in zi.infolist():
        zo.writestr(item.filename, repl.get(item.filename, zi.read(item.filename)))
shutil.move(tmp, zin)
print('theme pack updated')

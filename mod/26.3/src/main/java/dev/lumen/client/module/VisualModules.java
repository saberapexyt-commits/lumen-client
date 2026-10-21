package dev.lumen.client.module;

import dev.lumen.client.LumenOverlayAccess;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/** Purely cosmetic modules: a custom crosshair, lower fire, hit-flash colour and a minimal hotbar. */
public final class VisualModules {
    private VisualModules() {}

    /** Draws a customisable crosshair instead of the vanilla one (the mixin cancels the vanilla draw). */
    public static final class Crosshair extends LumenModule {
        public static final String[] STYLES = {"Cross", "Dot", "Ring", "Square"};

        public Crosshair() {
            super("crosshair", "Crosshair", "Pick a crosshair style, colour, size and gap.", false, 0, 0);
            firstRun(s -> s.color = 1); // blue by default
        }

        @Override
        public String category() {
            return "Visual";
        }

        /** Draws centred on the middle of the screen. The outline pass goes first so it never covers the fill. */
        public void draw(GuiGraphicsExtractor g, int w, int h) {
            ModuleState s = state();
            int col = color();
            int cx = w / 2, cy = h / 2;
            int t = Math.max(1, s.thickness), len = Math.max(1, s.size), gap = Math.max(0, s.gap);
            int lo = t / 2, hi = t - lo; // thickness split around the centre line
            for (int pass = s.outline ? 0 : 1; pass < 2; pass++) {
                boolean o = pass == 0;
                int c = o ? 0xE0000000 : col;
                int e = o ? 1 : 0;
                switch (Math.floorMod(s.style, STYLES.length)) {
                    case 1 -> g.fill(cx - lo - e, cy - lo - e, cx + hi + e, cy + hi + e, c);
                    case 2 -> {
                        int r = Math.max(3, len);
                        for (int a = 0; a < 360; a += 6) {
                            int px = cx + (int) Math.round(Math.cos(Math.toRadians(a)) * r);
                            int py = cy + (int) Math.round(Math.sin(Math.toRadians(a)) * r);
                            g.fill(px - lo - e, py - lo - e, px + hi + e, py + hi + e, c);
                        }
                    }
                    case 3 -> {
                        int r = Math.max(3, len);
                        g.fill(cx - r - e, cy - r - e, cx + r + t + e, cy - r + t + e, c);
                        g.fill(cx - r - e, cy + r - e, cx + r + t + e, cy + r + t + e, c);
                        g.fill(cx - r - e, cy - r - e, cx - r + t + e, cy + r + t + e, c);
                        g.fill(cx + r - e, cy - r - e, cx + r + t + e, cy + r + t + e, c);
                    }
                    default -> {
                        g.fill(cx - gap - len - e, cy - lo - e, cx - gap + e, cy + hi + e, c);
                        g.fill(cx + hi + gap - e, cy - lo - e, cx + hi + gap + len + e, cy + hi + e, c);
                        g.fill(cx - lo - e, cy - gap - len - e, cx + hi + e, cy - gap + e, c);
                        g.fill(cx - lo - e, cy + hi + gap - e, cx + hi + e, cy + hi + gap + len + e, c);
                    }
                }
            }
        }
    }

    /** Moves the first-person fire overlay down so it no longer covers the screen. */
    public static final class LowFire extends LumenModule {
        public LowFire() {
            super("lowfire", "Low Fire", "Lowers the fire overlay when you are burning so you can still see.", false, 0, 0);
        }

        @Override
        public String category() {
            return "Visual";
        }

        /** How far down to move the overlay (in view units). */
        public float drop() {
            return 0.2F + 0.15F * Math.floorMod(state().style, 3);
        }
    }

    /** Recolours the red flash on mobs and players when they are hit. */
    public static final class HitColor extends LumenModule {
        private int applied = -2;
        private Object appliedTo;

        public HitColor() {
            super("hitcolor", "Hit Colour", "Change the colour of the flash when something is hit.", false, 0, 0);
            firstRun(s -> s.color = 1);
        }

        @Override
        public String category() {
            return "Visual";
        }

        @Override
        public void tick(Minecraft mc) {
            if (mc.gameRenderer == null) return;
            Object tex = mc.gameRenderer.overlayTexture();
            int want = enabled() ? color() : 0xFFFF0000;
            if (tex == appliedTo && want == applied) return;
            if (tex instanceof LumenOverlayAccess access) {
                access.lumen$recolor(want);
                appliedTo = tex;
                applied = want;
            }
        }

        public void restore(Minecraft mc) {
            if (mc.gameRenderer != null && mc.gameRenderer.overlayTexture() instanceof LumenOverlayAccess access) access.lumen$recolor(0xFFFF0000);
        }
    }

    /** A flat translucent hotbar with an accent-coloured selection, replacing the vanilla textured one. */
    public static final class Hotbar extends LumenModule {
        public Hotbar() {
            super("hotbar", "Minimal Hotbar", "A clean, flat hotbar with a coloured selection box.", false, 0, 0);
            firstRun(s -> s.color = 1);
        }

        @Override
        public String category() {
            return "Visual";
        }

        public void bar(GuiGraphicsExtractor g, int x, int y, int w, int h) {
            g.fill(x, y, x + w, y + h, 0x9A0B0E14);
            g.fill(x, y + h - 1, x + w, y + h, 0x40FFFFFF);
        }

        /** (x, y) is the top-left of the 24x23 vanilla selection texture; the slot itself is 20x20 inside it. */
        public void selection(GuiGraphicsExtractor g, int x, int y) {
            int c = color();
            int x1 = x + 2, y1 = y + 1, x2 = x + 22, y2 = y + 22;
            g.fill(x1, y1, x2, y2, (c & 0x00FFFFFF) | 0x38000000);
            g.fill(x1, y1, x2, y1 + 1, c);
            g.fill(x1, y2 - 1, x2, y2, c);
            g.fill(x1, y1, x1 + 1, y2, c);
            g.fill(x2 - 1, y1, x2, y2, c);
        }
    }
}

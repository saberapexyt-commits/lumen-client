package dev.lumen.client;

/** Animated backgrounds for the Lumen main menu, drawn with plain rectangles so they work on every version. */
public final class MenuThemes {
    public static final String[] NAMES = {"Panorama", "Aurora", "Starfield", "Gradient"};

    @FunctionalInterface
    public interface Fill {
        void fill(int x1, int y1, int x2, int y2, int argb);
    }

    private MenuThemes() {}

    private static int argb(int a, int r, int g, int b) {
        return (a << 24) | (r << 16) | (g << 8) | b;
    }

    private static int lerp(int a, int b, float t) {
        return Math.round(a + (b - a) * t);
    }

    private static void sky(Fill f, int w, int h, int topR, int topG, int topB, int botR, int botG, int botB) {
        int step = Math.max(2, h / 90);
        for (int y = 0; y < h; y += step) {
            float t = y / (float) h;
            f.fill(0, y, w, Math.min(h, y + step), argb(255, lerp(topR, botR, t), lerp(topG, botG, t), lerp(topB, botB, t)));
        }
    }

    public static void draw(Fill f, int w, int h, long millis, int theme) {
        float t = millis / 1000.0F;
        switch (theme) {
            case 1 -> aurora(f, w, h, t);
            case 2 -> stars(f, w, h, t);
            default -> gradient(f, w, h, t);
        }
    }

    private static void aurora(Fill f, int w, int h, float t) {
        sky(f, w, h, 6, 9, 20, 10, 22, 34);
        int col = Math.max(2, w / 200);
        int[][] tint = {{61, 184, 255}, {76, 217, 138}, {160, 110, 255}};
        for (int layer = 0; layer < 3; layer++) {
            for (int x = 0; x < w; x += col) {
                float fx = x / (float) w;
                double wave = Math.sin(fx * 5.0 + t * (0.30 + layer * 0.10) + layer * 2.1) + 0.5 * Math.sin(fx * 11.0 - t * 0.45 + layer);
                float top = h * (0.18F + 0.14F * layer) + (float) wave * h * 0.08F;
                float len = h * (0.34F + 0.08F * (float) Math.sin(fx * 4 + t * 0.3 + layer));
                float shimmer = 0.65F + 0.35F * (float) Math.sin(t * 0.8 + fx * 9 + layer * 1.7);
                int[] c = tint[layer];
                int steps = 8;
                for (int s = 0; s < steps; s++) { // fade downwards
                    int y1 = (int) (top + len * s / steps), y2 = (int) (top + len * (s + 1) / steps);
                    float fade = 1 - s / (float) steps;
                    int a = (int) (135 * fade * fade * shimmer);
                    if (a > 0) f.fill(x, y1, x + col, y2, argb(a, c[0], c[1], c[2]));
                }
            }
        }
    }

    private static float hash(int n) {
        n = (n << 13) ^ n;
        return (((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0F) - 1.0F; // -1..1
    }

    private static void stars(Fill f, int w, int h, float t) {
        sky(f, w, h, 4, 6, 14, 12, 14, 30);
        for (int i = 0; i < 230; i++) {
            float rx = 0.5F + 0.5F * hash(i * 2 + 1);
            float ry = 0.5F + 0.5F * hash(i * 2 + 2);
            float speed = 2 + (i % 5) * 1.5F;
            int x = (int) (((rx * w - t * speed) % w + w) % w);
            int y = (int) (ry * h);
            float tw = 0.5F + 0.5F * (float) Math.sin(t * (1.0 + (i % 7) * 0.4) + i);
            int a = Math.min(255, (int) (80 + 160 * tw));
            int size = i % 11 == 0 ? 2 : 1;
            f.fill(x, y, x + size, y + size, argb(a, 235, 242, i % 4 == 0 ? 255 : 235));
            if (size == 2) {
                f.fill(x - 1, y, x + 3, y + 1, argb(a / 3, 160, 210, 255));
                f.fill(x, y - 1, x + 1, y + 3, argb(a / 3, 160, 210, 255));
            }
        }
    }

    private static void glow(Fill f, int cx, int cy, int radius, int r, int g, int b, int alpha) {
        int step = 3;
        for (int dy = -radius; dy < radius; dy += step) {
            int half = (int) Math.sqrt((double) radius * radius - (double) dy * dy);
            f.fill(cx - half, cy + dy, cx + half, cy + dy + step, argb(alpha, r, g, b));
        }
    }

    private static void gradient(Fill f, int w, int h, float t) {
        float k = (float) (0.5 + 0.5 * Math.sin(t * 0.25));
        sky(f, w, h, lerp(8, 24, k), lerp(14, 10, k), lerp(30, 40, k), lerp(14, 8, k), lerp(40, 22, k), lerp(70, 50, k));
        int gx = (int) (w * (0.55 + 0.30 * Math.sin(t * 0.17)));
        int gy = (int) (h * (0.55 + 0.20 * Math.cos(t * 0.13)));
        for (int i = 1; i <= 9; i++) glow(f, gx, gy, (int) (h * 0.06F * i), 61, 184, 255, 9); // soft drifting glow
        int hx = (int) (w * (0.30 + 0.25 * Math.cos(t * 0.11)));
        int hy = (int) (h * (0.35 + 0.15 * Math.sin(t * 0.19)));
        for (int i = 1; i <= 7; i++) glow(f, hx, hy, (int) (h * 0.07F * i), 160, 110, 255, 8);
    }
}

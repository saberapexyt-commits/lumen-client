package dev.lumen.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

/**
 * Lumen-styled button. Minecraft draws buttons from shared textures that a resource pack can restyle, so Lumen's
 * own screens paint their buttons directly. Several looks: plain, accent (primary), banner, small icon and list row.
 */
public final class UiButton extends AbstractWidget {
    public interface Press {
        void press(UiButton button);
    }

    private enum Kind { NORMAL, ACCENT, BANNER, ICON, ROW }

    /** 9x9 pixel pictograms for icon buttons. */
    public static final String[] GEAR = {"...###...", ".#.###.#.", "..#####..", "###...###", "###...###", "###...###", "..#####..", ".#.###.#.", "...###..."};
    public static final String[] LAYOUT = {"#########", "#.......#", "#.##....#", "#.##.###.", "#.......#", "#.###.#.#", "#.......#", "#########", "........."};
    public static final String[] GLOBE = {"..#####..", ".#..#..#.", "#...#...#", "#...#...#", "#########", "#...#...#", "#...#...#", ".#..#..#.", "..#####.."};
    public static final String[] CLOSE = {"##.....##", ".##...##.", "..##.##..", "...###...", "....#....", "...###...", "..##.##..", ".##...##.", "##.....##"};

    private final Press press;
    private Kind kind = Kind.NORMAL;
    private String[] glyph;
    private String subtitle = "";

    private UiButton(int x, int y, int w, int h, Component msg, Press press) {
        super(x, y, w, h, msg);
        this.press = press;
    }

    public static UiButton of(Component msg, Press press, int x, int y, int w, int h) {
        return new UiButton(x, y, w, h, msg, press);
    }

    /** Highlighted (primary) style, filled with the Lumen blue. */
    public UiButton accent() {
        this.kind = Kind.ACCENT;
        return this;
    }

    /** A wide promo-style button: title on the first line, a smaller description below it. */
    public UiButton banner(String subtitle) {
        this.kind = Kind.BANNER;
        this.subtitle = subtitle;
        return this;
    }

    /** A small square button showing a pictogram instead of text. */
    public UiButton icon(String[] glyph) {
        this.kind = Kind.ICON;
        this.glyph = glyph;
        return this;
    }

    /** A flat, left-aligned list row. */
    public UiButton row() {
        this.kind = Kind.ROW;
        return this;
    }

    /** Dark menu background (translucent over a world, opaque on the main menu). */
    public static void background(GuiGraphicsExtractor g, Minecraft mc, int w, int h) {
        int a = mc.level != null ? 0xC0000000 : 0xFF000000;
        g.fillGradient(0, 0, w, h, a | 0x0B0D11, a | 0x131923);
    }

    /** A filled rectangle with its corners cut by two pixels (rounded look). Rows never overlap, so alpha stays even. */
    public static void rrect(GuiGraphicsExtractor g, int x1, int y1, int x2, int y2, int color) {
        g.fill(x1 + 2, y1, x2 - 2, y1 + 1, color);
        g.fill(x1 + 1, y1 + 1, x2 - 1, y1 + 2, color);
        g.fill(x1, y1 + 2, x2, y2 - 2, color);
        g.fill(x1 + 1, y2 - 2, x2 - 1, y2 - 1, color);
        g.fill(x1 + 2, y2 - 1, x2 - 2, y2, color);
    }

    /** Draw a bordered rounded panel. */
    public static void panel(GuiGraphicsExtractor g, int x1, int y1, int x2, int y2, int border, int fill) {
        rrect(g, x1, y1, x2, y2, border);
        rrect(g, x1 + 1, y1 + 1, x2 - 1, y2 - 1, fill);
    }

    public static void drawGlyph(GuiGraphicsExtractor g, String[] bits, int x, int y, int scale, int color) {
        for (int r = 0; r < bits.length; r++) {
            for (int c = 0; c < bits[r].length(); c++) {
                if (bits[r].charAt(c) == '#') g.fill(x + c * scale, y + r * scale, x + (c + 1) * scale, y + (r + 1) * scale, color);
            }
        }
    }

    @Override
    public void onClick(MouseButtonEvent event, boolean doubleClick) {
        press.press(this);
    }

    @Override
    protected void extractWidgetRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        boolean hot = this.isHoveredOrFocused() && this.active;
        int x = getX(), y = getY(), w = getWidth(), h = getHeight();
        Minecraft mc = Minecraft.getInstance();
        int text = this.active ? 0xFFFFFFFF : 0xFF7C8494;
        switch (kind) {
            case ACCENT -> {
                panel(g, x, y, x + w, y + h, hot ? 0xFF6FCBFF : 0xFF2B8FD0, hot ? 0xFF2F9BE0 : 0xFF1F78B8);
                g.centeredText(mc.font, getMessage(), x + w / 2, y + (h - mc.font.lineHeight) / 2 + 1, text);
            }
            case ICON -> {
                panel(g, x, y, x + w, y + h, hot ? 0xFF3DB8FF : 0xFF262B35, hot ? 0xFF1A2230 : 0xFF11141A);
                int s = Math.max(1, Math.min(w, h) / 11);
                drawGlyph(g, glyph, x + (w - 9 * s) / 2, y + (h - 9 * s) / 2, s, hot ? 0xFFFFFFFF : 0xFFB8BFCC);
            }
            case ROW -> {
                if (hot) rrect(g, x, y, x + w, y + h, 0x55FFFFFF);
                String s = getMessage().getString();
                g.text(mc.font, mc.font.plainSubstrByWidth(s, w - 10), x + 6, y + (h - mc.font.lineHeight) / 2 + 1, hot ? 0xFFFFFFFF : 0xFFC9D0DC, false);
            }
            case BANNER -> {
                panel(g, x, y, x + w, y + h, hot ? 0xFF6FCBFF : 0xFF2B6FA8, 0xFF101826);
                g.fillGradient(x + 2, y + 2, x + w - 2, y + h - 2, hot ? 0xFF1F5E94 : 0xFF173F66, 0xFF121B2E);
                g.text(mc.font, getMessage(), x + 10, y + h / 2 - mc.font.lineHeight - 1, 0xFFFFFFFF, false);
                g.text(mc.font, subtitle, x + 10, y + h / 2 + 3, 0xFFA9C7E4, false);
                g.text(mc.font, ">", x + w - 14, y + (h - mc.font.lineHeight) / 2 + 1, hot ? 0xFFFFFFFF : 0xFFA9C7E4, false);
            }
            default -> {
                panel(g, x, y, x + w, y + h, hot ? 0xFF3DB8FF : (this.active ? 0xFF262B35 : 0xFF1A1E26), hot ? 0xFF1A2230 : (this.active ? 0xFF11141A : 0xFF0E1117));
                g.centeredText(mc.font, getMessage(), x + w / 2, y + (h - mc.font.lineHeight) / 2 + 1, text);
            }
        }
    }

    @Override
    protected void updateWidgetNarration(NarrationElementOutput output) {
        defaultButtonNarrationText(output);
    }
}

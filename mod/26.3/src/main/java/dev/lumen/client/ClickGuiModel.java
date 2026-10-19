package dev.lumen.client;

import dev.lumen.client.module.BehaviourModules;
import dev.lumen.client.module.LumenModule;
import dev.lumen.client.module.ModuleManager;
import dev.lumen.client.module.ModuleState;
import dev.lumen.client.module.VisualModules;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.BooleanSupplier;
import java.util.function.IntConsumer;
import java.util.function.Supplier;

/**
 * The Lumen menu (Right Shift): draggable panels, one per category, with a row per module.
 * Left click toggles, right click opens the module's options. Everything is drawn through {@link Painter},
 * so this logic is identical on every Minecraft version and does not depend on any Minecraft class.
 */
public final class ClickGuiModel {
    public interface Painter {
        void fill(int x1, int y1, int x2, int y2, int argb);

        void text(String s, int x, int y, int argb);

        int width(String s);

        int lineHeight();
    }

    public enum Action { NONE, HUD_EDITOR, CLOSE }

    private static final int PW = 104, HEAD = 17, ROW = 14, OPT = 12, GAP = 8;
    private static final int ACCENT = 0xFF3DB8FF;
    private static final String[] ORDER = {"HUD", "Info", "Visual", "Movement", "Menu"};

    private static final class Opt {
        final Supplier<String> label;
        final IntConsumer click; // 0 = left click, 1 = right click

        Opt(Supplier<String> label, IntConsumer click) {
            this.label = label;
            this.click = click;
        }
    }

    private static final class Row {
        final String label, desc;
        final BooleanSupplier on;
        final Runnable toggle;
        final List<Opt> opts = new ArrayList<>();
        boolean expanded;

        Row(String label, String desc, BooleanSupplier on, Runnable toggle) {
            this.label = label;
            this.desc = desc;
            this.on = on;
            this.toggle = toggle;
        }
    }

    private static final class Panel {
        final String title;
        final List<Row> rows = new ArrayList<>();
        float x, y;
        boolean placed;
        int scroll;

        Panel(String title) {
            this.title = title;
        }
    }

    private record Item(Row row, Opt opt, int y, int h) {}

    private final List<Panel> panels = new ArrayList<>();
    private Panel dragging;
    private double grabX, grabY;
    private String search = "";
    private String hoverDesc = "";
    private int w, h;

    public ClickGuiModel() {
        Map<String, Panel> byTitle = new LinkedHashMap<>();
        for (String t : ORDER) byTitle.put(t, new Panel(t));
        for (LumenModule m : ModuleManager.ALL) {
            Panel p = byTitle.computeIfAbsent(m.category(), Panel::new);
            Row r = new Row(m.name, m.description, m::enabled, () -> m.setEnabled(!m.enabled()));
            addOptions(r, m);
            p.rows.add(r);
        }
        LumenConfig c = LumenConfig.get();
        Panel menu = byTitle.get("Menu");
        menu.rows.add(new Row("Custom main menu", "Replace the vanilla title screen with the Lumen menu.", () -> c.customMenu, () -> c.customMenu = !c.customMenu));
        menu.rows.add(new Row("Quick join list", "Show your saved servers as one-click buttons on the Lumen menu.", () -> c.quickJoin, () -> c.quickJoin = !c.quickJoin));
        Row bg = new Row("Menu background", "Animated backgrounds for the Lumen main menu. Click to cycle.", () -> c.menuTheme != 0, () -> c.menuTheme = (c.menuTheme + 1) % MenuThemes.NAMES.length);
        bg.opts.add(new Opt(() -> MenuThemes.NAMES[Math.floorMod(c.menuTheme, MenuThemes.NAMES.length)],
            b -> c.menuTheme = Math.floorMod(c.menuTheme + (b == 0 ? 1 : -1), MenuThemes.NAMES.length)));
        menu.rows.add(bg);
        for (Panel p : byTitle.values()) if (!p.rows.isEmpty()) panels.add(p);
    }

    private static void addOptions(Row r, LumenModule m) {
        if (m.isHud()) {
            r.opts.add(new Opt(() -> "Size: " + Math.round(m.state().scale * 100) + "%", b -> {
                float s = m.state().scale + (b == 0 ? 0.05F : -0.05F);
                m.state().scale = Math.round(Math.max(0.5F, Math.min(2.0F, s)) * 20F) / 20F;
            }));
            r.opts.add(new Opt(() -> "Colour: " + LumenModule.COLOR_NAMES[Math.floorMod(m.state().color, LumenModule.COLORS.length)],
                b -> m.state().color = Math.floorMod(m.state().color + (b == 0 ? 1 : -1), LumenModule.COLORS.length)));
            r.opts.add(new Opt(() -> "Text shadow: " + (m.state().shadow ? "ON" : "OFF"), b -> m.state().shadow = !m.state().shadow));
            if (m.supportsBackground()) r.opts.add(new Opt(() -> "Background: " + (m.state().background ? "ON" : "OFF"), b -> m.state().background = !m.state().background));
            r.opts.add(new Opt(() -> "Reset position", b -> m.resetPosition()));
        }
        if (m instanceof VisualModules.Crosshair) {
            ModuleState s = m.state();
            r.opts.add(new Opt(() -> "Style: " + VisualModules.Crosshair.STYLES[Math.floorMod(s.style, VisualModules.Crosshair.STYLES.length)],
                b -> s.style = Math.floorMod(s.style + (b == 0 ? 1 : -1), VisualModules.Crosshair.STYLES.length)));
            r.opts.add(colourOpt(m));
            r.opts.add(new Opt(() -> "Size: " + s.size, b -> s.size = Math.max(1, Math.min(16, s.size + (b == 0 ? 1 : -1)))));
            r.opts.add(new Opt(() -> "Gap: " + s.gap, b -> s.gap = Math.max(0, Math.min(10, s.gap + (b == 0 ? 1 : -1)))));
            r.opts.add(new Opt(() -> "Thickness: " + s.thickness, b -> s.thickness = Math.max(1, Math.min(4, s.thickness + (b == 0 ? 1 : -1)))));
            r.opts.add(new Opt(() -> "Outline: " + (s.outline ? "ON" : "OFF"), b -> s.outline = !s.outline));
        }
        if (m instanceof VisualModules.LowFire) {
            r.opts.add(new Opt(() -> "Height: " + (Math.floorMod(m.state().style, 3) + 1) + "/3", b -> m.state().style = Math.floorMod(m.state().style + (b == 0 ? 1 : -1), 3)));
        }
        if (m instanceof VisualModules.HitColor || m instanceof VisualModules.Hotbar) r.opts.add(colourOpt(m));
        if (m instanceof BehaviourModules.Zoom) {
            r.opts.add(new Opt(() -> "Zoom strength: " + Math.round((1 - BehaviourModules.Zoom.factor) * 100) + "%",
                b -> BehaviourModules.Zoom.factor = (float) Math.max(0.04, Math.min(0.9, BehaviourModules.Zoom.factor * (b == 0 ? 0.9 : 1 / 0.9)))));
        }
    }

    private static Opt colourOpt(LumenModule m) {
        return new Opt(() -> "Colour: " + LumenModule.COLOR_NAMES[Math.floorMod(m.state().color, LumenModule.COLORS.length)],
            b -> m.state().color = Math.floorMod(m.state().color + (b == 0 ? 1 : -1), LumenModule.COLORS.length));
    }

    /* ---------- layout ---------- */
    public void layout(int screenW, int screenH) {
        this.w = screenW;
        this.h = screenH;
        // default arrangement: left to right, wrapping to a new row when the screen is narrow
        int x = 10, y = 30, rowH = 0;
        for (Panel p : panels) {
            if (x + PW > screenW - 6 && x > 10) {
                x = 10;
                y += rowH + GAP;
                rowH = 0;
            }
            float[] saved = LumenConfig.get().panels.get(p.title);
            if (!p.placed) {
                if (saved != null) {
                    p.x = saved[0] * screenW;
                    p.y = saved[1] * screenH;
                } else {
                    p.x = x;
                    p.y = y;
                }
                p.placed = true;
            }
            rowH = Math.max(rowH, HEAD + Math.min(contentHeight(p), 110) + 4);
            x += PW + GAP;
            clamp(p);
        }
    }

    private void clamp(Panel p) {
        p.x = Math.max(0, Math.min(w - PW, p.x));
        p.y = Math.max(0, Math.min(h - HEAD - 4, p.y));
    }

    private boolean matches(Row r) {
        return search.isEmpty() || r.label.toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT));
    }

    private List<Item> items(Panel p) {
        List<Item> out = new ArrayList<>();
        int y = 0;
        for (Row r : p.rows) {
            if (!matches(r)) continue;
            out.add(new Item(r, null, y, ROW));
            y += ROW;
            if (r.expanded) for (Opt o : r.opts) {
                out.add(new Item(r, o, y, OPT));
                y += OPT;
            }
        }
        return out;
    }

    private int contentHeight(Panel p) {
        int total = 0;
        for (Item i : items(p)) total += i.h();
        return total;
    }

    private int viewHeight(Panel p) {
        return Math.max(ROW, Math.min(contentHeight(p), h - (int) p.y - HEAD - 30));
    }

    private boolean visible(Panel p) {
        for (Row r : p.rows) if (matches(r)) return true;
        return false;
    }

    /* ---------- drawing ---------- */
    public void render(Painter p, int mx, int my, long millis) {
        p.fill(0, 0, w, h, 0x78000000);
        // search box
        int sx = 10, sy = 8, sw = PW + 40, sh = 14;
        p.fill(sx, sy, sx + sw, sy + sh, 0xD00A0D12);
        p.fill(sx, sy + sh - 1, sx + sw, sy + sh, ACCENT);
        boolean caret = (millis / 500) % 2 == 0;
        String shown = search.isEmpty() ? "Search..." : search + (caret ? "_" : "");
        p.text(shown, sx + 4, sy + (sh - p.lineHeight()) / 2 + 1, search.isEmpty() ? 0xFF7C8494 : 0xFFFFFFFF);

        hoverDesc = "";
        for (Panel pn : panels) {
            if (!visible(pn)) continue;
            int px = (int) pn.x, py = (int) pn.y;
            int vh = viewHeight(pn);
            p.fill(px, py, px + PW, py + HEAD + vh + 2, 0xD00A0D12);
            p.fill(px, py, px + PW, py + HEAD, 0xE6121820);
            p.fill(px, py + HEAD - 1, px + PW, py + HEAD, ACCENT);
            String title = pn.title.toUpperCase(Locale.ROOT);
            p.text(title, px + (PW - p.width(title)) / 2, py + (HEAD - p.lineHeight()) / 2, ACCENT);

            int top = py + HEAD;
            for (Item it : items(pn)) {
                int iy = top + it.y() - pn.scroll;
                if (iy < top || iy + it.h() > top + vh + 1) continue; // only rows fully inside the panel
                boolean hot = mx >= px && mx < px + PW && my >= iy && my < iy + it.h();
                if (it.opt() == null) {
                    boolean on = it.row().on.getAsBoolean();
                    if (on) p.fill(px, iy, px + PW, iy + ROW, 0xB02A86C8);
                    if (hot) p.fill(px, iy, px + PW, iy + ROW, 0x26FFFFFF);
                    p.text(it.row().label, px + 6, iy + (ROW - p.lineHeight()) / 2 + 1, on ? 0xFFFFFFFF : 0xFFB8BFCC);
                    if (!it.row().opts.isEmpty()) {
                        String mark = it.row().expanded ? "-" : "+";
                        p.text(mark, px + PW - 4 - p.width(mark), iy + (ROW - p.lineHeight()) / 2 + 1, on ? 0xFFFFFFFF : 0xFF7C8494);
                    }
                    if (hot) hoverDesc = it.row().desc;
                } else {
                    p.fill(px, iy, px + PW, iy + OPT, hot ? 0x58FFFFFF : 0x50000000);
                    p.text(it.opt().label.get(), px + 12, iy + (OPT - p.lineHeight()) / 2 + 1, 0xFFDDE3EE);
                }
            }
        }
        if (!hoverDesc.isEmpty()) p.text(hoverDesc, (w - p.width(hoverDesc)) / 2, h - 36, 0xFFB8BFCC);
        // bottom buttons
        button(p, "Edit HUD layout", w / 2 - 106, h - 22, 104, mx, my);
        button(p, "Done", w / 2 + 2, h - 22, 60, mx, my);
    }

    private void button(Painter p, String label, int x, int y, int bw, int mx, int my) {
        boolean hot = mx >= x && mx < x + bw && my >= y && my < y + 16;
        p.fill(x, y, x + bw, y + 16, hot ? ACCENT : 0xFF343E4E);
        p.fill(x + 1, y + 1, x + bw - 1, y + 15, hot ? 0xF2182C42 : 0xE010151E);
        p.text(label, x + (bw - p.width(label)) / 2, y + (16 - p.lineHeight()) / 2 + 1, 0xFFFFFFFF);
    }

    /* ---------- input ---------- */
    public Action mouseClicked(double mx, double my, int button) {
        if (my >= h - 22 && my < h - 6) {
            if (mx >= w / 2 - 106 && mx < w / 2 - 2) return Action.HUD_EDITOR;
            if (mx >= w / 2 + 2 && mx < w / 2 + 62) return Action.CLOSE;
        }
        for (int i = panels.size() - 1; i >= 0; i--) {
            Panel pn = panels.get(i);
            if (!visible(pn)) continue;
            int px = (int) pn.x, py = (int) pn.y, vh = viewHeight(pn);
            if (mx < px || mx >= px + PW || my < py || my >= py + HEAD + vh + 2) continue;
            panels.remove(i); // bring to front
            panels.add(pn);
            if (my < py + HEAD) {
                if (button == 0) {
                    dragging = pn;
                    grabX = mx - pn.x;
                    grabY = my - pn.y;
                }
                return Action.NONE;
            }
            int top = py + HEAD;
            for (Item it : items(pn)) {
                int iy = top + it.y() - pn.scroll;
                if (iy < top || iy + it.h() > top + vh + 1 || my < iy || my >= iy + it.h()) continue;
                if (it.opt() != null) it.opt().click.accept(button == 1 ? 1 : 0);
                else if (button == 0) it.row().toggle.run();
                else if (button == 1 && !it.row().opts.isEmpty()) it.row().expanded = !it.row().expanded;
                LumenConfig.get().save();
                return Action.NONE;
            }
            return Action.NONE;
        }
        return Action.NONE;
    }

    public void mouseDragged(double mx, double my) {
        if (dragging == null) return;
        dragging.x = (float) (mx - grabX);
        dragging.y = (float) (my - grabY);
        clamp(dragging);
    }

    public void mouseReleased() {
        if (dragging == null) return;
        LumenConfig.get().panels.put(dragging.title, new float[]{dragging.x / w, dragging.y / h});
        LumenConfig.get().save();
        dragging = null;
    }

    public void mouseScrolled(double mx, double my, double dy) {
        for (int i = panels.size() - 1; i >= 0; i--) {
            Panel pn = panels.get(i);
            if (!visible(pn)) continue;
            int px = (int) pn.x, py = (int) pn.y, vh = viewHeight(pn);
            if (mx < px || mx >= px + PW || my < py || my >= py + HEAD + vh + 2) continue;
            int max = Math.max(0, contentHeight(pn) - vh);
            pn.scroll = Math.max(0, Math.min(max, pn.scroll + (dy > 0 ? -ROW : ROW)));
            return;
        }
    }

    public void charTyped(char c) {
        if (c >= 32 && c != 127 && search.length() < 24) {
            search += c;
            for (Panel p : panels) p.scroll = 0;
        }
    }

    public void backspace() {
        if (!search.isEmpty()) search = search.substring(0, search.length() - 1);
    }

    public boolean hasSearch() {
        return !search.isEmpty();
    }

    public void clearSearch() {
        search = "";
    }
}

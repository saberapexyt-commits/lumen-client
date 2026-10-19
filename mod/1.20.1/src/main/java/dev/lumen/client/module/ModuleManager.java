package dev.lumen.client.module;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import java.util.List;

public final class ModuleManager {
    public static final BehaviourModules.Zoom ZOOM = new BehaviourModules.Zoom();
    public static final BehaviourModules.Fullbright FULLBRIGHT = new BehaviourModules.Fullbright();
    public static final VisualModules.Crosshair CROSSHAIR = new VisualModules.Crosshair();
    public static final VisualModules.LowFire LOW_FIRE = new VisualModules.LowFire();
    public static final VisualModules.HitColor HIT_COLOR = new VisualModules.HitColor();
    public static final VisualModules.Hotbar HOTBAR = new VisualModules.Hotbar();

    public static final List<LumenModule> ALL = List.of(
        new Modules.Fps(),
        new Modules.Cps(),
        new Modules.Coordinates(),
        new KeystrokesModule(),
        new ArmorModule(),
        new Modules.Ping(),
        new Modules.Clock(),
        new Modules.Memory(),
        new Modules.Speed(),
        new Modules.Day(),
        new Modules.Food(),
        new Modules.Rotation(),
        new BehaviourModules.ToggleSprint(),
        ZOOM,
        FULLBRIGHT,
        CROSSHAIR,
        HOTBAR,
        LOW_FIRE,
        HIT_COLOR
    );

    private ModuleManager() {}

    /** Screen position of a module's top-left corner in GUI pixels. */
    public static int px(LumenModule m, int guiWidth, Minecraft mc) {
        float w = m.width(mc) * m.state().scale;
        return Math.round(Math.max(0, Math.min(guiWidth - w, m.state().x * guiWidth)));
    }

    public static int py(LumenModule m, int guiHeight, Minecraft mc) {
        float h = m.height(mc) * m.state().scale;
        return Math.round(Math.max(0, Math.min(guiHeight - h, m.state().y * guiHeight)));
    }

    public static void renderHud(GuiGraphics g, Minecraft mc) {
        int w = g.guiWidth(), h = g.guiHeight();
        for (LumenModule m : ALL) {
            if (!m.isHud() || !m.enabled()) continue;
            drawAt(g, mc, m, px(m, w, mc), py(m, h, mc));
        }
    }

    public static void drawAt(GuiGraphics g, Minecraft mc, LumenModule m, int x, int y) {
        var pose = g.pose();
        pose.pushPose();
        pose.translate(x, y, 0);
        pose.scale(m.state().scale, m.state().scale, 1.0F);
        m.render(g, mc);
        pose.popPose();
    }

    /** Called when the game closes so temporary changes (like fullbright's brightness) are never saved. */
    public static void shutdown(Minecraft mc) {
        FULLBRIGHT.restore(mc);
        HIT_COLOR.restore(mc);
    }

    public static void tick(Minecraft mc) {
        for (LumenModule m : ALL) m.tick(mc);
    }
}

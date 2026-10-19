package dev.lumen.client.module;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import java.util.List;

public final class ModuleManager {
    public static final BehaviourModules.Zoom ZOOM = new BehaviourModules.Zoom();

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
        new BehaviourModules.ToggleSprint(),
        ZOOM
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

    public static void tick(Minecraft mc) {
        for (LumenModule m : ALL) m.tick(mc);
    }
}

package dev.lumen.client.module;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;

/** Modules that change how the game behaves instead of drawing on the HUD. */
public final class BehaviourModules {
    private BehaviourModules() {}

    /** Keeps you sprinting while you walk forward - no need to hold the sprint key. */
    public static final class ToggleSprint extends LumenModule {
        public ToggleSprint() {
            super("togglesprint", "Toggle Sprint", "Sprint automatically while you move forward.", false, 0, 0);
        }

        @Override
        public void tick(Minecraft mc) {
            LocalPlayer p = mc.player;
            if (!enabled() || p == null || mc.screen != null) return;
            boolean forward = mc.options.keyUp.isDown();
            if (forward && !p.isSprinting() && !p.isUsingItem() && !p.horizontalCollision && p.getFoodData().getFoodLevel() > 6) {
                p.setSprinting(true);
            }
        }
    }

    /** Hold the zoom key (default C) to zoom in smoothly. The zoom itself is applied in GameRendererMixin. */
    public static final class Zoom extends LumenModule {
        public static float progress; // 0 = no zoom, 1 = fully zoomed

        public Zoom() {
            super("zoom", "Zoom", "Hold the zoom key (default C) to zoom in smoothly.", true, 0, 0);
        }
    }
}

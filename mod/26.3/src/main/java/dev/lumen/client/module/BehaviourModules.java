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
        public String category() {
            return "Movement";
        }

        @Override
        public void tick(Minecraft mc) {
            LocalPlayer p = mc.player;
            if (!enabled() || p == null || mc.gui.screen() != null) return;
            boolean forward = mc.options.keyUp.isDown();
            if (forward && !p.isSprinting() && !p.isUsingItem() && !p.horizontalCollision && p.getFoodData().getFoodLevel() > 6) {
                p.setSprinting(true);
            }
        }
    }

    /**
     * Hold the zoom key (default C) to zoom in smoothly, and use the scroll wheel to zoom further in or back out.
     * The field of view itself is changed in a mixin (GameRenderer / Camera, depending on the version).
     */
    public static final class Zoom extends LumenModule {
        public static float progress; // 0 = no zoom, 1 = fully zoomed
        /** Field of view multiplier at full zoom: smaller = closer. Changed with the scroll wheel while zooming. */
        public static float factor = 0.25F;

        public Zoom() {
            super("zoom", "Zoom", "Hold the zoom key (default C) to zoom in smoothly. Scroll wheel zooms in and out.", true, 0, 0);
        }

        @Override
        public String category() {
            return "Visual";
        }

        /** Returns true when the scroll was used for zooming (so the hotbar should not scroll). */
        public static boolean onScroll(double dy, boolean zoomKeyDown, boolean enabled, boolean noScreen) {
            if (!enabled || !zoomKeyDown || !noScreen || dy == 0) return false;
            factor = (float) Math.max(0.04, Math.min(0.9, dy > 0 ? factor * 0.85 : factor / 0.85));
            return true;
        }
    }

    /** Makes everything fully bright, like night vision without the effect. Some servers disallow it - check their rules. */
    public static final class Fullbright extends LumenModule {
        private double saved = -1;

        public Fullbright() {
            super("fullbright", "Fullbright", "Maximum brightness everywhere. Some servers do not allow this.", false, 0, 0);
        }

        @Override
        public String category() {
            return "Visual";
        }

        @Override
        public void tick(Minecraft mc) {
            if (enabled()) {
                if (saved < 0) saved = mc.options.gamma().get();
                if (mc.options.gamma().get() < 15.0) mc.options.gamma().set(16.0);
            } else {
                restore(mc);
            }
        }

        /** Put the player's own brightness setting back (also called when the game closes so it is never saved as 16). */
        public void restore(Minecraft mc) {
            if (saved >= 0) {
                mc.options.gamma().set(saved);
                saved = -1;
            }
        }
    }
}

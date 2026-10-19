package dev.lumen.client.module;

import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.core.Direction;
import net.minecraft.client.player.LocalPlayer;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** The simple one-line HUD modules. */
public final class Modules {
    private Modules() {}

    public static final class Fps extends TextModule {
        public Fps() {
            super("fps", "FPS", "Shows your current frames per second.", true, 0.01F, 0.02F);
        }

        @Override
        protected String text(Minecraft mc) {
            return mc.getFps() + " FPS";
        }
    }

    public static final class Cps extends TextModule {
        public Cps() {
            super("cps", "CPS", "Clicks per second: left | right.", true, 0.01F, 0.08F);
        }

        @Override
        protected String text(Minecraft mc) {
            return CpsTracker.left() + " | " + CpsTracker.right() + " CPS";
        }
    }

    public static final class Coordinates extends TextModule {
        public Coordinates() {
            super("coords", "Coordinates", "Your position and the direction you face.", true, 0.01F, 0.14F);
        }

        @Override
        protected String text(Minecraft mc) {
            LocalPlayer p = mc.player;
            if (p == null) return "XYZ: -";
            Direction d = p.getDirection();
            return String.format(Locale.ROOT, "XYZ: %d %d %d  (%s)", (int) Math.floor(p.getX()), (int) Math.floor(p.getY()), (int) Math.floor(p.getZ()),
                d.getName().substring(0, 1).toUpperCase(Locale.ROOT));
        }
    }

    public static final class Ping extends TextModule {
        public Ping() {
            super("ping", "Ping", "Your latency to the server (singleplayer shows a dash).", false, 0.01F, 0.20F);
        }

        @Override
        protected String text(Minecraft mc) {
            if (mc.player == null || mc.getConnection() == null || mc.hasSingleplayerServer()) return "Ping: -";
            PlayerInfo info = mc.getConnection().getPlayerInfo(mc.player.getUUID());
            return info == null ? "Ping: -" : "Ping: " + info.getLatency() + " ms";
        }
    }

    public static final class Clock extends TextModule {
        private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("HH:mm:ss");

        public Clock() {
            super("clock", "Clock", "The real time on your computer.", false, 0.01F, 0.26F);
        }

        @Override
        protected String text(Minecraft mc) {
            return LocalTime.now().format(FORMAT);
        }
    }
}

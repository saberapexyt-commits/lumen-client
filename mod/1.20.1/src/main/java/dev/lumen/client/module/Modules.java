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

    public static final class Memory extends TextModule {
        public Memory() {
            super("memory", "Memory", "Java memory in use / available to the game.", false, 0.01F, 0.32F);
        }

        @Override
        public String category() {
            return "Info";
        }

        @Override
        protected String text(Minecraft mc) {
            Runtime rt = Runtime.getRuntime();
            long used = (rt.totalMemory() - rt.freeMemory()) >> 20;
            return "Mem: " + used + " / " + (rt.maxMemory() >> 20) + " MB";
        }
    }

    /** Horizontal speed in blocks per second, measured between client ticks. */
    public static final class Speed extends TextModule {
        private double lastX, lastZ;
        private long lastTime;
        private double bps;

        public Speed() {
            super("speed", "Speed", "How fast you are moving, in blocks per second.", false, 0.01F, 0.38F);
        }

        @Override
        public String category() {
            return "Info";
        }

        @Override
        protected String text(Minecraft mc) {
            LocalPlayer p = mc.player;
            if (p == null) return "Speed: -";
            long now = System.nanoTime();
            if (lastTime != 0 && now - lastTime > 50_000_000L) { // refresh about 20 times per second
                double dt = (now - lastTime) / 1.0e9;
                bps = Math.hypot(p.getX() - lastX, p.getZ() - lastZ) / dt;
                lastX = p.getX();
                lastZ = p.getZ();
                lastTime = now;
            } else if (lastTime == 0) {
                lastX = p.getX();
                lastZ = p.getZ();
                lastTime = now;
            }
            return String.format(Locale.ROOT, "Speed: %.1f b/s", bps);
        }
    }

    public static final class Day extends TextModule {
        public Day() {
            super("day", "Day Counter", "Which in-game day you are on.", false, 0.01F, 0.44F);
        }

        @Override
        public String category() {
            return "Info";
        }

        @Override
        protected String text(Minecraft mc) {
            return mc.level == null ? "Day -" : "Day " + (mc.level.getDayTime() / 24000L + 1);
        }
    }

    public static final class Food extends TextModule {
        public Food() {
            super("food", "Hunger", "Food level and saturation.", false, 0.01F, 0.50F);
        }

        @Override
        public String category() {
            return "Info";
        }

        @Override
        protected String text(Minecraft mc) {
            LocalPlayer p = mc.player;
            if (p == null) return "Food: -";
            return String.format(Locale.ROOT, "Food: %d  Sat: %.1f", p.getFoodData().getFoodLevel(), p.getFoodData().getSaturationLevel());
        }
    }

    public static final class Rotation extends TextModule {
        public Rotation() {
            super("rotation", "Rotation", "Which way you are looking (yaw and pitch).", false, 0.01F, 0.56F);
        }

        @Override
        public String category() {
            return "Info";
        }

        @Override
        protected String text(Minecraft mc) {
            LocalPlayer p = mc.player;
            if (p == null) return "Yaw/Pitch: -";
            float yaw = ((p.getYRot() % 360F) + 360F) % 360F;
            return String.format(Locale.ROOT, "Yaw %.0f  Pitch %.0f", yaw, p.getXRot());
        }
    }
}


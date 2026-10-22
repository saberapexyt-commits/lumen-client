package dev.lumen.client.module;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.projectile.FishingHook;
import net.minecraft.world.item.Items;

/** Convenience modules that act for the player. They only run where it is safe: in your own singleplayer worlds. */
public final class GameplayModules {
    private GameplayModules() {}

    /**
     * Reels the line in when a fish bites and casts again, so you can go AFK. Start fishing yourself (first cast);
     * Auto Fish takes over from there. It only runs in your own singleplayer worlds; see {@link SolarFish} for the one
     * server that allows it.
     */
    public static final class AutoFish extends LumenModule {
        private int recastIn = -1; // ticks until we cast again after reeling in, -1 = not waiting
        private int waited; // ticks spent waiting for the old line to disappear
        private int castAge;
        private int idle; // ticks with a rod in hand but no line out, after fishing was started
        private boolean armed; // set once you have cast yourself

        public AutoFish() {
            super("autofish", "Auto Fish", "Reels in on a bite and recasts so you can go AFK. Singleplayer only.", false, 0, 0);
            firstRun(s -> s.size = 2); // 0.4 s between reeling in and casting again
        }

        @Override
        public String category() {
            return "Gameplay";
        }

        /** Ticks to wait between reeling in and casting again. */
        public int recastTicks() {
            return Math.max(1, state().size) * 4;
        }

        private void reset() {
            recastIn = -1;
            waited = 0;
            castAge = 0;
            idle = 0;
            armed = false;
        }

        private void cast(Minecraft mc, InteractionHand hand) {
            mc.gameMode.useItem(mc.player, hand);
            // the swing animation takes extra arguments on 26.x, so Auto Fish skips it there
        }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null || mc.gameMode == null) {
                reset();
                return;
            }
            if (!enabled() || !mc.isLocalServer()) {
                reset();
                return;
            }
            InteractionHand hand = mc.player.getMainHandItem().is(Items.FISHING_ROD) ? InteractionHand.MAIN_HAND
                : mc.player.getOffhandItem().is(Items.FISHING_ROD) ? InteractionHand.OFF_HAND : null;
            if (hand == null) {
                reset();
                return;
            }
            FishingHook hook = mc.player.fishing;

            if (recastIn >= 0) { // we just reeled in: count down, then cast as soon as the old line is gone
                if (recastIn > 0) recastIn--;
                if (recastIn == 0 && hook == null) {
                    cast(mc, hand);
                    recastIn = -1;
                    waited = 0;
                    idle = 0;
                } else if (++waited > 80) { // the old line never went away: fall back to the normal checks
                    recastIn = -1;
                    waited = 0;
                }
                return;
            }

            if (hook != null) {
                armed = true;
                idle = 0;
                castAge++;
                // A bite pulls the bobber sharply down (the game sets its vertical speed to about -0.25 to -0.4).
                if (castAge > 20 && hook.getHookedIn() == null && hook.getDeltaMovement().y < -0.15) {
                    cast(mc, hand); // reel in
                    recastIn = recastTicks();
                    waited = 0;
                    castAge = 0;
                }
            } else {
                castAge = 0;
                if (armed && ++idle > 40) {
                    // the line was lost (hooked something, lag, a failed cast): throw it again after two seconds
                    cast(mc, hand);
                    idle = 0;
                }
            }
        }
    }

    /**
     * Auto Fish for Solar Skies only (play.solarskies.net), where AFK fishing is allowed. That server runs its own
     * fishing and shows a "Fish Bite! Reel in your fishing rod!" title instead of the normal bobber dip. This reads
     * that title and reels in with the same right click a player would make; the server recasts by itself. It does
     * nothing on any other server. If the server ever bans AFK fishing, delete this class.
     */
    public static final class SolarFish extends LumenModule {
        private static final String HOST = "solarskies.net";
        private static volatile boolean biteSignal;
        private int sinceAction = 100;
        private boolean told;

        public SolarFish() {
            super("autofish_solar", "Solar Fish", "Reels in on the server's Fish Bite message. Only works on play.solarskies.net.", false, 0, 0);
        }

        @Override
        public String category() {
            return "Gameplay";
        }

        /** True while you are connected to Solar Skies (play.solarskies.net or a subdomain). */
        public static boolean onSolarSkies(Minecraft mc) {
            var server = mc.getCurrentServer();
            if (server == null || server.ip == null) return false;
            String host = server.ip.toLowerCase(java.util.Locale.ROOT).trim();
            int colon = host.indexOf(':');
            if (colon >= 0) host = host.substring(0, colon);
            while (host.endsWith(".")) host = host.substring(0, host.length() - 1);
            return host.equals(HOST) || host.endsWith("." + HOST);
        }

        /** Called by the game's title / subtitle / action bar hooks with every message the server shows. */
        public static void onServerText(Component text) {
            if (text == null) return;
            String s = text.getString().toLowerCase(java.util.Locale.ROOT);
            if (s.contains("fish bite") || s.contains("reel in your fishing rod")) biteSignal = true;
        }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null || mc.gameMode == null || !enabled() || !onSolarSkies(mc)) {
                biteSignal = false;
                told = false;
                return;
            }
            if (!told) {
                told = true;
                mc.player.sendSystemMessage(Component.literal("[Lumen] Solar Skies Auto Fish is on."));
            }
            sinceAction++;
            if (!biteSignal) return;
            biteSignal = false;
            InteractionHand hand = mc.player.getMainHandItem().is(Items.FISHING_ROD) ? InteractionHand.MAIN_HAND
                : mc.player.getOffhandItem().is(Items.FISHING_ROD) ? InteractionHand.OFF_HAND : null;
            if (hand == null || sinceAction < 10) return; // no rod in hand, or the other half of the same message
            mc.gameMode.useItem(mc.player, hand);
            // the swing animation takes extra arguments on 26.x, so Auto Fish skips it there
            sinceAction = 0;
        }
    }
}

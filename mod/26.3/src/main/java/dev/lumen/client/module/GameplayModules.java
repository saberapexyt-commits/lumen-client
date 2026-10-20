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
     * Auto Fish takes over from there. On multiplayer servers it only runs if you switch "On servers" on, because many
     * servers do not allow automated fishing and can ban for it: check the server's rules first.
     */
    public static final class AutoFish extends LumenModule {
        private int cooldown = -1; // ticks until the next cast, -1 = nothing pending
        private int castAge;
        private int idle; // ticks with a rod in hand but no line out, after fishing was started
        private boolean armed; // set once you have cast yourself
        private boolean warned;

        public AutoFish() {
            super("autofish", "Auto Fish", "Reels in on a bite and recasts so you can go AFK. Singleplayer unless 'On servers' is on.", false, 0, 0);
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
            cooldown = -1;
            castAge = 0;
            idle = 0;
            armed = false;
        }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null || mc.gameMode == null) {
                warned = false;
                reset();
                return;
            }
            if (!enabled() || !(mc.isLocalServer() || state().extra)) {
                reset();
                return;
            }
            if (!mc.isLocalServer() && !warned) {
                warned = true;
                mc.player.sendSystemMessage(Component.literal("[Lumen] Auto Fish is on. Many servers ban automated fishing, so check the server rules."));
            }
            InteractionHand hand = mc.player.getMainHandItem().is(Items.FISHING_ROD) ? InteractionHand.MAIN_HAND
                : mc.player.getOffhandItem().is(Items.FISHING_ROD) ? InteractionHand.OFF_HAND : null;
            if (hand == null) {
                reset();
                return;
            }
            FishingHook hook = mc.player.fishing;
            if (hook != null) {
                armed = true;
                cooldown = -1;
                idle = 0;
                castAge++;
                // A bite pulls the bobber sharply down (the game sets its vertical speed to about -0.25 to -0.4).
                if (castAge > 20 && hook.getHookedIn() == null && hook.getDeltaMovement().y < -0.15) {
                    mc.gameMode.useItem(mc.player, hand);
                    // the swing animation takes extra arguments on 26.x, so Auto Fish skips it there
                    cooldown = recastTicks();
                    castAge = 0;
                }
            } else {
                castAge = 0;
                if (cooldown > 0) cooldown--;
                if (cooldown == 0) {
                    mc.gameMode.useItem(mc.player, hand);
                    // the swing animation takes extra arguments on 26.x, so Auto Fish skips it there
                    cooldown = -1;
                } else if (armed && cooldown < 0 && ++idle > 100) {
                    // the line was lost (hooked something, lag, a failed cast): throw it again after five seconds
                    mc.gameMode.useItem(mc.player, hand);
                    // the swing animation takes extra arguments on 26.x, so Auto Fish skips it there
                    idle = 0;
                }
            }
        }
    }
}

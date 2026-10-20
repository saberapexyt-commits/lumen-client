package dev.lumen.client.module;

import net.minecraft.client.Minecraft;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.projectile.FishingHook;
import net.minecraft.world.item.Items;

/** Convenience modules that act for the player. They only run where it is safe: in your own singleplayer worlds. */
public final class GameplayModules {
    private GameplayModules() {}

    /**
     * Reels the line in when a fish bites and casts again. Start fishing yourself (first cast); Auto Fish takes over
     * from there. It never runs on multiplayer servers: most servers do not allow automated fishing.
     */
    public static final class AutoFish extends LumenModule {
        private int cooldown = -1; // ticks until the next cast, -1 = nothing pending
        private int castAge;

        public AutoFish() {
            super("autofish", "Auto Fish", "Reels in when a fish bites and recasts. Singleplayer only.", false, 0, 0);
        }

        @Override
        public String category() {
            return "Gameplay";
        }

        /** Ticks to wait between reeling in and casting again. */
        public int recastTicks() {
            return Math.max(1, state().size) * 4;
        }

        @Override
        public void tick(Minecraft mc) {
            if (!enabled() || mc.player == null || mc.gameMode == null || !mc.isLocalServer() || mc.screen != null) {
                cooldown = -1;
                castAge = 0;
                return;
            }
            InteractionHand hand = mc.player.getMainHandItem().is(Items.FISHING_ROD) ? InteractionHand.MAIN_HAND
                : mc.player.getOffhandItem().is(Items.FISHING_ROD) ? InteractionHand.OFF_HAND : null;
            if (hand == null) {
                cooldown = -1;
                castAge = 0;
                return;
            }
            FishingHook hook = mc.player.fishing;
            if (hook != null) {
                cooldown = -1;
                castAge++;
                // A bite pulls the bobber sharply down (the game sets its vertical speed to about -0.25 to -0.4).
                if (castAge > 20 && hook.getHookedIn() == null && hook.getDeltaMovement().y < -0.15) {
                    mc.gameMode.useItem(mc.player, hand);
                    mc.player.swing(hand);
                    cooldown = recastTicks();
                    castAge = 0;
                }
            } else {
                castAge = 0;
                if (cooldown > 0) cooldown--;
                if (cooldown == 0) {
                    mc.gameMode.useItem(mc.player, hand);
                    mc.player.swing(hand);
                    cooldown = -1;
                }
            }
        }
    }
}

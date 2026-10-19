package dev.lumen.client.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lumen.client.module.ModuleManager;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.ScreenEffectRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ScreenEffectRenderer.class)
public class ScreenEffectMixin {
    private static boolean lumen$lowered;

    /** Move the first-person fire overlay down while it is drawn. */
    @Inject(method = "renderFire", at = @At("HEAD"))
    private static void lumen$fireIn(Minecraft mc, PoseStack pose, CallbackInfo ci) {
        lumen$lowered = ModuleManager.LOW_FIRE.enabled();
        if (lumen$lowered) {
            pose.pushPose();
            pose.translate(0.0F, -ModuleManager.LOW_FIRE.drop(), 0.0F);
        }
    }

    @Inject(method = "renderFire", at = @At("RETURN"))
    private static void lumen$fireOut(Minecraft mc, PoseStack pose, CallbackInfo ci) {
        if (lumen$lowered) {
            pose.popPose();
            lumen$lowered = false;
        }
    }
}

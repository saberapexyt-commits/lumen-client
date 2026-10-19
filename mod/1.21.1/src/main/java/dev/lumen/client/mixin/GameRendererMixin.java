package dev.lumen.client.mixin;

import dev.lumen.client.LumenClient;
import dev.lumen.client.module.BehaviourModules;
import dev.lumen.client.module.ModuleManager;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(GameRenderer.class)
public class GameRendererMixin {
    /** Smooth zoom: narrow the field of view while the zoom key is held. */
    @Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
    private void lumen$zoom(Camera camera, float partialTick, boolean useFovSetting, CallbackInfoReturnable<Double> cir) {
        boolean zooming = ModuleManager.ZOOM.enabled() && LumenClient.zoomKey != null && LumenClient.zoomKey.isDown()
            && Minecraft.getInstance().screen == null;
        BehaviourModules.Zoom.progress += ((zooming ? 1.0F : 0.0F) - BehaviourModules.Zoom.progress) * 0.25F;
        if (BehaviourModules.Zoom.progress > 0.001F) {
            cir.setReturnValue(cir.getReturnValue() * (1.0 - (1.0 - BehaviourModules.Zoom.factor) * BehaviourModules.Zoom.progress));
        }
    }
}

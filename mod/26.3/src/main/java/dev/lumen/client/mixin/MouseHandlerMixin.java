package dev.lumen.client.mixin;

import dev.lumen.client.LumenClient;
import dev.lumen.client.module.BehaviourModules;
import dev.lumen.client.module.CpsTracker;
import dev.lumen.client.module.ModuleManager;
import net.minecraft.client.Minecraft;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.input.MouseButtonInfo;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
public class MouseHandlerMixin {
    /** Feeds the CPS counter: action 1 = button pressed. */
    @Inject(method = "onButton", at = @At("HEAD"))
    private void lumen$countClick(long window, MouseButtonInfo info, int action, CallbackInfo ci) {
        if (action == 1) CpsTracker.click(info.button());
    }

    /** While the zoom key is held the wheel zooms in and out instead of scrolling the hotbar. */
    @Inject(method = "onScroll", at = @At("HEAD"), cancellable = true)
    private void lumen$zoomScroll(long window, double xOffset, double yOffset, CallbackInfo ci) {
        boolean down = LumenClient.zoomKey != null && LumenClient.zoomKey.isDown();
        if (BehaviourModules.Zoom.onScroll(yOffset, down, ModuleManager.ZOOM.enabled(), Minecraft.getInstance().gui.screen() == null)) ci.cancel();
    }
}

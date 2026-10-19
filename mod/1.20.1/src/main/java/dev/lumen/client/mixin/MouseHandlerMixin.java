package dev.lumen.client.mixin;

import dev.lumen.client.module.CpsTracker;
import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
public class MouseHandlerMixin {
    /** Feeds the CPS counter: action 1 = button pressed. */
    @Inject(method = "onPress", at = @At("HEAD"))
    private void lumen$countClick(long window, int button, int action, int modifiers, CallbackInfo ci) {
        if (action == 1) CpsTracker.click(button);
    }
}

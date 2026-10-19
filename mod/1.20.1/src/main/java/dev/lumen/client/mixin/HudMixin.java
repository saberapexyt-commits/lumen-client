package dev.lumen.client.mixin;

import dev.lumen.client.module.ModuleManager;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.ResourceLocation;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Gui.class)
public class HudMixin {
    /** Draw the Lumen crosshair instead of the vanilla one. */
    @Inject(method = "renderCrosshair", at = @At("HEAD"), cancellable = true)
    private void lumen$crosshair(GuiGraphics g, CallbackInfo ci) {
        if (ModuleManager.CROSSHAIR.enabled()) {
            ModuleManager.CROSSHAIR.draw(g, g.guiWidth(), g.guiHeight());
            ci.cancel();
        }
    }

    /** Replace the hotbar background and selection pieces of the widgets texture with the flat Lumen style. */
    @Redirect(method = "renderHotbar", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphics;blit(Lnet/minecraft/resources/ResourceLocation;IIIIII)V"))
    private void lumen$hotbar(GuiGraphics g, ResourceLocation tex, int x, int y, int u, int v, int w, int h) {
        if (ModuleManager.HOTBAR.enabled() && u == 0) {
            if (v == 0 && w == 182 && h == 22) {
                ModuleManager.HOTBAR.bar(g, x, y, w, h);
                return;
            }
            if (v == 22 && w == 24 && h == 22) {
                ModuleManager.HOTBAR.selection(g, x, y);
                return;
            }
        }
        g.blit(tex, x, y, u, v, w, h);
    }
}

package dev.lumen.client.mixin;

import com.mojang.renderpearl.api.pipeline.RenderPipeline;
import dev.lumen.client.module.ModuleManager;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.Hud;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Hud.class)
public class HudMixin {
    /** Draw the Lumen crosshair instead of the vanilla one. */
    @Inject(method = "extractCrosshair", at = @At("HEAD"), cancellable = true)
    private void lumen$crosshair(GuiGraphicsExtractor g, DeltaTracker delta, CallbackInfo ci) {
        if (ModuleManager.CROSSHAIR.enabled()) {
            ModuleManager.CROSSHAIR.draw(g, g.guiWidth(), g.guiHeight());
            ci.cancel();
        }
    }

    /** Replace the hotbar background and selection sprites with the flat Lumen style. */
    @Redirect(method = "extractItemHotbar", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;blitSprite(Lcom/mojang/renderpearl/api/pipeline/RenderPipeline;Lnet/minecraft/resources/Identifier;IIII)V"))
    private void lumen$hotbar(GuiGraphicsExtractor g, RenderPipeline pipeline, Identifier id, int x, int y, int w, int h) {
        if (ModuleManager.HOTBAR.enabled()) {
            String p = id.getPath();
            if (p.equals("hud/hotbar")) {
                ModuleManager.HOTBAR.bar(g, x, y, w, h);
                return;
            }
            if (p.equals("hud/hotbar_selection")) {
                ModuleManager.HOTBAR.selection(g, x, y);
                return;
            }
        }
        g.blitSprite(pipeline, id, x, y, w, h);
    }
}

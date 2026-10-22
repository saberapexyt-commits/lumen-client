package dev.lumen.client.mixin;

import dev.lumen.client.module.GameplayModules;
import dev.lumen.client.module.ModuleManager;
import net.minecraft.network.chat.Component;
import net.minecraft.client.DeltaTracker;
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
    private void lumen$crosshair(GuiGraphics g, DeltaTracker delta, CallbackInfo ci) {
        if (ModuleManager.CROSSHAIR.enabled()) {
            ModuleManager.CROSSHAIR.draw(g, g.guiWidth(), g.guiHeight());
            ci.cancel();
        }
    }

    /** Replace the hotbar background and selection sprites with the flat Lumen style. */
    @Redirect(method = "renderItemHotbar", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphics;blitSprite(Lnet/minecraft/resources/ResourceLocation;IIII)V"))
    private void lumen$hotbar(GuiGraphics g, ResourceLocation id, int x, int y, int w, int h) {
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
        g.blitSprite(id, x, y, w, h);
    }

    /** Lets Solar Skies Auto Fish see the server's Fish Bite title / subtitle / action bar text. */
    @Inject(method = "setTitle", at = @At("HEAD"))
    private void lumen$title(Component text, CallbackInfo ci) {
        GameplayModules.SolarFish.onServerText(text);
    }

    @Inject(method = "setSubtitle", at = @At("HEAD"))
    private void lumen$subtitle(Component text, CallbackInfo ci) {
        GameplayModules.SolarFish.onServerText(text);
    }

    @Inject(method = "setOverlayMessage", at = @At("HEAD"))
    private void lumen$overlay(Component text, boolean animate, CallbackInfo ci) {
        GameplayModules.SolarFish.onServerText(text);
    }
}

package dev.lumen.client.mixin;

import dev.lumen.client.LumenConfig;
import dev.lumen.client.LumenTitleScreen;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(Minecraft.class)
public class MinecraftMixin {
    /** Swap the vanilla title screen for the Lumen main menu (exact-class check so the swap never loops). */
    @ModifyVariable(method = "setScreen", at = @At("HEAD"), argsOnly = true)
    private Screen lumen$swapTitleScreen(Screen screen) {
        if (screen != null && screen.getClass() == TitleScreen.class && LumenConfig.get().customMenu) {
            return new LumenTitleScreen();
        }
        return screen;
    }
}

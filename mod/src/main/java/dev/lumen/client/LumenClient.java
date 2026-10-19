package dev.lumen.client;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class LumenClient implements ClientModInitializer {
    public static final String MOD_ID = "lumen";
    public static final Logger LOGGER = LoggerFactory.getLogger("LumenClient");

    private static KeyMapping settingsKey;
    private static boolean debugOpened;

    @Override
    public void onInitializeClient() {
        LumenConfig.get();
        settingsKey = KeyBindingHelper.registerKeyBinding(
            new KeyMapping("key.lumen.settings", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT, "key.categories.lumen"));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (settingsKey.consumeClick()) {
                // Do not stack the settings screen on itself.
                if (!(client.screen instanceof LumenSettingsScreen)) client.setScreen(new LumenSettingsScreen(client.screen));
            }
            // Test hook: -Dlumen.open=settings opens the settings screen once the main menu is up.
            if (!debugOpened && "settings".equals(System.getProperty("lumen.open")) && client.screen != null
                && (client.screen instanceof LumenTitleScreen || client.screen instanceof TitleScreen) && client.getOverlay() == null) {
                debugOpened = true;
                client.setScreen(new LumenSettingsScreen(client.screen));
            }
        });

        // A "Lumen" shortcut on the pause menu, and on the vanilla title screen when the custom menu is switched off.
        ScreenEvents.AFTER_INIT.register((client, screen, w, h) -> {
            if (screen instanceof PauseScreen || screen instanceof TitleScreen) {
                Screens.getButtons(screen).add(
                    Button.builder(Component.literal("Lumen"), b -> client.setScreen(new LumenSettingsScreen(screen)))
                        .bounds(6, 6, 56, 20).build());
            }
        });
        LOGGER.info("Lumen Client loaded");
    }
}

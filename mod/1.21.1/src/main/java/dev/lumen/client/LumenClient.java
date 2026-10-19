package dev.lumen.client;

import com.mojang.blaze3d.platform.InputConstants;
import dev.lumen.client.module.ModuleManager;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
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

    /** The mod build shown on the main menu, so it is easy to tell which build is installed. */
    public static String VERSION = "?";

    public static KeyMapping settingsKey;
    public static KeyMapping zoomKey;
    private static String debugStage = "";
    private static int worldTicks;

    @Override
    public void onInitializeClient() {
        VERSION = net.fabricmc.loader.api.FabricLoader.getInstance().getModContainer("lumen_client").map(c -> c.getMetadata().getVersion().getFriendlyString()).orElse("?");
        LumenConfig.get();
        settingsKey = KeyBindingHelper.registerKeyBinding(
            new KeyMapping("key.lumen.settings", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT, "key.categories.lumen"));
        zoomKey = KeyBindingHelper.registerKeyBinding(
            new KeyMapping("key.lumen.zoom", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_C, "key.categories.lumen"));

        HudRenderCallback.EVENT.register((g, delta) -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.options.hideGui || mc.screen instanceof HudEditorScreen) return;
            ModuleManager.renderHud(g, mc);
        });

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (settingsKey.consumeClick()) {
                // Do not stack the menu on itself.
                if (!(client.screen instanceof LumenSettingsScreen)) client.setScreen(new LumenSettingsScreen(client.screen));
            }
            ModuleManager.tick(client);
            debugHooks(client);
        });

        ClientLifecycleEvents.CLIENT_STOPPING.register(ModuleManager::shutdown);

        // A "Lumen" shortcut on the pause menu, and on the vanilla title screen when the custom menu is switched off.
        ScreenEvents.AFTER_INIT.register((client, screen, w, h) -> {
            if (screen instanceof PauseScreen || screen instanceof TitleScreen) {
                Screens.getButtons(screen).add(
                    UiButton.of(Component.literal("Lumen"), b -> client.setScreen(new LumenSettingsScreen(screen)), 6, 6, 56, 20));
            }
        });
        LOGGER.info("Lumen Client loaded");
    }

    /** Test hooks driven by -Dlumen.open=settings|editor|world (used by the launcher's automated checks). */
    private static void debugHooks(Minecraft mc) {
        String want = System.getProperty("lumen.open", "");
        if (want.isEmpty() || mc.getOverlay() != null) return;
        if (want.equals("settings") && debugStage.isEmpty() && mc.screen != null && !(mc.screen instanceof LumenSettingsScreen)) {
            debugStage = "done";
            mc.setScreen(new LumenSettingsScreen(mc.screen));
        } else if (want.equals("world") || want.equals("editor")) {
            if (mc.level == null && debugStage.isEmpty() && mc.screen != null) {
                debugStage = "creating";
                DebugWorld.create(mc);
            } else if (mc.level != null && mc.player != null) {
                if (++worldTicks == 120 && want.equals("editor")) mc.setScreen(new HudEditorScreen(null));
            }
        }
    }
}

package dev.lumen.client;

import com.mojang.blaze3d.platform.InputConstants;
import dev.lumen.client.module.ModuleManager;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class LumenClient implements ClientModInitializer {
    public static final String MOD_ID = "lumen";
    public static final Logger LOGGER = LoggerFactory.getLogger("LumenClient");

    public static KeyMapping settingsKey;
    public static KeyMapping zoomKey;
    private static String debugStage = "";
    private static int worldTicks;

    @Override
    public void onInitializeClient() {
        LumenConfig.get();
        KeyMapping.Category category = KeyMapping.Category.register(Identifier.fromNamespaceAndPath(MOD_ID, "lumen"));
        settingsKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.lumen.settings", InputConstants.Type.KEYBOARD, InputConstants.KEY_RSHIFT, category));
        zoomKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.lumen.zoom", InputConstants.Type.KEYBOARD, InputConstants.KEY_C, category));

        HudElementRegistry.addLast(Identifier.fromNamespaceAndPath(MOD_ID, "hud"), (g, delta) -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.gui.screen() instanceof HudEditorScreen) return;
            ModuleManager.renderHud(g, mc);
        });

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (settingsKey.consumeClick()) {
                // Do not stack the menu on itself.
                if (!(client.gui.screen() instanceof LumenSettingsScreen)) client.setScreenAndShow(new LumenSettingsScreen(client.gui.screen()));
            }
            ModuleManager.tick(client);
            debugHooks(client);
        });

        // A "Lumen" shortcut on the pause menu, and on the vanilla title screen when the custom menu is switched off.
        ScreenEvents.AFTER_INIT.register((client, screen, w, h) -> {
            if (screen instanceof PauseScreen || screen instanceof TitleScreen) {
                Screens.getWidgets(screen).add(
                    Button.builder(Component.literal("Lumen"), b -> client.setScreenAndShow(new LumenSettingsScreen(screen)))
                        .bounds(6, 6, 56, 20).build());
            }
        });
        LOGGER.info("Lumen Client loaded");
    }

    /** Test hooks driven by -Dlumen.open=settings|editor|world (used by the launcher's automated checks). */
    private static void debugHooks(Minecraft mc) {
        String want = System.getProperty("lumen.open", "");
        if (want.isEmpty() || mc.gui.overlay() != null) return;
        var screen = mc.gui.screen();
        if (want.equals("settings") && debugStage.isEmpty() && screen != null && !(screen instanceof LumenSettingsScreen)) {
            debugStage = "done";
            mc.setScreenAndShow(new LumenSettingsScreen(screen));
        } else if (want.equals("world") || want.equals("editor")) {
            if (mc.level == null && debugStage.isEmpty() && screen != null) {
                debugStage = "creating";
                DebugWorld.create(mc);
            } else if (mc.level != null && mc.player != null) {
                if (++worldTicks == 120 && want.equals("editor")) mc.setScreenAndShow(new HudEditorScreen(null));
            }
        }
    }
}

package dev.lumen.client;

import net.minecraft.client.OptionInstance;
import net.minecraft.client.Options;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * Lumen settings: quick access to the video options people change most (they edit the real game options,
 * so they stay in sync with Options > Video Settings) plus Lumen's own switches.
 */
public class LumenSettingsScreen extends Screen {
    private final Screen parent;

    public LumenSettingsScreen(Screen parent) {
        super(Component.literal("Lumen Settings"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        Options o = minecraft.options;
        int colW = 200, gap = 8;
        int left = this.width / 2 - colW - gap / 2;
        int right = this.width / 2 + gap / 2;
        int y = 56;
        int step = 24;

        addOption(o.fov(), left, y, colW);
        addOption(o.renderDistance(), right, y, colW);
        y += step;
        addOption(o.framerateLimit(), left, y, colW);
        addOption(o.enableVsync(), right, y, colW);
        y += step;
        addOption(o.gamma(), left, y, colW);
        addOption(o.guiScale(), right, y, colW);
        y += step + 18;

        LumenConfig cfg = LumenConfig.get();
        addRenderableWidget(toggle("Custom main menu", cfg.customMenu, left, y, colW, v -> cfg.customMenu = v));
        addRenderableWidget(toggle("Quick-join servers", cfg.quickJoin, right, y, colW, v -> cfg.quickJoin = v));
        y += step;

        addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose())
            .bounds(this.width / 2 - 100, Math.max(y + 20, this.height - 40), 200, 20).build());
    }

    private void addOption(OptionInstance<?> option, int x, int y, int w) {
        AbstractWidget widget = option.createButton(minecraft.options, x, y, w);
        addRenderableWidget(widget);
    }

    private Button toggle(String label, boolean value, int x, int y, int w, java.util.function.Consumer<Boolean> set) {
        return Button.builder(text(label, value), new Button.OnPress() {
            boolean state = value;
            @Override
            public void onPress(Button b) {
                state = !state;
                set.accept(state);
                b.setMessage(text(label, state));
            }
        }).bounds(x, y, w, 20).build();
    }

    private static Component text(String label, boolean on) {
        return Component.literal(label + ": " + (on ? "ON" : "OFF"));
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        g.drawCenteredString(this.font, this.title, this.width / 2, 20, 0xFF3DB8FF);
        g.drawCenteredString(this.font, Component.literal("Video options here are the same ones as in Options > Video Settings"), this.width / 2, 34, 0xFF8D93A8);
        g.drawCenteredString(this.font, Component.literal("Lumen"), this.width / 2, 56 + 24 * 3 + 4, 0xFF8D93A8);
    }

    @Override
    public void onClose() {
        minecraft.options.save();
        LumenConfig.get().save();
        minecraft.setScreen(parent);
    }
}

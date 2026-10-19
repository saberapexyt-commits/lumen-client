package dev.lumen.client;

import dev.lumen.client.module.LumenModule;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractSliderButton;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Per-module options: size, background, colour, position reset. */
public class ModuleOptionsScreen extends Screen {
    private final Screen parent;
    private final LumenModule module;

    public ModuleOptionsScreen(Screen parent, LumenModule module) {
        super(Component.literal(module.name));
        this.parent = parent;
        this.module = module;
    }

    @Override
    protected void init() {
        int w = 200, x = this.width / 2 - w / 2, y = this.height / 2 - 72;
        addRenderableWidget(new ScaleSlider(x, y, w, module));
        y += 24;
        addRenderableWidget(UiButton.of(bgText(), b -> {
            module.state().background = !module.state().background;
            b.setMessage(bgText());
        }, x, y, w, 20));
        y += 24;
        addRenderableWidget(UiButton.of(colorText(), b -> {
            module.state().color = (module.state().color + 1) % LumenModule.COLORS.length;
            b.setMessage(colorText());
        }, x, y, w, 20));
        y += 24;
        addRenderableWidget(UiButton.of(shadowText(), b -> {
            module.state().shadow = !module.state().shadow;
            b.setMessage(shadowText());
        }, x, y, w, 20));
        y += 24;
        addRenderableWidget(UiButton.of(Component.literal("Reset position and size"), b -> {
            module.resetPosition();
            minecraft.setScreen(new ModuleOptionsScreen(parent, module));
        }, x, y, w, 20));
        y += 34;
        addRenderableWidget(UiButton.of(Component.literal("Done"), b -> onClose(), x, y, w, 20));
    }

    private Component bgText() {
        return Component.literal("Background: " + (module.state().background ? "ON" : "OFF"));
    }

    private Component shadowText() {
        return Component.literal("Text shadow: " + (module.state().shadow ? "ON" : "OFF"));
    }

    private Component colorText() {
        return Component.literal("Colour: " + LumenModule.COLOR_NAMES[Math.floorMod(module.state().color, LumenModule.COLORS.length)]);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        UiButton.background(g, minecraft, this.width, this.height);
        super.render(g, mouseX, mouseY, partialTick);
        g.drawCenteredString(this.font, Component.literal(module.name), this.width / 2, this.height / 2 - 104, 0xFF3DB8FF);
        g.drawCenteredString(this.font, Component.literal("Drag it into place with Edit HUD Layout"), this.width / 2, this.height / 2 - 92, 0xFF8D93A8);
    }

    @Override
    public void onClose() {
        LumenConfig.get().save();
        minecraft.setScreen(parent);
    }

    private static final class ScaleSlider extends AbstractSliderButton {
        private final LumenModule module;

        ScaleSlider(int x, int y, int w, LumenModule module) {
            super(x, y, w, 20, Component.empty(), (module.state().scale - 0.5) / 1.5);
            this.module = module;
            updateMessage();
        }

        @Override
        public void renderWidget(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
            boolean hot = this.isHoveredOrFocused();
            int x = getX(), y = getY(), w = getWidth(), h = getHeight();
            g.fill(x, y, x + w, y + h, hot ? 0xFF3DB8FF : 0xFF343E4E);
            g.fill(x + 1, y + 1, x + w - 1, y + h - 1, 0xE010151E);
            int hx = x + 1 + (int) (this.value * (w - 10));
            g.fill(hx, y + 1, hx + 8, y + h - 1, hot ? 0xFF3DB8FF : 0xFF788CA5);
            net.minecraft.client.Minecraft mc = net.minecraft.client.Minecraft.getInstance();
            g.drawCenteredString(mc.font, getMessage(), x + w / 2, y + (h - mc.font.lineHeight) / 2, 0xFFFFFFFF);
        }

        @Override
        protected void updateMessage() {
            setMessage(Component.literal("Size: " + Math.round(module.state().scale * 100) + "%"));
        }

        @Override
        protected void applyValue() {
            module.state().scale = (float) (Math.round((0.5 + this.value * 1.5) / 0.05) * 0.05);
            updateMessage();
        }
    }
}

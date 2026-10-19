package dev.lumen.client;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.CharacterEvent;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

/** The Lumen menu (Right Shift): draggable panels of modules. All logic lives in {@link ClickGuiModel}. */
public class LumenSettingsScreen extends Screen {
    private final Screen parent;
    private ClickGuiModel model;

    public LumenSettingsScreen(Screen parent) {
        super(Component.literal("Lumen"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        if (model == null) model = new ClickGuiModel();
        model.layout(this.width, this.height);
    }

    private static ClickGuiModel.Painter painter(GuiGraphicsExtractor g, Font font) {
        return new ClickGuiModel.Painter() {
            @Override
            public void fill(int x1, int y1, int x2, int y2, int argb) {
                g.fill(x1, y1, x2, y2, argb);
            }

            @Override
            public void text(String s, int x, int y, int argb) {
                g.text(font, s, x, y, argb, true);
            }

            @Override
            public int width(String s) {
                return font.width(s);
            }

            @Override
            public int lineHeight() {
                return font.lineHeight;
            }
        };
    }

    /** Everything is drawn by the model, so skip Minecraft's own (resource-pack-styled) menu background. */
    @Override
    public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {}

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        if (minecraft.level == null) UiButton.background(g, minecraft, this.width, this.height);
        model.render(painter(g, this.font), mouseX, mouseY, System.currentTimeMillis());
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        switch (model.mouseClicked(event.x(), event.y(), event.button())) {
            case HUD_EDITOR -> minecraft.setScreenAndShow(new HudEditorScreen(this));
            case CLOSE -> onClose();
            default -> { }
        }
        return true;
    }

    @Override
    public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
        model.mouseDragged(event.x(), event.y());
        return true;
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        model.mouseReleased();
        return true;
    }

    @Override
    public boolean mouseScrolled(double mx, double my, double scrollX, double scrollY) {
        model.mouseScrolled(mx, my, scrollY);
        return true;
    }

    @Override
    public boolean charTyped(CharacterEvent event) {
        if (event.codepoint() < 0x10000) model.charTyped((char) event.codepoint());
        return true;
    }

    @Override
    public boolean keyPressed(KeyEvent event) {
        if (event.key() == 259) { // backspace
            model.backspace();
            return true;
        }
        if (event.key() == 256 && model.hasSearch()) { // escape clears the search first
            model.clearSearch();
            return true;
        }
        return super.keyPressed(event);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    @Override
    public void onClose() {
        LumenConfig.get().save();
        minecraft.setScreenAndShow(parent);
    }
}

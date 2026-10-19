package dev.lumen.client;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
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

    private static ClickGuiModel.Painter painter(GuiGraphics g, Font font) {
        return new ClickGuiModel.Painter() {
            @Override
            public void fill(int x1, int y1, int x2, int y2, int argb) {
                g.fill(x1, y1, x2, y2, argb);
            }

            @Override
            public void text(String s, int x, int y, int argb) {
                g.drawString(font, s, x, y, argb, true);
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

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        if (minecraft.level == null) UiButton.background(g, minecraft, this.width, this.height);
        model.render(painter(g, this.font), mouseX, mouseY, System.currentTimeMillis());
    }

    @Override
    public boolean mouseClicked(double mx, double my, int button) {
        switch (model.mouseClicked(mx, my, button)) {
            case HUD_EDITOR -> minecraft.setScreen(new HudEditorScreen(this));
            case CLOSE -> onClose();
            default -> { }
        }
        return true;
    }

    @Override
    public boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
        model.mouseDragged(mx, my);
        return true;
    }

    @Override
    public boolean mouseReleased(double mx, double my, int button) {
        model.mouseReleased();
        return true;
    }

    @Override
    public boolean mouseScrolled(double mx, double my, double scrollY) {
        model.mouseScrolled(mx, my, scrollY);
        return true;
    }

    @Override
    public boolean charTyped(char c, int modifiers) {
        model.charTyped(c);
        return true;
    }

    @Override
    public boolean keyPressed(int key, int scan, int modifiers) {
        if (key == 259) { // backspace
            model.backspace();
            return true;
        }
        if (key == 256 && model.hasSearch()) { // escape clears the search first
            model.clearSearch();
            return true;
        }
        return super.keyPressed(key, scan, modifiers);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    @Override
    public void onClose() {
        LumenConfig.get().save();
        minecraft.setScreen(parent);
    }
}

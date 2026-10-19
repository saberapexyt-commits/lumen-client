package dev.lumen.client.module;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/** A small HUD box showing one line of text (FPS, CPS, coordinates, ...). */
public abstract class TextModule extends LumenModule {
    private static final int PAD = 3;

    protected TextModule(String id, String name, String description, boolean defaultEnabled, float x, float y) {
        super(id, name, description, defaultEnabled, x, y);
    }

    /** The text to show right now. */
    protected abstract String text(Minecraft mc);

    @Override
    public boolean isHud() {
        return true;
    }

    @Override
    public int width(Minecraft mc) {
        return mc.font.width(text(mc)) + PAD * 2;
    }

    @Override
    public int height(Minecraft mc) {
        return mc.font.lineHeight + PAD * 2 - 1;
    }

    @Override
    public void render(GuiGraphicsExtractor g, Minecraft mc) {
        if (state().background) g.fill(0, 0, width(mc), height(mc), 0x90000000);
        g.text(mc.font, text(mc), PAD, PAD, color(), true);
    }
}

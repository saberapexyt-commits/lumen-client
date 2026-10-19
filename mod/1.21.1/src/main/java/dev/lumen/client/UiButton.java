package dev.lumen.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

/**
 * Lumen-styled button. Minecraft 1.20.1 draws buttons from one shared texture atlas that cannot be
 * restyled without replacing Mojang's textures, so Lumen's own screens paint their buttons directly.
 */
public final class UiButton extends Button {
    private UiButton(int x, int y, int w, int h, Component msg, OnPress onPress) {
        super(x, y, w, h, msg, onPress, DEFAULT_NARRATION);
    }

    public static UiButton of(Component msg, OnPress onPress, int x, int y, int w, int h) {
        return new UiButton(x, y, w, h, msg, onPress);
    }

    /** Dark menu background (translucent over a world, opaque on the main menu). */
    public static void background(GuiGraphics g, Minecraft mc, int w, int h) {
        int a = mc.level != null ? 0xC0000000 : 0xFF000000;
        g.fillGradient(0, 0, w, h, a | 0x0B0D11, a | 0x131923);
    }

    @Override
    public void renderWidget(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        boolean hot = this.isHoveredOrFocused() && this.active;
        int x = getX(), y = getY(), w = getWidth(), h = getHeight();
        g.fill(x, y, x + w, y + h, hot ? 0xFF3DB8FF : (this.active ? 0xFF343E4E : 0xFF242A36));
        g.fill(x + 1, y + 1, x + w - 1, y + h - 1, hot ? 0xF2182C42 : (this.active ? 0xE010151E : 0x8C0E1117));
        g.fill(x + 1, y + h - 3, x + w - 1, y + h - 1, 0xB3060910);
        Minecraft mc = Minecraft.getInstance();
        int color = this.active ? 0xFFFFFFFF : 0xFF7C8494;
        g.drawCenteredString(mc.font, getMessage(), x + w / 2, y + (h - mc.font.lineHeight) / 2, color);
    }
}

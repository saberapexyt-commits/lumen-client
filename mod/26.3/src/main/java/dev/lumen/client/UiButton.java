package dev.lumen.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

/**
 * Lumen-styled button. It paints itself instead of using Minecraft's button sprites, so a player's own
 * resource pack can never restyle Lumen's screens.
 */
public final class UiButton extends AbstractWidget {
    public interface Press {
        void press(UiButton button);
    }

    private final Press press;

    private UiButton(int x, int y, int w, int h, Component msg, Press press) {
        super(x, y, w, h, msg);
        this.press = press;
    }

    public static UiButton of(Component msg, Press press, int x, int y, int w, int h) {
        return new UiButton(x, y, w, h, msg, press);
    }

    /** Dark menu background (translucent over a world, opaque on the main menu). */
    public static void background(GuiGraphicsExtractor g, Minecraft mc, int w, int h) {
        int a = mc.level != null ? 0xC0000000 : 0xFF000000;
        g.fillGradient(0, 0, w, h, a | 0x0B0D11, a | 0x131923);
    }

    @Override
    public void onClick(MouseButtonEvent event, boolean doubleClick) {
        press.press(this);
    }

    @Override
    protected void extractWidgetRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        boolean hot = this.isHoveredOrFocused() && this.active;
        int x = getX(), y = getY(), w = getWidth(), h = getHeight();
        g.fill(x, y, x + w, y + h, hot ? 0xFF3DB8FF : (this.active ? 0xFF343E4E : 0xFF242A36));
        g.fill(x + 1, y + 1, x + w - 1, y + h - 1, hot ? 0xF2182C42 : (this.active ? 0xE010151E : 0x8C0E1117));
        g.fill(x + 1, y + h - 3, x + w - 1, y + h - 1, 0xB3060910);
        Minecraft mc = Minecraft.getInstance();
        g.centeredText(mc.font, getMessage(), x + w / 2, y + (h - mc.font.lineHeight) / 2, this.active ? 0xFFFFFFFF : 0xFF7C8494);
    }

    @Override
    protected void updateWidgetNarration(NarrationElementOutput output) {
        defaultButtonNarrationText(output);
    }
}

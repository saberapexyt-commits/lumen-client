package dev.lumen.client.module;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/** WASD, space and mouse buttons, lit up while pressed. */
public final class KeystrokesModule extends LumenModule {
    private static final int K = 20, GAP = 2;

    public KeystrokesModule() {
        super("keystrokes", "Keystrokes", "Shows which movement keys and mouse buttons you are pressing.", false, 0.01F, 0.60F);
    }

    @Override
    public boolean isHud() {
        return true;
    }

    @Override
    public int width(Minecraft mc) {
        return K * 3 + GAP * 2;
    }

    @Override
    public int height(Minecraft mc) {
        return K * 2 + GAP + GAP + 14 + GAP + K;
    }

    @Override
    public void render(GuiGraphicsExtractor g, Minecraft mc) {
        var o = mc.options;
        key(g, mc, "W", o.keyUp, K + GAP, 0, K, K);
        key(g, mc, "A", o.keyLeft, 0, K + GAP, K, K);
        key(g, mc, "S", o.keyDown, K + GAP, K + GAP, K, K);
        key(g, mc, "D", o.keyRight, (K + GAP) * 2, K + GAP, K, K);
        int y = (K + GAP) * 2;
        key(g, mc, "SPACE", o.keyJump, 0, y, width(mc), 14);
        y += 14 + GAP;
        int half = (width(mc) - GAP) / 2;
        key(g, mc, "L " + CpsTracker.left(), o.keyAttack, 0, y, half, K);
        key(g, mc, "R " + CpsTracker.right(), o.keyUse, half + GAP, y, half, K);
    }

    private void key(GuiGraphicsExtractor g, Minecraft mc, String label, KeyMapping map, int x, int y, int w, int h) {
        boolean down = map.isDown();
        g.fill(x, y, x + w, y + h, down ? 0xC03DB8FF : (state().background ? 0x90000000 : 0x40000000));
        int tw = mc.font.width(label);
        g.text(mc.font, label, x + (w - tw) / 2, y + (h - mc.font.lineHeight) / 2 + 1, down ? 0xFF04202E : color(), !down);
    }
}

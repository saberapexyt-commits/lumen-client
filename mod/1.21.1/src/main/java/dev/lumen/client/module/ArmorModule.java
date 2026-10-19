package dev.lumen.client.module;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.item.ItemStack;

/** Helmet to boots with remaining durability. */
public final class ArmorModule extends LumenModule {
    private static final int ROW = 18;

    public ArmorModule() {
        super("armor", "Armor Status", "Shows your worn armor and its durability.", false, 0.90F, 0.40F);
    }

    @Override
    public boolean isHud() {
        return true;
    }

    @Override
    public int width(Minecraft mc) {
        return 60;
    }

    @Override
    public int height(Minecraft mc) {
        return ROW * 4 + 2;
    }

    @Override
    public void render(GuiGraphics g, Minecraft mc) {
        if (state().background) g.fill(0, 0, width(mc), height(mc), 0x90000000);
        if (mc.player == null) return;
        for (int i = 0; i < 4; i++) {
            ItemStack stack = mc.player.getInventory().armor.get(3 - i); // helmet first
            int y = 1 + i * ROW;
            if (stack.isEmpty()) continue;
            g.renderItem(stack, 1, y);
            if (stack.isDamageableItem()) {
                String left = String.valueOf(stack.getMaxDamage() - stack.getDamageValue());
                g.drawString(mc.font, left, 22, y + 5, color(), true);
            }
        }
    }
}

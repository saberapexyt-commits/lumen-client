package dev.lumen.client.module;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

/** Helmet to boots with remaining durability. */
public final class ArmorModule extends LumenModule {
    private static final int ROW = 18;
    private static final EquipmentSlot[] SLOTS = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};

    public ArmorModule() {
        super("armor", "Armor Status", "Shows your worn armor and its durability.", false, 0.90F, 0.40F);
    }

    /** No box: the armor sits straight on the world. */
    @Override
    public boolean supportsBackground() {
        return false;
    }

    /** Green when healthy, through yellow and orange to red as the armor wears down. A chosen colour (not White) overrides this. */
    private int numberColor(float fraction) {
        if (state().color != 0) return color();
        if (fraction > 0.6F) return 0xFF55FF55;
        if (fraction > 0.3F) return 0xFFFFFF55;
        if (fraction > 0.15F) return 0xFFFFAA00;
        return 0xFFFF5555;
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
    public void render(GuiGraphicsExtractor g, Minecraft mc) {
        if (mc.player == null) return;
        for (int i = 0; i < 4; i++) {
            ItemStack stack = mc.player.getItemBySlot(SLOTS[i]); // helmet first
            int y = 1 + i * ROW;
            if (stack.isEmpty()) continue;
            g.item(stack, 1, y);
            if (stack.isDamageableItem()) {
                int max = stack.getMaxDamage(), left = max - stack.getDamageValue();
                g.text(mc.font, String.valueOf(left), 22, y + 5, numberColor(left / (float) max), state().shadow);
            }
        }
    }
}

package dev.lumen.client;

import dev.lumen.client.module.LumenModule;
import dev.lumen.client.module.ModuleManager;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

/** Drag every enabled HUD module where you want it. Positions are saved as fractions of the screen. */
public class HudEditorScreen extends Screen {
    private final Screen parent;
    private LumenModule dragging;
    private double grabX, grabY;

    public HudEditorScreen(Screen parent) {
        super(Component.literal("Edit HUD Layout"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        addRenderableWidget(Button.builder(Component.literal("Reset all"), b -> {
            for (LumenModule m : ModuleManager.ALL) if (m.isHud()) m.resetPosition();
        }).bounds(this.width / 2 - 104, this.height - 28, 100, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose()).bounds(this.width / 2 + 4, this.height - 28, 100, 20).build());
    }

    @Override
    public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        g.fill(0, 0, this.width, this.height, 0x88000000);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        super.extractRenderState(g, mouseX, mouseY, partialTick);
        g.centeredText(this.font, Component.literal("Drag the boxes to move them"), this.width / 2, this.height - 44, 0xFFB8BFCC);
        for (LumenModule m : ModuleManager.ALL) {
            if (!m.isHud() || !m.enabled()) continue;
            int x = ModuleManager.px(m, this.width, minecraft), y = ModuleManager.py(m, this.height, minecraft);
            ModuleManager.drawAt(g, minecraft, m, x, y);
            int w = Math.round(m.width(minecraft) * m.state().scale), h = Math.round(m.height(minecraft) * m.state().scale);
            int edge = m == dragging ? 0xFF3DB8FF : 0x883DB8FF;
            g.outline(x - 1, y - 1, w + 2, h + 2, edge);
        }
    }

    private LumenModule hit(double mx, double my) {
        LumenModule found = null;
        for (LumenModule m : ModuleManager.ALL) {
            if (!m.isHud() || !m.enabled()) continue;
            int x = ModuleManager.px(m, this.width, minecraft), y = ModuleManager.py(m, this.height, minecraft);
            int w = Math.round(m.width(minecraft) * m.state().scale), h = Math.round(m.height(minecraft) * m.state().scale);
            if (mx >= x && mx <= x + w && my >= y && my <= y + h) found = m; // last one drawn is on top
        }
        return found;
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        if (super.mouseClicked(event, doubleClick)) return true;
        LumenModule m = hit(event.x(), event.y());
        if (m != null && event.button() == 0) {
            dragging = m;
            grabX = event.x() - ModuleManager.px(m, this.width, minecraft);
            grabY = event.y() - ModuleManager.py(m, this.height, minecraft);
            return true;
        }
        return false;
    }

    @Override
    public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
        if (dragging != null) {
            dragging.state().x = (float) ((event.x() - grabX) / this.width);
            dragging.state().y = (float) ((event.y() - grabY) / this.height);
            return true;
        }
        return super.mouseDragged(event, dx, dy);
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        if (dragging != null) {
            dragging = null;
            LumenConfig.get().save();
            return true;
        }
        return super.mouseReleased(event);
    }

    @Override
    public void onClose() {
        LumenConfig.get().save();
        minecraft.setScreenAndShow(parent);
    }
}

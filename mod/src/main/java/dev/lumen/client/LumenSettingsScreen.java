package dev.lumen.client;

import dev.lumen.client.module.LumenModule;
import dev.lumen.client.module.ModuleManager;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.ContainerObjectSelectionList;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.narration.NarratableEntry;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** The Lumen mods menu (Right Shift): every module with an ON/OFF switch and its own options. */
public class LumenSettingsScreen extends Screen {
    private final Screen parent;
    private ModList list;

    public LumenSettingsScreen(Screen parent) {
        super(Component.literal("Lumen"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        list = new ModList(minecraft, this.width, this.height - 32 - 56, 56, 34);
        for (LumenModule m : ModuleManager.ALL) list.add(new ModEntry(m));
        list.add(new ToggleEntry("Custom main menu", "Replace the vanilla title screen with the Lumen menu.", () -> LumenConfig.get().customMenu, v -> LumenConfig.get().customMenu = v));
        list.add(new ToggleEntry("Quick join list", "Show your saved servers as one-click buttons on the Lumen menu.", () -> LumenConfig.get().quickJoin, v -> LumenConfig.get().quickJoin = v));
        addRenderableWidget(list);

        int bw = 150, y = this.height - 26;
        addRenderableWidget(Button.builder(Component.literal("Edit HUD Layout"), b -> minecraft.setScreen(new HudEditorScreen(this)))
            .bounds(this.width / 2 - bw - 4, y, bw, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose())
            .bounds(this.width / 2 + 4, y, bw, 20).build());
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        g.drawCenteredString(this.font, Component.literal("LUMEN"), this.width / 2, 16, 0xFF3DB8FF);
        g.drawCenteredString(this.font, Component.literal("Mods"), this.width / 2, 30, 0xFFB8BFCC);
        int on = 0;
        for (LumenModule m : ModuleManager.ALL) if (m.enabled()) on++;
        g.drawCenteredString(this.font, Component.literal(on + " of " + ModuleManager.ALL.size() + " enabled"), this.width / 2, 42, 0xFF8D93A8);
    }

    @Override
    public void onClose() {
        LumenConfig.get().save();
        minecraft.setScreen(parent);
    }

    /* ---------- list ---------- */
    private static final class ModList extends ContainerObjectSelectionList<LEntry> {
        ModList(Minecraft mc, int width, int height, int y, int itemHeight) {
            super(mc, width, height, y, itemHeight);
        }

        void add(LEntry e) {
            addEntry(e);
        }

        @Override
        public int getRowWidth() {
            return Math.min(420, this.width - 24);
        }

        @Override
        protected int getScrollbarPosition() {
            return this.width / 2 + getRowWidth() / 2 + 8;
        }
    }

    private abstract static class LEntry extends ContainerObjectSelectionList.Entry<LEntry> {
        protected final Button toggle;
        protected final String name, desc;

        LEntry(String name, String desc, BooleanSupplier get, Consumer<Boolean> set) {
            this.name = name;
            this.desc = desc;
            this.toggle = Button.builder(label(get.getAsBoolean()), b -> {
                set.accept(!get.getAsBoolean());
                b.setMessage(label(get.getAsBoolean()));
            }).bounds(0, 0, 44, 20).build();
        }

        static Component label(boolean on) {
            return Component.literal(on ? "ON" : "OFF").withStyle(s -> s.withColor(on ? 0x4CD98A : 0x9AA3B2));
        }

        protected void renderText(GuiGraphics g, Minecraft mc, int top, int left, int width, int height, int reserved) {
            g.drawString(mc.font, name, left + 4, top + 5, 0xFFFFFFFF, false);
            String d = mc.font.plainSubstrByWidth(desc, width - reserved - 10);
            g.drawString(mc.font, d, left + 4, top + 18, 0xFF8D93A8, false);
        }

        List<AbstractWidget> widgets() {
            return List.of(toggle);
        }

        @Override
        public List<? extends GuiEventListener> children() {
            return widgets();
        }

        @Override
        public List<? extends NarratableEntry> narratables() {
            return widgets();
        }
    }

    private static final class ToggleEntry extends LEntry {
        ToggleEntry(String name, String desc, BooleanSupplier get, Consumer<Boolean> set) {
            super(name, desc, get, set);
        }

        @Override
        public void render(GuiGraphics g, int index, int top, int left, int width, int height, int mx, int my, boolean hovered, float pt) {
            renderText(g, Minecraft.getInstance(), top, left, width, height, 52);
            toggle.setX(left + width - 48);
            toggle.setY(top + 7);
            toggle.render(g, mx, my, pt);
        }
    }

    private final class ModEntry extends LEntry {
        private final LumenModule module;
        private final Button options;

        ModEntry(LumenModule m) {
            super(m.name, m.description, m::enabled, m::setEnabled);
            this.module = m;
            this.options = Button.builder(Component.literal("Options"), b -> minecraft.setScreen(new ModuleOptionsScreen(LumenSettingsScreen.this, m)))
                .bounds(0, 0, 54, 20).build();
        }

        @Override
        List<AbstractWidget> widgets() {
            return module.isHud() ? List.of(toggle, options) : List.of(toggle);
        }

        @Override
        public void render(GuiGraphics g, int index, int top, int left, int width, int height, int mx, int my, boolean hovered, float pt) {
            int reserved = module.isHud() ? 112 : 52;
            renderText(g, Minecraft.getInstance(), top, left, width, height, reserved);
            toggle.setX(left + width - 48);
            toggle.setY(top + 7);
            toggle.render(g, mx, my, pt);
            if (module.isHud()) {
                options.setX(left + width - 48 - 58);
                options.setY(top + 7);
                options.render(g, mx, my, pt);
            }
        }
    }
}

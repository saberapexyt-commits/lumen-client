package dev.lumen.client;

import dev.lumen.client.module.LumenModule;
import dev.lumen.client.module.ModuleManager;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
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
        addRenderableWidget(UiButton.of(Component.literal("Edit HUD Layout"), b -> minecraft.setScreenAndShow(new HudEditorScreen(this)), this.width / 2 - bw - 4, y, bw, 20));
        addRenderableWidget(UiButton.of(Component.literal("Done"), b -> onClose(), this.width / 2 + 4, y, bw, 20));
    }

    @Override
    public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        UiButton.background(g, minecraft, this.width, this.height);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        super.extractRenderState(g, mouseX, mouseY, partialTick);
        g.centeredText(this.font, Component.literal("LUMEN"), this.width / 2, 16, 0xFF3DB8FF);
        g.centeredText(this.font, Component.literal("Mods"), this.width / 2, 30, 0xFFB8BFCC);
        int on = 0;
        for (LumenModule m : ModuleManager.ALL) if (m.enabled()) on++;
        g.centeredText(this.font, Component.literal(on + " of " + ModuleManager.ALL.size() + " enabled"), this.width / 2, 42, 0xFF8D93A8);
    }

    @Override
    public void onClose() {
        LumenConfig.get().save();
        minecraft.setScreenAndShow(parent);
    }

    /* ---------- list ---------- */
    private static final class ModList extends ContainerObjectSelectionList<LEntry> {
        ModList(Minecraft mc, int width, int height, int y, int itemHeight) {
            super(mc, width, height, y, itemHeight);
        }

        void add(LEntry e) {
            addEntry(e);
        }

        // no vanilla list textures: a resource pack must not restyle this screen
        @Override
        protected void extractListBackground(GuiGraphicsExtractor g) {}

        @Override
        protected void extractListSeparators(GuiGraphicsExtractor g) {}

        @Override
        public int getRowWidth() {
            return Math.min(420, this.width - 24);
        }
    }

    private abstract static class LEntry extends ContainerObjectSelectionList.Entry<LEntry> {
        protected final AbstractWidget toggle;
        protected final String name, desc;

        LEntry(String name, String desc, BooleanSupplier get, Consumer<Boolean> set) {
            this.name = name;
            this.desc = desc;
            this.toggle = UiButton.of(label(get.getAsBoolean()), b -> {
                set.accept(!get.getAsBoolean());
                b.setMessage(label(get.getAsBoolean()));
            }, 0, 0, 44, 20);
        }

        static Component label(boolean on) {
            return Component.literal(on ? "ON" : "OFF").withStyle(s -> s.withColor(on ? 0x4CD98A : 0x9AA3B2));
        }

        protected void renderText(GuiGraphicsExtractor g, Minecraft mc, int reserved) {
            int left = getContentX(), top = getContentY(), width = getContentWidth();
            g.text(mc.font, name, left + 4, top + 5, 0xFFFFFFFF, false);
            String d = mc.font.plainSubstrByWidth(desc, width - reserved - 10);
            g.text(mc.font, d, left + 4, top + 18, 0xFF8D93A8, false);
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
        public void extractContent(GuiGraphicsExtractor g, int mx, int my, boolean hovered, float pt) {
            renderText(g, Minecraft.getInstance(), 52);
            toggle.setX(getContentX() + getContentWidth() - 48);
            toggle.setY(getContentY() + 7);
            toggle.extractRenderState(g, mx, my, pt);
        }
    }

    private final class ModEntry extends LEntry {
        private final LumenModule module;
        private final AbstractWidget options;

        ModEntry(LumenModule m) {
            super(m.name, m.description, m::enabled, m::setEnabled);
            this.module = m;
            this.options = UiButton.of(Component.literal("Options"), b -> minecraft.setScreenAndShow(new ModuleOptionsScreen(LumenSettingsScreen.this, m)), 0, 0, 54, 20);
        }

        @Override
        List<AbstractWidget> widgets() {
            return module.isHud() ? List.of(toggle, options) : List.of(toggle);
        }

        @Override
        public void extractContent(GuiGraphicsExtractor g, int mx, int my, boolean hovered, float pt) {
            renderText(g, Minecraft.getInstance(), module.isHud() ? 112 : 52);
            toggle.setX(getContentX() + getContentWidth() - 48);
            toggle.setY(getContentY() + 7);
            toggle.extractRenderState(g, mx, my, pt);
            if (module.isHud()) {
                options.setX(getContentX() + getContentWidth() - 48 - 58);
                options.setY(getContentY() + 7);
                options.extractRenderState(g, mx, my, pt);
            }
        }
    }
}

package dev.lumen.client.module;

import dev.lumen.client.LumenConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/** One toggleable feature. HUD modules also draw themselves and can be moved in the HUD editor. */
public abstract class LumenModule {
    public static final int[] COLORS = {0xFFFFFFFF, 0xFF3DB8FF, 0xFF4CD98A, 0xFFFFD23F, 0xFFFF6B6B, 0xFFF472B6};
    public static final String[] COLOR_NAMES = {"White", "Blue", "Green", "Yellow", "Red", "Pink"};

    public final String id;
    public final String name;
    public final String description;
    private final ModuleState defaults;

    protected LumenModule(String id, String name, String description, boolean defaultEnabled, float x, float y) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.defaults = new ModuleState(defaultEnabled, x, y);
    }

    /** Runs `init` only when the module has no saved settings yet, so defaults never overwrite what the player chose. */
    protected void firstRun(java.util.function.Consumer<ModuleState> init) {
        if (!LumenConfig.get().modules.containsKey(id)) init.accept(state());
    }

    public ModuleState state() {
        return LumenConfig.get().modules.computeIfAbsent(id, k -> new ModuleState(defaults.enabled, defaults.x, defaults.y));
    }

    public boolean enabled() {
        return state().enabled;
    }

    public void setEnabled(boolean on) {
        state().enabled = on;
    }

    public int color() {
        return COLORS[Math.floorMod(state().color, COLORS.length)];
    }

    public void resetPosition() {
        state().x = defaults.x;
        state().y = defaults.y;
        state().scale = 1.0F;
    }

    /** Which panel of the Lumen menu the module appears in. */
    public String category() {
        return isHud() ? "HUD" : "Gameplay";
    }

    /** Whether the module has a background box the player can switch on or off. */
    public boolean supportsBackground() {
        return true;
    }

    /** True for modules that draw on the HUD (and therefore show in the HUD editor). */
    public boolean isHud() {
        return false;
    }

    /** Unscaled size in GUI pixels. */
    public int width(Minecraft mc) {
        return 0;
    }

    public int height(Minecraft mc) {
        return 0;
    }

    /** Draw at the origin; the caller translates and scales. */
    public void render(GuiGraphicsExtractor g, Minecraft mc) {}

    /** Called every client tick for behaviour modules (toggle sprint etc.). */
    public void tick(Minecraft mc) {}
}

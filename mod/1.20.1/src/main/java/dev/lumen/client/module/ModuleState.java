package dev.lumen.client.module;

/** Saved per-module settings. Positions are fractions of the GUI size so they survive window / GUI-scale changes. */
public final class ModuleState {
    public boolean enabled;
    public float x;
    public float y;
    public float scale = 1.0F;
    public int color = 0;
    public boolean background = true;

    public ModuleState() {}

    public ModuleState(boolean enabled, float x, float y) {
        this.enabled = enabled;
        this.x = x;
        this.y = y;
    }
}

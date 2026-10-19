package dev.lumen.client.module;

/** Saved per-module settings. Positions are fractions of the GUI size so they survive window / GUI-scale changes. */
public final class ModuleState {
    public boolean enabled;
    public float x;
    public float y;
    public float scale = 1.0F;
    public int color = 0;
    public boolean background = true;
    public boolean shadow = true;
    /** Extra settings used by the visual modules (style / length / gap / thickness / outline). */
    public int style = 0;
    public int size = 5;
    public int gap = 2;
    public int thickness = 1;
    public boolean outline = true;

    public ModuleState() {}

    public ModuleState(boolean enabled, float x, float y) {
        this.enabled = enabled;
        this.x = x;
        this.y = y;
    }
}

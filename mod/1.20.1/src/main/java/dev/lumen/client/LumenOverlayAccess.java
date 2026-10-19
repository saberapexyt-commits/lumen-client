package dev.lumen.client;

/** Implemented (by a mixin) on the game's entity colour-overlay texture so the hit flash can be recoloured. */
public interface LumenOverlayAccess {
    /** Recolour the hurt flash. {@code argb} supplies the colour; the vanilla translucency is kept. */
    void lumen$recolor(int argb);
}

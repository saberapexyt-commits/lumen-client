package dev.lumen.client.mixin;

import com.mojang.blaze3d.platform.NativeImage;
import dev.lumen.client.LumenOverlayAccess;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.client.renderer.texture.OverlayTexture;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;

@Mixin(OverlayTexture.class)
public abstract class OverlayTextureMixin implements LumenOverlayAccess {
    @Shadow
    @Final
    private DynamicTexture texture;

    @Override
    public void lumen$recolor(int argb) {
        NativeImage img = texture.getPixels();
        if (img == null) return;
        // setPixelRGBA takes ABGR; keep the vanilla translucency (alpha 178)
        int abgr = (178 << 24) | ((argb & 0xFF) << 16) | (((argb >> 8) & 0xFF) << 8) | ((argb >> 16) & 0xFF);
        for (int y = 0; y < 8; y++) {
            for (int x = 0; x < 16; x++) img.setPixelRGBA(x, y, abgr);
        }
        texture.upload();
    }
}

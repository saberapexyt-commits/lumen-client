package dev.lumen.client;

import net.minecraft.client.Minecraft;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.Difficulty;

/** Creates a throwaway creative world; only used by the automated checks (-Dlumen.open=world). */
final class DebugWorld {
    private DebugWorld() {}

    static void create(Minecraft mc) {
        LevelSettings settings = new LevelSettings("Lumen Test", GameType.CREATIVE,
            new LevelSettings.DifficultySettings(Difficulty.PEACEFUL, false, false), true, WorldDataConfiguration.DEFAULT);
        mc.createWorldOpenFlows().createFreshLevel("lumen_test_" + System.currentTimeMillis(), settings, WorldOptions.defaultWithRandomSeed(),
            WorldPresets::createNormalWorldDimensions, mc.gui.screen());
    }
}

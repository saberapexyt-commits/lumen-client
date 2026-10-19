package dev.lumen.client;

import net.minecraft.client.Minecraft;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;

/** Creates a throwaway flat creative world; only used by the automated checks (-Dlumen.open=world). */
final class DebugWorld {
    private DebugWorld() {}

    static void create(Minecraft mc) {
        LevelSettings settings = new LevelSettings("Lumen Test", GameType.CREATIVE, false, Difficulty.PEACEFUL, true, new GameRules(), WorldDataConfiguration.DEFAULT);
        mc.createWorldOpenFlows().createFreshLevel("lumen_test_" + System.currentTimeMillis(), settings, WorldOptions.defaultWithRandomSeed(), WorldPresets::createNormalWorldDimensions, mc.screen);
    }
}

package dev.lumen.client;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.lumen.client.module.ModuleState;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

/** Persisted Lumen options (config/lumen-client.json). */
public final class LumenConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static LumenConfig instance;

    /** Replace the vanilla title screen with the Lumen main menu. */
    public boolean customMenu = true;
    /** Show saved servers as quick-join buttons on the Lumen main menu. */
    public boolean quickJoin = true;
    /** Per-module settings, keyed by module id. */
    public Map<String, ModuleState> modules = new HashMap<>();
    /** Positions of the Lumen menu panels as fractions of the screen: title -> {x, y}. */
    public Map<String, float[]> panels = new HashMap<>();

    private static Path file() {
        return FabricLoader.getInstance().getConfigDir().resolve("lumen-client.json");
    }

    public static LumenConfig get() {
        if (instance == null) {
            LumenConfig loaded = null;
            try {
                if (Files.exists(file())) loaded = GSON.fromJson(Files.readString(file()), LumenConfig.class);
            } catch (Exception e) {
                LumenClient.LOGGER.warn("Could not read lumen-client.json, using defaults", e);
            }
            instance = loaded != null ? loaded : new LumenConfig();
            if (instance.modules == null) instance.modules = new HashMap<>();
            if (instance.panels == null) instance.panels = new HashMap<>();
        }
        return instance;
    }

    public void save() {
        try {
            Files.createDirectories(file().getParent());
            Files.writeString(file(), GSON.toJson(this));
        } catch (IOException e) {
            LumenClient.LOGGER.warn("Could not save lumen-client.json", e);
        }
    }
}

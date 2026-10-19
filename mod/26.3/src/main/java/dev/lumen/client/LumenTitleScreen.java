package dev.lumen.client;

import com.mojang.realmsclient.RealmsMainScreen;
import net.minecraft.SharedConstants;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.ServerList;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

/**
 * The Lumen main menu: logo and buttons in a left column, saved servers on the right, panorama behind.
 * The layout adapts to the GUI scale, so it also fits small windows / large GUI scales.
 */
public class LumenTitleScreen extends Screen {
    private static final int LOGO_W = 2000, LOGO_H = 840; // texture size of lumen:textures/gui/logo.png
    private static final Identifier BG = Identifier.fromNamespaceAndPath(LumenClient.MOD_ID, "textures/gui/background.png");
    private static final int BG_W = 1600, BG_H = 900;
    private static final int ACCENT = 0xFF3DB8FF;
    private static final int PAD = 12;

    /** Pre-shrunk logo sizes (px wide). The one closest to the on-screen size is used so edges stay clean. */
    private static final int[] LOGO_SIZES = logoLadder();

    private static int[] logoLadder() {
        java.util.List<Integer> sizes = new java.util.ArrayList<>();
        for (int w = 200; w < 2000; w = (int) Math.round(w * 1.12)) sizes.add(w);
        sizes.add(2000);
        return sizes.stream().mapToInt(Integer::intValue).toArray();
    }

    private Identifier logoTexture;
    private int logoTexW, logoTexH;

    private void pickLogo() {
        double need = logoW * (double) minecraft.getWindow().getGuiScale();
        int w = LOGO_SIZES[LOGO_SIZES.length - 1];
        for (int s : LOGO_SIZES) if (s >= need * 0.97) { w = s; break; }
        logoTexW = w;
        logoTexH = (int) Math.round(w * 840.0 / 2000.0);
        logoTexture = Identifier.fromNamespaceAndPath(LumenClient.MOD_ID, "textures/gui/logo_" + w + ".png");
    }

    private int panelW, logoX, logoY, logoW, logoH;
    private ServerList servers;

    public LumenTitleScreen() {
        super(Component.literal("Lumen"));
    }

    @Override
    protected void init() {
        panelW = Math.max(150, Math.min(250, (int) (this.width * 0.36)));
        int bw = panelW - PAD * 2;
        int bh = 20, gap = 4;
        int half = (bw - gap) / 2;
        int rows = 4;
        int blockH = rows * bh + (rows - 1) * gap;
        int y0 = this.height - 22 - blockH; // button block is anchored to the bottom

        // logo gets whatever height is left, never wider than the panel
        int maxH = Math.max(30, y0 - PAD * 2);
        logoW = Math.min(bw, (int) (maxH * (LOGO_W / (double) LOGO_H)));
        logoH = (int) (logoW * (LOGO_H / (double) LOGO_W));
        logoX = (panelW - logoW) / 2;
        logoY = Math.max(PAD, (y0 - logoH) / 2);
        pickLogo();

        int y = y0;
        addRenderableWidget(UiButton.of(Component.translatable("menu.singleplayer"), b -> minecraft.setScreenAndShow(new SelectWorldScreen(this)), PAD, y, bw, bh));
        y += bh + gap;
        addRenderableWidget(UiButton.of(Component.translatable("menu.multiplayer"), b -> minecraft.setScreenAndShow(new JoinMultiplayerScreen(this)), PAD, y, bw, bh));
        y += bh + gap;
        addRenderableWidget(UiButton.of(Component.literal("Realms"), b -> minecraft.setScreenAndShow(new RealmsMainScreen(this)), PAD, y, half, bh));
        addRenderableWidget(UiButton.of(Component.translatable("menu.options"), b -> minecraft.setScreenAndShow(new OptionsScreen(this, minecraft.options)), PAD + half + gap, y, half, bh));
        y += bh + gap;
        addRenderableWidget(UiButton.of(Component.literal("Lumen"), b -> minecraft.setScreenAndShow(new LumenSettingsScreen(this)), PAD, y, half, bh));
        addRenderableWidget(UiButton.of(Component.translatable("menu.quit"), b -> minecraft.stop(), PAD + half + gap, y, half, bh));

        servers = new ServerList(minecraft);
        servers.load();
        if (LumenConfig.get().quickJoin) {
            int rx = panelW + 24;
            int rw = Math.min(190, this.width - rx - PAD);
            int shown = Math.min(Math.max(0, (this.height - 52 - PAD) / (bh + gap)), Math.min(6, servers.size()));
            for (int i = 0; i < shown && rw > 80; i++) {
                ServerData data = servers.get(i);
                addRenderableWidget(UiButton.of(Component.literal(data.name), b -> join(data), rx, 40 + i * (bh + gap), rw, bh));
            }
        }
    }

    private void join(ServerData data) {
        ConnectScreen.startConnecting(this, minecraft, ServerAddress.parseString(data.ip), data, false, null);
    }

    @Override
    public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        // Everything that must sit *under* the buttons is drawn here.
        // Static artwork drawn from the mod's own namespace (a resource pack cannot replace it), with a slow drift.
        int theme = LumenConfig.get().menuTheme;
        if (theme != 0) {
            MenuThemes.draw((x1, y1, x2, y2, c) -> g.fill(x1, y1, x2, y2, c), this.width, this.height, System.currentTimeMillis(), theme);
        } else {
            double scale = Math.max(this.width / (double) BG_W, this.height / (double) BG_H) * 1.1;
            int dw = (int) (BG_W * scale), dh = (int) (BG_H * scale);
            double drift = 0.5 + 0.5 * Math.sin(System.nanoTime() / 1.0e10);
            int bx = -(int) ((dw - this.width) * drift), by = -(dh - this.height) / 2;
            g.blit(RenderPipelines.GUI_TEXTURED, BG, bx, by, 0.0F, 0.0F, dw, dh, BG_W, BG_H, BG_W, BG_H);
        }
        g.fill(0, 0, this.width, this.height, 0x40050709); // light overall dim so text stays readable
        g.fill(0, 0, panelW, this.height, 0xB30A0C10);
        g.fill(panelW, 0, panelW + 1, this.height, 0x663DB8FF);
        g.blit(RenderPipelines.GUI_TEXTURED, logoTexture, logoX, logoY, 0.0F, 0.0F, logoW, logoH, logoTexW, logoTexH, logoTexW, logoTexH);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        super.extractRenderState(g, mouseX, mouseY, partialTick); // background, then widgets

        String version = "Minecraft " + SharedConstants.getCurrentVersion().name() + "  |  Lumen Client " + LumenClient.VERSION;
        g.text(this.font, version, PAD, this.height - 14, 0xFF8D93A8, false);

        if (LumenConfig.get().quickJoin) {
            int rx = panelW + 24;
            g.text(this.font, "QUICK JOIN", rx, 26, ACCENT, false);
            if (servers != null && servers.size() == 0) {
                int w = Math.max(80, this.width - rx - PAD);
                g.textWithWordWrap(this.font, Component.literal("No saved servers yet. Add one in Multiplayer and it shows up here."), rx, 42, w, 0xFFB8BFCC);
            }
        }
        String who = minecraft.getUser().getName();
        g.text(this.font, who, this.width - this.font.width(who) - PAD, 10, 0xFFB8BFCC, false);
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }
}

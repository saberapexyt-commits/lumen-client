package dev.lumen.client;

import com.mojang.realmsclient.RealmsMainScreen;
import net.minecraft.SharedConstants;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.ServerList;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.client.renderer.CubeMap;
import net.minecraft.client.renderer.PanoramaRenderer;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

/**
 * The Lumen main menu: logo and buttons in a left column, saved servers on the right, panorama behind.
 * The layout adapts to the GUI scale, so it also fits small windows / large GUI scales.
 */
public class LumenTitleScreen extends Screen {
    private static final int LOGO_W = 1000, LOGO_H = 420; // texture size of lumen:textures/gui/logo.png
    private static final ResourceLocation LOGO = new ResourceLocation(LumenClient.MOD_ID, "textures/gui/logo.png");
    private static final CubeMap CUBE_MAP = new CubeMap(new ResourceLocation(LumenClient.MOD_ID, "textures/gui/panorama/panorama"));
    private static final int ACCENT = 0xFF3DB8FF;
    private static final int PAD = 12;

    private final PanoramaRenderer panorama = new PanoramaRenderer(CUBE_MAP);
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

        int y = y0;
        addRenderableWidget(UiButton.of(Component.translatable("menu.singleplayer"), b -> minecraft.setScreen(new SelectWorldScreen(this)), PAD, y, bw, bh));
        y += bh + gap;
        addRenderableWidget(UiButton.of(Component.translatable("menu.multiplayer"), b -> minecraft.setScreen(new JoinMultiplayerScreen(this)), PAD, y, bw, bh));
        y += bh + gap;
        addRenderableWidget(UiButton.of(Component.literal("Realms"), b -> minecraft.setScreen(new RealmsMainScreen(this)), PAD, y, half, bh));
        addRenderableWidget(UiButton.of(Component.translatable("menu.options"), b -> minecraft.setScreen(new OptionsScreen(this, minecraft.options)), PAD + half + gap, y, half, bh));
        y += bh + gap;
        addRenderableWidget(UiButton.of(Component.literal("Lumen"), b -> minecraft.setScreen(new LumenSettingsScreen(this)), PAD, y, half, bh));
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
        ConnectScreen.startConnecting(this, minecraft, ServerAddress.parseString(data.ip), data, false);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        // 1.20.1 does not draw a background for us: panorama, dim, panel and logo first, then the widgets on top.
        panorama.render(partialTick, 1.0F);
        g.fill(0, 0, this.width, this.height, 0x40050709); // light overall dim so text stays readable
        g.fill(0, 0, panelW, this.height, 0xB30A0C10);
        g.fill(panelW, 0, panelW + 1, this.height, 0x663DB8FF);
        g.blit(LOGO, logoX, logoY, logoW, logoH, 0, 0, LOGO_W, LOGO_H, LOGO_W, LOGO_H);
        super.render(g, mouseX, mouseY, partialTick);

        String version = "Minecraft " + SharedConstants.getCurrentVersion().getName() + "  |  Lumen Client";
        g.drawString(this.font, version, PAD, this.height - 14, 0xFF8D93A8, false);

        if (LumenConfig.get().quickJoin) {
            int rx = panelW + 24;
            g.drawString(this.font, "QUICK JOIN", rx, 26, ACCENT, false);
            if (servers != null && servers.size() == 0) {
                int w = Math.max(80, this.width - rx - PAD);
                g.drawWordWrap(this.font, Component.literal("No saved servers yet. Add one in Multiplayer and it shows up here."), rx, 42, w, 0xFFB8BFCC);
            }
        }
        String who = minecraft.getUser().getName();
        g.drawString(this.font, who, this.width - this.font.width(who) - PAD, 10, 0xFFB8BFCC, false);
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }
}

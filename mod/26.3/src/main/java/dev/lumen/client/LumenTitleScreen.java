package dev.lumen.client;

import com.mojang.realmsclient.RealmsMainScreen;
import net.minecraft.SharedConstants;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.ServerList;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

/**
 * The Lumen main menu, in the style of the big clients: logo and a column of buttons in the middle over a dimmed
 * background, your saved servers as a slim icon strip on the left, Quit at the bottom. The layout adapts to the GUI
 * scale, so it also fits small windows / large GUI scales.
 */
public class LumenTitleScreen extends Screen {
    private static final int LOGO_W = 2000, LOGO_H = 840; // texture size of lumen:textures/gui/logo.png
    private static final Identifier BG = Identifier.fromNamespaceAndPath(LumenClient.MOD_ID, "textures/gui/background.png");
    private static final int BG_W = 1600, BG_H = 900;
    private static final int ACCENT = 0xFF3DB8FF;

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

    private int logoX, logoY, logoW, logoH;
    private int stripX, stripY, stripW, stripH;
    private ServerList servers;

    public LumenTitleScreen() {
        super(Component.literal("Lumen"));
    }

    @Override
    protected void init() {
        int bh = 22, gap = 5;
        int bw = Math.max(130, Math.min(200, (int) (this.width * 0.34)));
        int cx = this.width / 2;
        int rows = 4;
        int blockH = rows * bh + (rows - 1) * gap;
        int quitH = 18;

        // logo gets whatever height is left above the button block
        int top = 10, bottom = this.height - 38;
        int maxLogoH = Math.max(24, bottom - top - blockH - 14);
        logoW = Math.min((int) (bw * 1.45), (int) (maxLogoH * (LOGO_W / (double) LOGO_H)));
        logoH = (int) (logoW * (LOGO_H / (double) LOGO_W));
        int total = logoH + 12 + blockH;
        int y0 = top + Math.max(0, (bottom - top - total) / 2);
        logoX = cx - logoW / 2;
        logoY = y0;
        pickLogo();

        int x = cx - bw / 2;
        int y = y0 + logoH + 12;
        int half = (bw - gap) / 2;
        addRenderableWidget(UiButton.of(Component.translatable("menu.singleplayer"), b -> minecraft.setScreenAndShow(new SelectWorldScreen(this)), x, y, bw, bh));
        y += bh + gap;
        addRenderableWidget(UiButton.of(Component.translatable("menu.multiplayer"), b -> minecraft.setScreenAndShow(new JoinMultiplayerScreen(this)), x, y, bw, bh));
        y += bh + gap;
        addRenderableWidget(UiButton.of(Component.literal("Realms"), b -> minecraft.setScreenAndShow(new RealmsMainScreen(this)), x, y, half, bh));
        addRenderableWidget(UiButton.of(Component.translatable("menu.options"), b -> minecraft.setScreenAndShow(new OptionsScreen(this, minecraft.options)), x + half + gap, y, half, bh));
        y += bh + gap;
        addRenderableWidget(UiButton.of(Component.literal("Lumen"), b -> minecraft.setScreenAndShow(new LumenSettingsScreen(this)), x, y, bw, bh).accent());
        int qw = 96;
        addRenderableWidget(UiButton.of(Component.translatable("menu.quit"), b -> minecraft.stop(), cx - qw / 2, this.height - 34, qw, quitH));

        // saved servers: a slim vertical icon strip on the left
        servers = new ServerList(minecraft);
        servers.load();
        stripW = 0;
        stripH = 0;
        if (LumenConfig.get().quickJoin && servers.size() > 0) {
            int icon = 24, ig = 4, pad = 5;
            int shown = Math.min(servers.size(), Math.min(7, Math.max(1, (this.height - 40) / (icon + ig))));
            stripW = icon + pad * 2;
            stripH = shown * icon + (shown - 1) * ig + pad * 2;
            stripX = 8;
            stripY = (this.height - stripH) / 2;
            for (int i = 0; i < shown; i++) {
                ServerData data = servers.get(i);
                String letter = data.name.isEmpty() ? "?" : data.name.substring(0, 1).toUpperCase(java.util.Locale.ROOT);
                UiButton b = UiButton.of(Component.literal(letter), btn -> join(data), stripX + pad, stripY + pad + i * (icon + ig), icon, icon);
                b.setTooltip(Tooltip.create(Component.literal(data.name)));
                addRenderableWidget(b);
            }
        }
    }

    private void join(ServerData data) {
        ConnectScreen.startConnecting(this, minecraft, ServerAddress.parseString(data.ip), data, false, null);
    }

    @Override
    public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        // Screen.render() calls this first, so everything that must sit *under* the buttons is drawn here.
        int theme = LumenConfig.get().menuTheme;
        if (theme != 0) MenuThemes.draw((x1, y1, x2, y2, c) -> g.fill(x1, y1, x2, y2, c), this.width, this.height, System.currentTimeMillis(), theme);
        else {
            // Static artwork drawn from the mod's own namespace (a resource pack cannot replace it), with a slow drift.
            double scale = Math.max(this.width / (double) BG_W, this.height / (double) BG_H) * 1.1;
            int dw = (int) (BG_W * scale), dh = (int) (BG_H * scale);
            double drift = 0.5 + 0.5 * Math.sin(System.nanoTime() / 1.0e10);
            int bx = -(int) ((dw - this.width) * drift), by = -(dh - this.height) / 2;
            g.blit(RenderPipelines.GUI_TEXTURED, BG, bx, by, 0.0F, 0.0F, dw, dh, BG_W, BG_H, BG_W, BG_H);
        }
        g.fill(0, 0, this.width, this.height, 0x99070A10); // dim so the centre column stands out
        g.fillGradient(0, this.height - this.height / 3, this.width, this.height, 0x00000000, 0x66000000);
        if (stripW > 0) {
            g.fill(stripX, stripY, stripX + stripW, stripY + stripH, 0xB30A0D12);
            g.fill(stripX, stripY, stripX + 1, stripY + stripH, 0x333DB8FF);
        }
        g.blit(RenderPipelines.GUI_TEXTURED, logoTexture, logoX, logoY, 0.0F, 0.0F, logoW, logoH, logoTexW, logoTexH, logoTexW, logoTexH);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        super.extractRenderState(g, mouseX, mouseY, partialTick); // background, then widgets

        String version = "Minecraft " + SharedConstants.getCurrentVersion().name() + "  |  Lumen Client " + LumenClient.VERSION;
        g.text(this.font, version, (this.width - this.font.width(version)) / 2, this.height - 12, 0xFF6F7788, false);
        String who = minecraft.getUser().getName();
        int chipW = this.font.width(who) + 14;
        g.fill(this.width - chipW - 8, 8, this.width - 8, 8 + 16, 0xB30A0D12);
        g.fill(this.width - chipW - 8, 8 + 15, this.width - 8, 8 + 16, ACCENT);
        g.text(this.font, who, this.width - chipW - 1, 8 + 4, 0xFFE6EAF2, false);
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }
}

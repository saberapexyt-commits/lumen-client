package dev.lumen.client;

import com.mojang.realmsclient.RealmsMainScreen;
import net.minecraft.SharedConstants;
import net.minecraft.client.gui.GuiGraphicsExtractor;
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
 * The Lumen main menu, laid out like the big clients: logo and a column of wide buttons in the middle, a promo banner
 * under them, a row of icon buttons at the bottom, your account top left, Quit top right and a Quick Join card for
 * your saved servers bottom left. The layout adapts to the GUI scale, so it also fits small windows / large GUI scales.
 */
public class LumenTitleScreen extends Screen {
    private static final int LOGO_W = 2000, LOGO_H = 1280; // texture size of lumen:textures/gui/logo.png
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
        logoTexH = (int) Math.round(w * 1280.0 / 2000.0);
        logoTexture = Identifier.fromNamespaceAndPath(LumenClient.MOD_ID, "textures/gui/logo_" + w + ".png");
    }

    private int logoX, logoY, logoW, logoH;
    private int cardX, cardY, cardW, cardH;
    private ServerList servers;

    public LumenTitleScreen() {
        super(Component.literal("Lumen"));
    }

    @Override
    protected void init() {
        int bh = 20, gap = 4;
        int bw = Math.max(140, Math.min(220, (int) (this.width * 0.34)));
        int cx = this.width / 2;
        int bannerH = 34;
        int iconSize = 22;
        int blockH = 3 * bh + 2 * gap + gap + bannerH; // singleplayer, multiplayer, row, banner

        // logo gets whatever height is left above the button block
        int top = 12, bottom = this.height - 12 - iconSize - 8;
        int maxLogoH = Math.max(24, bottom - top - blockH - 10);
        logoW = Math.min((int) (bw * 0.85), (int) (maxLogoH * (LOGO_W / (double) LOGO_H)));
        logoH = (int) (logoW * (LOGO_H / (double) LOGO_W));
        int total = logoH + 10 + blockH;
        int y0 = top + Math.max(0, (bottom - top - total) / 2);
        logoX = cx - logoW / 2;
        logoY = y0;
        pickLogo();

        int x = cx - bw / 2;
        int y = y0 + logoH + 10;
        int half = (bw - gap) / 2;
        addRenderableWidget(UiButton.of(Component.translatable("menu.singleplayer"), b -> minecraft.setScreenAndShow(new SelectWorldScreen(this)), x, y, bw, bh));
        y += bh + gap;
        addRenderableWidget(UiButton.of(Component.translatable("menu.multiplayer"), b -> minecraft.setScreenAndShow(new JoinMultiplayerScreen(this)), x, y, bw, bh));
        y += bh + gap;
        addRenderableWidget(UiButton.of(Component.translatable("menu.options"), b -> minecraft.setScreenAndShow(new OptionsScreen(this, minecraft.options)), x, y, half, bh));
        addRenderableWidget(UiButton.of(Component.literal("Lumen"), b -> minecraft.setScreenAndShow(new LumenSettingsScreen(this)), x + half + gap, y, half, bh).accent());
        y += bh + gap;
        addRenderableWidget(UiButton.of(Component.literal("Customize Lumen"), b -> minecraft.setScreenAndShow(new LumenSettingsScreen(this)), x, y, bw, bannerH).banner("HUD, crosshair, themes"));

        // bottom icon row: Lumen menu, HUD editor, Realms
        int by = this.height - 12 - iconSize;
        int ibx = cx - (3 * iconSize + 2 * 4) / 2;
        addRenderableWidget(UiButton.of(Component.literal("Lumen"), b -> minecraft.setScreenAndShow(new LumenSettingsScreen(this)), ibx, by, iconSize, iconSize).icon(UiButton.GEAR));
        addRenderableWidget(UiButton.of(Component.literal("HUD"), b -> minecraft.setScreenAndShow(new HudEditorScreen(this)), ibx + iconSize + 4, by, iconSize, iconSize).icon(UiButton.LAYOUT));
        addRenderableWidget(UiButton.of(Component.literal("Realms"), b -> minecraft.setScreenAndShow(new RealmsMainScreen(this)), ibx + 2 * (iconSize + 4), by, iconSize, iconSize).icon(UiButton.GLOBE));

        // quit: a small square button in the top right corner
        addRenderableWidget(UiButton.of(Component.translatable("menu.quit"), b -> minecraft.stop(), this.width - 12 - 20, 10, 20, 20).icon(UiButton.CLOSE));

        // quick join card, bottom left
        servers = new ServerList(minecraft);
        servers.load();
        cardW = 0;
        cardH = 0;
        if (LumenConfig.get().quickJoin && servers.size() > 0) {
            int rowH = 16;
            int shown = Math.min(servers.size(), Math.min(5, Math.max(1, (this.height - 120) / rowH)));
            cardW = Math.max(110, Math.min(150, (this.width - bw) / 2 - 24));
            cardH = 20 + shown * rowH + 6;
            cardX = 10;
            cardY = this.height - 10 - cardH;
            for (int i = 0; i < shown; i++) {
                ServerData data = servers.get(i);
                addRenderableWidget(UiButton.of(Component.literal(data.name), btn -> join(data), cardX + 4, cardY + 20 + i * rowH, cardW - 8, rowH).row());
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
        g.fill(0, 0, this.width, this.height, 0x66070A10); // light dim so the centre column stands out
        g.fillGradient(0, this.height - this.height / 3, this.width, this.height, 0x00000000, 0x66000000);
        g.blit(RenderPipelines.GUI_TEXTURED, logoTexture, logoX, logoY, 0.0F, 0.0F, logoW, logoH, logoTexW, logoTexH, logoTexW, logoTexH);
        if (cardW > 0) {
            UiButton.panel(g, cardX, cardY, cardX + cardW, cardY + cardH, 0xFF262B35, 0xE60C0F14);
            g.text(this.font, "QUICK JOIN", cardX + 8, cardY + 7, ACCENT, false);
        }
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        super.extractRenderState(g, mouseX, mouseY, partialTick); // background, then widgets

        // account chip, top left
        String who = minecraft.getUser().getName();
        int chipW = this.font.width(who) + 30;
        UiButton.panel(g, 10, 10, 10 + chipW, 30, 0xFF262B35, 0xE60C0F14);
        g.fill(14, 14, 26, 26, ACCENT);
        String initial = who.isEmpty() ? "?" : who.substring(0, 1).toUpperCase(java.util.Locale.ROOT);
        g.text(this.font, initial, 20 - this.font.width(initial) / 2, 16, 0xFF04202E, false);
        g.text(this.font, who, 32, 16, 0xFFE6EAF2, false);

        String mcLine = "Minecraft " + SharedConstants.getCurrentVersion().name();
        String lumenLine = "Lumen Client " + LumenClient.VERSION;
        g.text(this.font, mcLine, this.width - this.font.width(mcLine) - 10, this.height - 24, 0xFF6F7788, false);
        g.text(this.font, lumenLine, this.width - this.font.width(lumenLine) - 10, this.height - 14, 0xFF6F7788, false);
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }
}

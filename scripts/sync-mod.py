"""
Keeps the version-independent parts of the in-game mod identical across Minecraft versions.

Source of truth: mod/1.21.1. Shared files (config + module logic) are copied verbatim to 1.20.1 (same API) and
mechanically translated for 26.3, whose rendering API was renamed. Screens and mixins are ported by hand per version.

    python scripts/sync-mod.py
"""
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mod')
BASE = 'src/main/java/dev/lumen/client/'
SHARED = [
    'LumenConfig.java', 'ClickGuiModel.java', 'MenuThemes.java', 'LumenOverlayAccess.java', 'module/VisualModules.java',
    'module/ArmorModule.java', 'module/BehaviourModules.java', 'module/CpsTracker.java', 'module/KeystrokesModule.java',
    'module/GameplayModules.java', 'module/LumenModule.java', 'module/ModuleManager.java', 'module/ModuleState.java', 'module/Modules.java', 'module/TextModule.java',
]

# 1.21.1 -> 26.3 (GuiGraphics became GuiGraphicsExtractor, drawString became text, a 2D matrix stack, new inventory access)
RENAMES_263 = [
    ('net.minecraft.client.gui.GuiGraphics;', 'net.minecraft.client.gui.GuiGraphicsExtractor;'),
    ('GuiGraphics g', 'GuiGraphicsExtractor g'),
    ('g.drawString(mc.font,', 'g.text(mc.font,'),
    ('g.renderItem(stack, 1, y);', 'g.item(stack, 1, y);'),
    ('ItemStack stack = mc.player.getInventory().armor.get(3 - i); // helmet first', 'ItemStack stack = mc.player.getItemBySlot(SLOTS[i]); // helmet first'),
    ('    private static final int ROW = 18;', '    private static final int ROW = 18;\n    private static final EquipmentSlot[] SLOTS = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};'),
    ('import net.minecraft.world.item.ItemStack;', 'import net.minecraft.world.entity.EquipmentSlot;\nimport net.minecraft.world.item.ItemStack;'),
    ('pose.pushPose();\n        pose.translate(x, y, 0);\n        pose.scale(m.state().scale, m.state().scale, 1.0F);\n        m.render(g, mc);\n        pose.popPose();',
     'pose.pushMatrix();\n        pose.translate((float) x, (float) y);\n        pose.scale(m.state().scale, m.state().scale);\n        m.render(g, mc);\n        pose.popMatrix();'),
    ('mc.screen != null', 'mc.gui.screen() != null'),
    ('mc.level.getDayTime()', 'mc.level.getOverworldClockTime()'),
    ("mc.player.displayClientMessage(Component.literal(", "mc.player.sendSystemMessage(Component.literal("),
    ('server rules."), false);', 'server rules."));'),
    ('mc.player.swing(hand);', '// the swing animation takes extra arguments on 26.x, so Auto Fish skips it there'),  # 26.x replaced day time with a clock manager
]


def read(p):
    with open(p, encoding='utf8') as f:
        return f.read()


def write(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf8', newline='\n') as f:
        f.write(s)


for rel in SHARED:
    src = read(os.path.join(ROOT, '1.21.1', BASE, rel))
    write(os.path.join(ROOT, '1.20.1', BASE, rel), src)
    out = src
    for a, b in RENAMES_263:
        out = out.replace(a, b)
    write(os.path.join(ROOT, '26.3', BASE, rel), out)
print('synced', len(SHARED), 'files')

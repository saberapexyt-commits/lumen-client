import test from 'node:test';
import assert from 'node:assert/strict';
import { VersionJson, mavenPath, resolveVersion, rulesAllow } from '../main/minecraft/versions';
import { buildLaunchArgs, splitArgs, redact } from '../main/minecraft/launch';
import { cmpVersion, safeJoin } from '../main/util';

test('rules: os allow/disallow and features', () => {
  assert.equal(rulesAllow(undefined), true);
  assert.equal(rulesAllow([{ action: 'allow' }, { action: 'disallow', os: { name: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux' } }]), false);
  assert.equal(rulesAllow([{ action: 'allow', os: { name: 'definitely-not-an-os' } }]), false);
  assert.equal(rulesAllow([{ action: 'allow', features: { has_custom_resolution: true } }], { has_custom_resolution: true }), true);
  assert.equal(rulesAllow([{ action: 'allow', features: { has_custom_resolution: true } }], {}), false);
});

test('maven coordinates map to repository paths', () => {
  assert.equal(mavenPath('net.fabricmc:fabric-loader:0.16.5'), 'net/fabricmc/fabric-loader/0.16.5/fabric-loader-0.16.5.jar');
  assert.equal(mavenPath('org.lwjgl:lwjgl:3.3.3:natives-windows'), 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar');
});

test('inheritsFrom merges libraries (child wins), arguments, and keeps parent assets', async () => {
  const parent: VersionJson = {
    id: '1.21.1',
    mainClass: 'net.minecraft.client.main.Main',
    libraries: [{ name: 'org.ow2.asm:asm:9.6' }, { name: 'com.mojang:brigadier:1.0' }],
    assetIndex: { id: '17', url: 'u', sha1: 's', size: 1 },
    arguments: { game: ['--username', '${auth_player_name}'], jvm: ['-cp', '${classpath}'] },
    javaVersion: { component: 'java-runtime-delta', majorVersion: 21 },
  };
  const child: VersionJson = {
    id: 'fabric-loader-x-1.21.1',
    inheritsFrom: '1.21.1',
    mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
    libraries: [{ name: 'org.ow2.asm:asm:9.7' }],
    arguments: { game: [], jvm: ['-DFabricMcEmu='] },
  };
  const r = await resolveVersion(child.id, async (id) => (id === parent.id ? parent : child));
  assert.equal(r.mainClass, 'net.fabricmc.loader.impl.launch.knot.KnotClient');
  assert.deepEqual(r.libraries.map((l) => l.name).sort(), ['com.mojang:brigadier:1.0', 'org.ow2.asm:asm:9.7']);
  assert.equal(r.assetIndex?.id, '17');
  assert.deepEqual(r.arguments?.jvm, ['-cp', '${classpath}', '-DFabricMcEmu=']);
  assert.equal(r.javaVersion?.majorVersion, 21);
  assert.equal((r as any)._baseVersion, '1.21.1');
});

test('launch args: substitution, memory, secrets redaction', () => {
  const v: VersionJson = {
    id: '1.21.1',
    mainClass: 'Main',
    libraries: [],
    assetIndex: { id: '17', url: 'u', sha1: 's', size: 1 },
    arguments: { game: ['--username', '${auth_player_name}', '--accessToken', '${auth_access_token}'], jvm: ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'] },
  };
  const args = buildLaunchArgs({
    versionId: v.id,
    resolved: v,
    javaPath: 'java',
    gameDir: '/g',
    session: { name: 'Steve', uuid: 'u', accessToken: 'SECRET', userType: 'msa' },
    ramMb: 3072,
    jvmArgs: ['-XX:+UseG1GC'],
  });
  assert.ok(args.includes('-Xmx3072M'));
  assert.ok(args.includes('Steve'));
  assert.ok(args.indexOf('Main') > args.indexOf('-cp'));
  assert.ok(!redact(args, 'SECRET').includes('SECRET'));
});

test('splitArgs handles quotes', () => {
  assert.deepEqual(splitArgs('-Xa "-Db=c d" -Z'), ['-Xa', '-Db=c d', '-Z']);
});

test('cmpVersion and safeJoin', () => {
  assert.ok(cmpVersion('1.21.1', '1.21') > 0);
  assert.ok(cmpVersion('1.9', '1.12') < 0);
  assert.throws(() => safeJoin('/a/b', '../c'));
  assert.doesNotThrow(() => safeJoin('/a/b', 'c/d'));
});

import { neoPrefix } from '../main/loaders';
test('NeoForge version prefixes for legacy and year-based Minecraft versions', () => {
  assert.equal(neoPrefix('1.21.1'), '21.1.');
  assert.equal(neoPrefix('1.21'), '21.0.');
  assert.equal(neoPrefix('26.3'), '26.3.0.');
  assert.equal(neoPrefix('26.1.2'), '26.1.2.');
  assert.equal(neoPrefix('26.4-snapshot-4'), null);
});

import AdmZip from 'adm-zip';

/** Metadata read straight from a mod jar - works for mods we did not install ourselves. */
export interface JarMeta {
  loader?: 'fabric' | 'quilt' | 'forge' | 'neoforge';
  modId?: string;
  name?: string;
  version?: string;
  provides: string[];
  /** Hard dependencies (mod ids) the jar declares. */
  depends: string[];
}

const BUILTIN = new Set(['minecraft', 'java', 'fabricloader', 'fabric-loader', 'quilt_loader', 'quilt_base', 'forge', 'neoforge', 'fml', 'javafml', 'lowcodefml']);
export const isBuiltinDep = (id: string) => BUILTIN.has(id.toLowerCase());

function parseFabric(json: any, nested: string[][]): JarMeta {
  const depends = Object.keys(json.depends ?? {});
  return {
    loader: 'fabric',
    modId: json.id,
    name: json.name,
    version: json.version,
    provides: [...(json.provides ?? []), ...nested.flat()],
    depends,
  };
}

function readNestedIds(zip: AdmZip, jars: { file: string }[] | undefined, depth: number): string[][] {
  const out: string[][] = [];
  if (!jars || depth > 2) return out;
  for (const j of jars) {
    const entry = zip.getEntry(j.file);
    if (!entry) continue;
    try {
      const inner = new AdmZip(entry.getData());
      const fm = inner.getEntry('fabric.mod.json');
      if (!fm) continue;
      const json = JSON.parse(fm.getData().toString('utf8'));
      out.push([json.id, ...(json.provides ?? []), ...readNestedIds(inner, json.jars, depth + 1).flat()]);
    } catch {
      /* ignore broken nested jar */
    }
  }
  return out;
}

/** Best-effort TOML scan: enough for modId / version / displayName and mandatory dependencies. */
function parseToml(text: string, loader: 'forge' | 'neoforge'): JarMeta {
  const modId = /^\s*modId\s*=\s*"([^"]+)"/m.exec(text)?.[1];
  const name = /^\s*displayName\s*=\s*"([^"]+)"/m.exec(text)?.[1];
  const version = /^\s*version\s*=\s*"([^"]+)"/m.exec(text)?.[1];
  const depends: string[] = [];
  // [[dependencies.<id>]] blocks with modId="x" and mandatory=true (or type="required")
  const blocks = text.split(/^\s*\[\[dependencies\.[^\]]+\]\]/m).slice(1);
  for (const b of blocks) {
    const body = b.split(/^\s*\[\[/m)[0];
    const id = /modId\s*=\s*"([^"]+)"/.exec(body)?.[1];
    const mandatory = /mandatory\s*=\s*true/.test(body) || /type\s*=\s*"required"/.test(body);
    if (id && mandatory) depends.push(id);
  }
  return { loader, modId, name, version, provides: [], depends };
}

export function readJarMeta(file: string): JarMeta {
  const empty: JarMeta = { provides: [], depends: [] };
  try {
    const zip = new AdmZip(file);
    const fabric = zip.getEntry('fabric.mod.json');
    if (fabric) {
      const json = JSON.parse(fabric.getData().toString('utf8').replace(/^﻿/, ''));
      return parseFabric(json, readNestedIds(zip, json.jars, 0));
    }
    const quilt = zip.getEntry('quilt.mod.json');
    if (quilt) {
      const q = JSON.parse(quilt.getData().toString('utf8'));
      const ql = q.quilt_loader ?? {};
      const deps = (ql.depends ?? []).map((d: any) => (typeof d === 'string' ? d : d.id)).filter(Boolean);
      return {
        loader: 'quilt',
        modId: ql.id,
        name: ql.metadata?.name,
        version: ql.version,
        provides: (ql.provides ?? []).map((p: any) => (typeof p === 'string' ? p : p.id)),
        depends: deps,
      };
    }
    const neo = zip.getEntry('META-INF/neoforge.mods.toml');
    if (neo) return parseToml(neo.getData().toString('utf8'), 'neoforge');
    const forge = zip.getEntry('META-INF/mods.toml');
    if (forge) return parseToml(forge.getData().toString('utf8'), 'forge');
    return empty;
  } catch {
    return empty;
  }
}

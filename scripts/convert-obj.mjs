// OBJ (+ diffuse/normal PNGs, e.g. a Meshy/Tripo export) -> one web-ready GLB:
// welded, simplified, meshopt-compressed, textures resized to JPEG 1024.
// Usage: node scripts/convert-obj.mjs <srcDir> <out.glb> [simplifyRatio=0.5]
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [src, out, ratioArg] = process.argv.slice(2);
const ratio = Number(ratioArg ?? 0.5);
const obj = readFileSync(join(src, "base.obj"), "utf8").split("\n");
const v = [], vt = [], vn = [], P = [], N = [], U = [];
for (const l of obj) {
  const p = l.trim().split(/\s+/);
  if (p[0] === "v") v.push(p.slice(1, 4).map(Number));
  else if (p[0] === "vt") vt.push(p.slice(1, 3).map(Number));
  else if (p[0] === "vn") vn.push(p.slice(1, 4).map(Number));
  else if (p[0] === "f") {
    const c = p.slice(1).map((s) => s.split("/").map((x) => (x ? Number(x) - 1 : -1)));
    for (let i = 1; i + 1 < c.length; i++) for (const [vi, ti, ni] of [c[0], c[i], c[i + 1]]) {
      P.push(...v[vi]);
      U.push(...(ti >= 0 ? [vt[ti][0], 1 - vt[ti][1]] : [0, 0]));
      N.push(...(ni >= 0 ? vn[ni] : [0, 1, 0]));
    }
  }
}
const tmp = mkdtempSync(join(tmpdir(), "obj-"));
const jpg = (name, size) => { const o = join(tmp, name + ".jpg"); execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "78", "-Z", String(size), join(src, name + ".png"), "--out", o]); return readFileSync(o); };

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const doc = new Document();
const buf = doc.createBuffer();
const acc = (arr, type) => doc.createAccessor().setType(type).setArray(new Float32Array(arr)).setBuffer(buf);
const mat = doc.createMaterial("skin").setRoughnessFactor(0.75).setMetallicFactor(0)
  .setBaseColorTexture(doc.createTexture("diffuse").setImage(jpg("texture_diffuse", 1024)).setMimeType("image/jpeg"))
  .setNormalTexture(doc.createTexture("normal").setImage(jpg("texture_normal", 1024)).setMimeType("image/jpeg"));
const prim = doc.createPrimitive().setMaterial(mat)
  .setAttribute("POSITION", acc(P, "VEC3")).setAttribute("NORMAL", acc(N, "VEC3")).setAttribute("TEXCOORD_0", acc(U, "VEC2"));
const node = doc.createNode("model").setMesh(doc.createMesh("model").addPrimitive(prim));
doc.createScene().addChild(node);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
await io.write(out, doc);
console.log(`${out}: ${(statSync(out).size / 1024).toFixed(0)} KB (${P.length / 9} tris in)`);

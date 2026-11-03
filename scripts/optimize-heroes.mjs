// KayKit Adventurers (CC0, Kay Lousberg) → web-ready heroes for the walkable cinema.
// Keeps the 6 clips we use, one signature prop per hero, then prunes, resamples, quantizes
// and meshopt-compresses. Input: assets-src/kaykit/*.glb  Output: public/heroes/*.glb
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { mkdirSync, statSync, copyFileSync } from "node:fs";

const KEEP_CLIPS = new Set(["Idle", "Walking_A", "Sit_Chair_Down", "Sit_Chair_Idle", "Cheer", "Interact"]);
const HEROES = {
  Knight: "1H_Sword",
  Barbarian: "1H_Axe",
  Mage: "2H_Staff",
  Rogue: "Knife",
  Rogue_Hooded: "Knife",
};
// Every prop the pack attaches to the hands; all but the signature one are removed.
const PROPS = new Set(["1H_Sword_Offhand", "Badge_Shield", "Rectangle_Shield", "Round_Shield", "Spike_Shield", "1H_Sword", "2H_Sword",
  "1H_Axe_Offhand", "Barbarian_Round_Shield", "1H_Axe", "2H_Axe", "Mug", "Spellbook", "Spellbook_open", "1H_Wand", "2H_Staff",
  "Knife_Offhand", "1H_Crossbow", "2H_Crossbow", "Knife", "Throwable"]);

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
mkdirSync("public/heroes", { recursive: true });
copyFileSync("assets-src/kaykit/LICENSE.txt", "public/heroes/LICENSE-KayKit.txt");

for (const [name, keepProp] of Object.entries(HEROES)) {
  const src = `assets-src/kaykit/${name}.glb`;
  const doc = await io.read(src);
  const root = doc.getRoot();
  // Dispose channels + samplers explicitly: disposing only the Animation leaves its samplers
  // holding every keyframe accessor, so prune() keeps ~1.5 MB of unused clips.
  for (const a of root.listAnimations()) {
    if (KEEP_CLIPS.has(a.getName())) continue;
    a.listChannels().forEach((c) => c.dispose());
    a.listSamplers().forEach((sm) => sm.dispose());
    a.dispose();
  }
  for (const n of root.listNodes()) {
    if (PROPS.has(n.getName()) && n.getName() !== keepProp) n.dispose();
  }
  await doc.transform(prune(), dedup(), weld(), resample({ tolerance: 1e-3 }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const out = `public/heroes/${name}.glb`;
  await io.write(out, doc);
  const clips = doc.getRoot().listAnimations().map((a) => a.getName());
  console.log(`${name}: ${(statSync(src).size / 1048576).toFixed(2)} MB → ${(statSync(out).size / 1024).toFixed(0)} KB · clips ${clips.join(",")} · prop ${keepProp}`);
}

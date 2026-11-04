// KayKit Adventurers + Skeletons (CC0, Kay Lousberg) → web-ready heroes for the walkable cinema.
// Both packs share the KayKit Rig_Medium skeleton and clip names. Keeps the 6 clips we use, one
// signature prop per hero (skeletons have none attached), then prunes, resamples, quantizes and
// meshopt-compresses. Input: assets-src/kaykit{,-skeletons}/*.glb  Output: public/heroes/*.glb
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { mkdirSync, statSync, copyFileSync } from "node:fs";

const KEEP_CLIPS = new Set(["Idle", "Walking_A", "Sit_Chair_Down", "Sit_Chair_Idle", "Cheer", "Interact"]);
// name → [source folder, signature prop or null]
const HEROES = {
  Knight: ["kaykit", "1H_Sword"],
  Barbarian: ["kaykit", "1H_Axe"],
  Mage: ["kaykit", "2H_Staff"],
  Rogue: ["kaykit", "Knife"],
  Rogue_Hooded: ["kaykit", "Knife"],
  Skeleton_Warrior: ["kaykit-skeletons", null],
  Skeleton_Mage: ["kaykit-skeletons", null],
  Skeleton_Rogue: ["kaykit-skeletons", null],
  Skeleton_Minion: ["kaykit-skeletons", null],
};
// Every prop the pack attaches to the hands; all but the signature one are removed.
const PROPS = new Set(["1H_Sword_Offhand", "Badge_Shield", "Rectangle_Shield", "Round_Shield", "Spike_Shield", "1H_Sword", "2H_Sword",
  "1H_Axe_Offhand", "Barbarian_Round_Shield", "1H_Axe", "2H_Axe", "Mug", "Spellbook", "Spellbook_open", "1H_Wand", "2H_Staff",
  "Knife_Offhand", "1H_Crossbow", "2H_Crossbow", "Knife", "Throwable"]);

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
mkdirSync("public/heroes", { recursive: true });
copyFileSync("assets-src/kaykit/LICENSE.txt", "public/heroes/LICENSE-KayKit.txt");
copyFileSync("assets-src/kaykit-skeletons/LICENSE.txt", "public/heroes/LICENSE-KayKit-Skeletons.txt");

for (const [name, [dir, keepProp]] of Object.entries(HEROES)) {
  const src = `assets-src/${dir}/${name}.glb`;
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
  console.log(`${name}: ${(statSync(src).size / 1048576).toFixed(2)} MB → ${(statSync(out).size / 1024).toFixed(0)} KB · clips ${clips.join(",")} · prop ${keepProp ?? "none"}`);
}

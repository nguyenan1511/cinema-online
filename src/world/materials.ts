// PBR materials from Poly Haven CC0 textures (public/tex, made by scripts/optimize-textures.sh)
// and zone HDRIs (public/env) for image-based lighting and reflections.
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

export type TexSet = "marble_01" | "velour_velvet" | "leather_red_02" | "oak_veneer_01" | "quatrefoil_jacquard_fabric" | "fabric_pattern_07";

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

function tex(name: string, color: boolean, repeat: [number, number], aniso: number): THREE.Texture {
  const key = `${name}|${repeat.join("x")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = loader.load(`/tex/${name}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

export interface PbrOptions {
  repeat?: [number, number];
  tint?: THREE.ColorRepresentation; // multiplies the colour map
  roughness?: number; // multiplies the ARM roughness channel
  normalScale?: number;
  envMapIntensity?: number;
  /** Low tier (phones): colour map only, no normal/ARM maps. */
  lite?: boolean;
}

/** MeshStandardMaterial with colour + normal + ARM (AO/roughness/metalness packed in R/G/B). */
export function pbr(set: TexSet, o: PbrOptions = {}, aniso = 4): THREE.MeshStandardMaterial {
  const repeat = o.repeat ?? [1, 1];
  const m = new THREE.MeshStandardMaterial({
    map: tex(`${set}_Diffuse`, true, repeat, aniso),
    color: o.tint ?? 0xffffff,
    roughness: o.roughness ?? 1,
    metalness: 1, // scaled by the ARM blue channel
    envMapIntensity: o.envMapIntensity ?? 1,
  });
  if (o.lite) {
    m.metalness = 0;
  } else {
    const arm = tex(`${set}_arm`, false, repeat, aniso);
    m.aoMap = arm;
    m.roughnessMap = arm;
    m.metalnessMap = arm;
    m.normalMap = tex(`${set}_nor_gl`, false, repeat, aniso);
    const n = o.normalScale ?? 1;
    m.normalScale.set(n, n);
  }
  return m;
}

/** Equirect HDRI → PMREM env map, cached per name. */
const envCache = new Map<string, Promise<THREE.Texture>>();
export function loadEnv(renderer: THREE.WebGLRenderer, name: "cinema_lobby" | "cinema_hall"): Promise<THREE.Texture> {
  let p = envCache.get(name);
  if (!p) {
    p = new HDRLoader().loadAsync(`/env/${name}_hdri.hdr`).then((hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      pmrem.dispose();
      return env;
    });
    envCache.set(name, p);
  }
  return p;
}

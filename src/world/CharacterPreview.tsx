// Live 3D preview of your character on the intro screen (turntable under a spotlight).
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Character, LABEL_LAYER, preloadHeroes, type HeroId } from "./Character";

export function CharacterPreview({ hero, name }: { hero: HeroId; name: string }) {
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<{ setHero: (h: HeroId) => void; setName: (n: string) => void } | null>(null);

  useEffect(() => {
    const el = mount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(0, 1.3, 5.2);
    camera.lookAt(0, 1.05, 0);
    camera.layers.enable(LABEL_LAYER); // name tag
    scene.add(new THREE.HemisphereLight(0xffe8d0, 0x2b1216, 1.3));
    const key = new THREE.SpotLight(0xffe2b0, 30, 10, 0.5, 0.6);
    key.position.set(1.5, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff6a5a, 1.4);
    rim.position.set(-2, 2, -2);
    scene.add(rim);
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.08, 40), new THREE.MeshStandardMaterial({ color: 0x6e1f2a, roughness: 0.5 }));
    stage.position.y = -0.04;
    scene.add(stage);

    let ch: Character | null = null;
    let tagName = "";
    let disposed = false;
    const setHero = (h: HeroId) => {
      preloadHeroes([h]).then(() => {
        if (disposed) return;
        if (ch) scene.remove(ch.root);
        ch = new Character({ hero: h });
        if (tagName) ch.setTag(tagName, "me");
        scene.add(ch.root);
      });
    };
    api.current = { setHero, setName: (n) => { tagName = n; ch?.setTag(n || " ", "me"); } };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    addEventListener("resize", resize);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = new THREE.Timer();
    renderer.setAnimationLoop(() => {
      timer.update();
      const dt = timer.getDelta();
      if (ch) {
        if (!reduced) ch.root.rotation.y = Math.sin(timer.getElapsed() * 0.6) * 0.7;
        ch.animate(dt, 0);
      }
      renderer.render(scene, camera);
    });
    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      removeEventListener("resize", resize);
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  useEffect(() => { api.current?.setHero(hero); }, [hero]);
  useEffect(() => { api.current?.setName(name.trim()); }, [name]);

  return <div ref={mount} className="w-full h-full" aria-hidden />;
}

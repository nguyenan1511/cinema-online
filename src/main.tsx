import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { WorldApp } from "./WorldApp";

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

// The walkable 3D cinema by default; the 2D flow is the fallback without WebGL, or on demand with ?2d.
const use3D = webglAvailable() && !new URLSearchParams(location.search).has("2d");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{use3D ? <WorldApp /> : <App />}</StrictMode>,
);

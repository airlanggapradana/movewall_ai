import { Canvas } from "@react-three/fiber";
import { useState } from "react";
import { Scene } from "./Scene.jsx";
import { useLatestMediaPipePose } from "./hooks/useLatestMediaPipePose.js";

export default function AppleArcher3D() {
  const [activeArm, setActiveArm] = useState("right");
  const [modelReady, setModelReady] = useState(() => window.__APPLE_ARCHER_MODEL_READY__ === true);
  const poseResult = useLatestMediaPipePose();

  return (
    <main className="r3f-shell" data-active-arm={activeArm}>
      <div className="r3f-arm-switch" aria-label="Active rehabilitation arm">
        <button
          className={activeArm === "left" ? "active" : ""}
          type="button"
          onClick={() => setActiveArm("left")}
        >
          Left
        </button>
        <button
          className={activeArm === "right" ? "active" : ""}
          type="button"
          onClick={() => setActiveArm("right")}
        >
          Right
        </button>
      </div>
      {!modelReady && <div className="r3f-loading">Loading 3D archer...</div>}
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 2.35, 6.5], fov: 42, near: 0.1, far: 120 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: import.meta.env.DEV,
        }}
        onCreated={({ gl }) => {
          gl.setClearAlpha(0);
        }}
      >
        <Scene activeArm={activeArm} poseResult={poseResult} onModelReady={() => setModelReady(true)} />
      </Canvas>
    </main>
  );
}

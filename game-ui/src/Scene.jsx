import { Sky } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { Character } from "./Character.jsx";
import { GameplayManager } from "./GameplayManager.jsx";

export function Scene({ activeArm, onModelReady, poseResult }) {
  const { camera } = useThree();
  const sunRef = useRef(null);
  const cameraTarget = useMemo(() => new THREE.Vector3(0, 1.32, -4.2), []);
  const cameraPosition = useMemo(() => new THREE.Vector3(0, 2.28, 6.65), []);

  useFrame(({ clock }) => {
    camera.position.copy(cameraPosition);
    camera.lookAt(cameraTarget);

    if (sunRef.current) {
      const pulse = Math.sin(clock.elapsedTime * 0.35) * 0.18;
      sunRef.current.position.set(4.5, 8 + pulse, 3.2);
      sunRef.current.intensity = 2.85 + pulse;
    }
  });

  return (
    <>
      <color attach="background" args={["#94cdec"]} />
      <fog attach="fog" args={["#bde5f4", 24, 62]} />

      <Sky
        distance={450000}
        sunPosition={[4.5, 8, 3.2]}
        inclination={0.48}
        azimuth={0.18}
        mieCoefficient={0.006}
        turbidity={8}
      />

      <hemisphereLight args={["#fff2cf", "#2e653d", 1.35]} />
      <directionalLight
        ref={sunRef}
        castShadow
        intensity={2.9}
        position={[4.5, 8, 3.2]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={34}
      />

      <Terrain />
      <RangeMarkers activeArm={activeArm} />

      <Suspense fallback={null}>
        <Character activeArm={activeArm} onReady={onModelReady} poseResult={poseResult} />
      </Suspense>

      <GameplayManager activeArm={activeArm} poseResult={poseResult} />
    </>
  );
}

function Terrain() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[34, 52, 48, 48]} />
      <meshStandardMaterial color="#4f9a44" roughness={0.92} metalness={0} />
    </mesh>
  );
}

function RangeMarkers({ activeArm }) {
  const side = activeArm === "right" ? 1 : -1;
  const shoulderX = activeArm === "right" ? 0.34 : -0.34;

  return (
    <group>
      {[30, 60, 90, 120, 150].map((angle) => {
        const radians = angle * Math.PI / 180;
        return (
          <mesh
            key={angle}
            position={[shoulderX + side * (0.22 + Math.sin(radians) * 1.18), 0.02, -4.75 - Math.cos(radians) * 0.15]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.16, 0.18, 32]} />
            <meshBasicMaterial color="#f3efc6" transparent opacity={0.42} />
          </mesh>
        );
      })}
    </group>
  );
}

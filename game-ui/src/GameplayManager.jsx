import { Billboard, Html, Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { ROM_TOLERANCE } from "./gameplay/clinicalRom.js";
import { useClinicalGameplay } from "./hooks/useClinicalGameplay.js";

const UP = new THREE.Vector3(0, 1, 0);

export function GameplayManager({ activeArm, poseResult }) {
  const gameplay = useClinicalGameplay({ poseResult, activeArm });

  if (typeof window !== "undefined") {
    window.__APPLE_ARCHER_CLINICAL_STATE__ = gameplay;
  }

  return (
    <>
      <AppleTarget
        position={gameplay.applePosition}
        progress={gameplay.holdProgress}
        status={gameplay.status}
        targetAngle={gameplay.targetAngle}
      />
      <AntiGravityArrow
        from={gameplay.drawHandPosition}
        to={gameplay.applePosition}
        flight={gameplay.arrow}
      />
      <ClinicalReadout gameplay={gameplay} />
    </>
  );
}

function AppleTarget({ position, progress, status, targetAngle }) {
  const ringColor = status === "holding" ? "#1fd176" : "#f7f2d4";

  return (
    <group position={position}>
      <mesh castShadow>
        <sphereGeometry args={[0.22, 32, 24]} />
        <meshStandardMaterial color="#cc3430" roughness={0.5} />
      </mesh>
      <mesh position={[0.04, 0.2, 0]} rotation={[0.2, 0, -0.7]} scale={[1.7, 0.75, 0.42]} castShadow>
        <sphereGeometry args={[0.055, 16, 8]} />
        <meshStandardMaterial color="#3b8d3d" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation={[0.15, 0, 0.2]} castShadow>
        <cylinderGeometry args={[0.015, 0.018, 0.22, 8]} />
        <meshStandardMaterial color="#654126" roughness={0.85} />
      </mesh>
      <Billboard position={[0, 0, 0.04]}>
        <ProgressRing progress={progress} color={ringColor} />
        <Html center position={[0, -0.52, 0]} transform distanceFactor={7}>
          <div className="clinical-apple-label">{targetAngle}&deg;</div>
        </Html>
      </Billboard>
    </group>
  );
}

function ProgressRing({ progress, color }) {
  const points = useMemo(() => {
    const arc = Math.max(0.001, progress) * Math.PI * 2;
    return Array.from({ length: 48 }, (_, index) => {
      const theta = -Math.PI / 2 + arc * (index / 47);
      return [Math.cos(theta) * 0.38, Math.sin(theta) * 0.38, 0];
    });
  }, [progress]);

  return (
    <group>
      <mesh>
        <torusGeometry args={[0.38, 0.012, 8, 72]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.32} />
      </mesh>
      <Line points={points} color={color} lineWidth={4} />
    </group>
  );
}

function AntiGravityArrow({ from, to, flight }) {
  const start = flight?.from ?? from;
  const end = flight?.to ?? to;
  const progress = flight?.progress ?? 0;
  const position = useMemo(() => {
    const fromVec = new THREE.Vector3(...start);
    const toVec = new THREE.Vector3(...end);
    return flight ? fromVec.lerp(toVec, progress) : fromVec;
  }, [end, flight, progress, start]);
  const quaternion = useMemo(() => {
    const direction = new THREE.Vector3(...end).sub(new THREE.Vector3(...start)).normalize();
    return new THREE.Quaternion().setFromUnitVectors(UP, direction);
  }, [end, start]);

  return (
    <group position={position} quaternion={quaternion}>
      <mesh position={[0, 0.34, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.68, 10]} />
        <meshStandardMaterial color="#4a2d1d" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow>
        <coneGeometry args={[0.055, 0.13, 14]} />
        <meshStandardMaterial color="#d8d2c7" metalness={0.25} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.03, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <boxGeometry args={[0.13, 0.035, 0.015]} />
        <meshStandardMaterial color="#cf4d4d" roughness={0.75} />
      </mesh>
    </group>
  );
}

function ClinicalReadout({ gameplay }) {
  return (
    <Html position={[0, 2.95, -3.4]} center transform distanceFactor={8}>
      <div className="clinical-readout">
        <strong>Level {gameplay.level}</strong>
        <span>Hits {gameplay.hits}/10</span>
        <span>ROM {Math.round(gameplay.currentROM)}&deg;</span>
        <span>Target {gameplay.targetAngle}&deg; +/- {ROM_TOLERANCE}&deg;</span>
        <span>Hold {gameplay.holdTime.toFixed(1)}s</span>
      </div>
    </Html>
  );
}

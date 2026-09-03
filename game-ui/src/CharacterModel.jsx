import { useFBX } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import erikaArcherUrl from "../assets/erika-archer-with-bow-arrow.fbx?url";
import { useMixamoPoseRig } from "./hooks/useMixamoPoseRig.js";

export function CharacterModel({
  activeArm = "right",
  poseResult,
  modelUrl = erikaArcherUrl,
  position = [0, 0, 0],
  rotation = [0, Math.PI, 0],
}) {
  const sourceFbx = useFBX(modelUrl);
  const avatar = useMemo(() => clone(sourceFbx), [sourceFbx]);
  const rootRef = useRef(null);

  useEffect(() => {
    avatar.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        child.material = prepareMaterial(child.material);
      }
    });

    const box = new THREE.Box3().setFromObject(avatar);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 1.72 / Math.max(size.y, 0.001);

    avatar.scale.setScalar(scale);
    avatar.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    window.__APPLE_ARCHER_MODEL_READY__ = true;
  }, [avatar]);

  useMixamoPoseRig(rootRef, poseResult, {
    activeArm,
    mirrorX: true,
    smoothing: 0.42,
  });

  return (
    <group ref={rootRef} position={position} rotation={rotation}>
      <primitive object={avatar} />
    </group>
  );
}

function prepareMaterial(material) {
  if (Array.isArray(material)) return material.map(prepareMaterial);
  if (!material) return material;

  const cloned = material.clone();
  cloned.side = THREE.DoubleSide;
  cloned.roughness = Math.max(cloned.roughness ?? 0.6, 0.55);
  cloned.needsUpdate = true;
  return cloned;
}

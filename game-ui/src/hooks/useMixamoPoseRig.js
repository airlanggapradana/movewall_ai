import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const MP = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
};

const BONE_NAMES = {
  hips: "mixamorig:Hips",
  spine: "mixamorig:Spine",
  spine1: "mixamorig:Spine1",
  spine2: "mixamorig:Spine2",
  neck: "mixamorig:Neck",
  head: "mixamorig:Head",
  leftShoulder: "mixamorig:LeftShoulder",
  leftUpperArm: "mixamorig:LeftArm",
  leftForeArm: "mixamorig:LeftForeArm",
  leftHand: "mixamorig:LeftHand",
  rightShoulder: "mixamorig:RightShoulder",
  rightUpperArm: "mixamorig:RightArm",
  rightForeArm: "mixamorig:RightForeArm",
  rightHand: "mixamorig:RightHand",
};

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpParentQ = new THREE.Quaternion();
const tmpTargetQ = new THREE.Quaternion();

export function useMixamoPoseRig(rootRef, poseResult, options = {}) {
  const restPoseRef = useRef(null);
  const lastPoseRef = useRef(null);
  const opts = useMemo(
    () => ({
      mirrorX: options.mirrorX ?? true,
      smoothing: options.smoothing ?? 0.38,
      minVisibility: options.minVisibility ?? 0.18,
    }),
    [options.minVisibility, options.mirrorX, options.smoothing],
  );

  lastPoseRef.current = extractLandmarks(poseResult);

  useFrame(() => {
    const root = rootRef.current;
    const landmarks = lastPoseRef.current;
    if (!root || !landmarks) return;

    if (!restPoseRef.current) {
      restPoseRef.current = captureMixamoRestPose(root);
    }

    applyPoseToMixamo(root, restPoseRef.current, landmarks, opts);
  });
}

function captureMixamoRestPose(root) {
  root.updateWorldMatrix(true, true);

  const bones = {};
  root.traverse((child) => {
    if (child.isBone) bones[child.name] = child;
  });

  const rest = {};
  Object.entries(BONE_NAMES).forEach(([key, boneName]) => {
    const bone = bones[boneName];
    if (!bone) return;

    const child = findFirstBoneChild(bone);
    rest[key] = {
      bone,
      initialLocalQuaternion: bone.quaternion.clone(),
      initialWorldQuaternion: bone.getWorldQuaternion(new THREE.Quaternion()),
      restDirectionWorld: child ? directionBetweenObjects(bone, child) : new THREE.Vector3(0, 1, 0),
    };
  });

  return rest;
}

function applyPoseToMixamo(root, rest, landmarks, options) {
  const pose = buildPoseVectors(landmarks, options);
  if (!pose) return;

  resetTrackedBones(rest);

  align(rest.leftShoulder, pose.leftClavicle, options.smoothing);
  align(rest.rightShoulder, pose.rightClavicle, options.smoothing);
  root.updateWorldMatrix(true, true);

  align(rest.spine, pose.spine, options.smoothing * 0.55);
  align(rest.spine1, pose.spine, options.smoothing * 0.45);
  align(rest.spine2, pose.spine, options.smoothing * 0.35);
  root.updateWorldMatrix(true, true);

  align(rest.leftUpperArm, pose.leftUpperArm, options.smoothing);
  root.updateWorldMatrix(true, true);
  align(rest.leftForeArm, pose.leftForeArm, options.smoothing);
  root.updateWorldMatrix(true, true);

  align(rest.rightUpperArm, pose.rightUpperArm, options.smoothing);
  root.updateWorldMatrix(true, true);
  align(rest.rightForeArm, pose.rightForeArm, options.smoothing);
  root.updateWorldMatrix(true, true);

  twistHand(rest.leftHand, pose.leftForeArm, options.smoothing * 0.65);
  twistHand(rest.rightHand, pose.rightForeArm, options.smoothing * 0.65);
}

function resetTrackedBones(rest) {
  Object.values(rest).forEach((entry) => {
    entry.bone.quaternion.slerp(entry.initialLocalQuaternion, 0.08);
  });
}

function align(entry, targetDirection, smoothing) {
  if (!entry || !targetDirection) return;

  const target = targetDirection.clone().normalize();
  if (target.lengthSq() < 0.000001) return;

  tmpQ.setFromUnitVectors(entry.restDirectionWorld, target);
  tmpTargetQ.copy(tmpQ).multiply(entry.initialWorldQuaternion);

  entry.bone.parent.getWorldQuaternion(tmpParentQ).invert();
  tmpTargetQ.premultiply(tmpParentQ);
  entry.bone.quaternion.slerp(tmpTargetQ, THREE.MathUtils.clamp(smoothing, 0, 1));
}

function twistHand(entry, forearmDirection, smoothing) {
  align(entry, forearmDirection, smoothing);
}

function buildPoseVectors(landmarks, options) {
  if (!hasRequiredVisibility(landmarks, options.minVisibility)) return null;

  const leftShoulder = landmarkToThree(landmarks[MP.leftShoulder], options);
  const rightShoulder = landmarkToThree(landmarks[MP.rightShoulder], options);
  const leftElbow = landmarkToThree(landmarks[MP.leftElbow], options);
  const rightElbow = landmarkToThree(landmarks[MP.rightElbow], options);
  const leftWrist = landmarkToThree(landmarks[MP.leftWrist], options);
  const rightWrist = landmarkToThree(landmarks[MP.rightWrist], options);
  const leftHip = landmarkToThree(landmarks[MP.leftHip], options);
  const rightHip = landmarkToThree(landmarks[MP.rightHip], options);

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);

  return {
    spine: direction(hipMid, shoulderMid),
    leftClavicle: direction(shoulderMid, leftShoulder),
    rightClavicle: direction(shoulderMid, rightShoulder),
    leftUpperArm: direction(leftShoulder, leftElbow),
    leftForeArm: direction(leftElbow, leftWrist),
    rightUpperArm: direction(rightShoulder, rightElbow),
    rightForeArm: direction(rightElbow, rightWrist),
  };
}

function extractLandmarks(result) {
  if (!result) return null;
  if (Array.isArray(result) && result.length >= 33) return result;

  return (
    result.worldLandmarks?.[0] ??
    result.poseWorldLandmarks?.[0] ??
    result.landmarks?.[0] ??
    result.poseLandmarks ??
    null
  );
}

function hasRequiredVisibility(landmarks, minVisibility) {
  const required = [
    MP.leftShoulder,
    MP.rightShoulder,
    MP.leftElbow,
    MP.rightElbow,
    MP.leftWrist,
    MP.rightWrist,
    MP.leftHip,
    MP.rightHip,
  ];

  return required.every((index) => {
    const landmark = landmarks[index];
    return landmark && (landmark.visibility == null || landmark.visibility >= minVisibility);
  });
}

function landmarkToThree(landmark, options) {
  const mirror = options.mirrorX ? -1 : 1;
  return new THREE.Vector3(
    landmark.x * mirror,
    -landmark.y,
    -(landmark.z ?? 0),
  );
}

function midpoint(a, b) {
  return tmpA.copy(a).add(b).multiplyScalar(0.5).clone();
}

function direction(from, to) {
  return tmpB.copy(to).sub(from).normalize().clone();
}

function findFirstBoneChild(bone) {
  return bone.children.find((child) => child.isBone) ?? null;
}

function directionBetweenObjects(from, to) {
  from.getWorldPosition(tmpA);
  to.getWorldPosition(tmpB);
  return tmpC.copy(tmpB).sub(tmpA).normalize().clone();
}

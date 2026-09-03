export const ROM_TARGETS = [30, 45, 60, 75, 90, 105, 120, 135, 150, 165];
export const HOLD_SECONDS = 3;
export const ROM_TOLERANCE = 5;

const MP = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
};

export function getLevelForHits(hits) {
  return hits < 5 ? 1 : 2;
}

export function getTargetAngleForHits(hits) {
  return ROM_TARGETS[Math.min(hits, ROM_TARGETS.length - 1)];
}

export function getApplePositionForAngle(targetAngle, activeArm) {
  const shoulder = getShoulderOrigin(activeArm);
  const side = getArmSide(activeArm);
  const radians = degreesToRadians(targetAngle);

  return [
    shoulder[0] + side * (0.22 + Math.sin(radians) * 1.18),
    shoulder[1] - Math.cos(radians) * 1.48,
    -4.75,
  ];
}

export function getDrawHandPositionForAngle(currentROM, activeArm) {
  const shoulder = getShoulderOrigin(activeArm);
  const side = getArmSide(activeArm);
  const radians = degreesToRadians(Math.max(0, Math.min(180, currentROM || 0)));

  return [
    shoulder[0] + side * Math.sin(radians) * 0.82,
    shoulder[1] - Math.cos(radians) * 0.72,
    0.46,
  ];
}

export function isInsideRomTarget(currentROM, targetAngle) {
  return Math.abs(currentROM - targetAngle) <= ROM_TOLERANCE;
}

export function extractCurrentROM(poseResult, activeArm) {
  const landmarks = extractLandmarks(poseResult);
  if (!landmarks) return null;

  const ids = activeArm === "left"
    ? {
        shoulder: MP.leftShoulder,
        elbow: MP.leftElbow,
        wrist: MP.leftWrist,
        hip: MP.leftHip,
      }
    : {
        shoulder: MP.rightShoulder,
        elbow: MP.rightElbow,
        wrist: MP.rightWrist,
        hip: MP.rightHip,
      };

  const shoulder = landmarks[ids.shoulder];
  const elbow = landmarks[ids.elbow];
  const wrist = landmarks[ids.wrist];
  const hip = landmarks[ids.hip];
  const confidence = Math.min(
    shoulder?.visibility ?? 1,
    elbow?.visibility ?? 1,
    wrist?.visibility ?? 1,
  );

  if (!shoulder || !elbow || !wrist || !hip || confidence < 0.15) return null;

  const torsoDown = {
    x: hip.x - shoulder.x,
    y: hip.y - shoulder.y,
  };
  const activeArmVector = {
    x: wrist.x - shoulder.x,
    y: wrist.y - shoulder.y,
  };

  return angleBetween2d(torsoDown, activeArmVector);
}

export function getArmSide(activeArm) {
  return activeArm === "right" ? 1 : -1;
}

function getShoulderOrigin(activeArm) {
  return activeArm === "right" ? [0.34, 1.36, 0.08] : [-0.34, 1.36, 0.08];
}

function extractLandmarks(result) {
  if (!result) return null;
  if (Array.isArray(result) && result.length >= 33) return result;

  return (
    result.landmarks?.[0] ??
    result.poseLandmarks ??
    result.worldLandmarks?.[0] ??
    result.poseWorldLandmarks?.[0] ??
    null
  );
}

function angleBetween2d(a, b) {
  const aLength = Math.hypot(a.x, a.y);
  const bLength = Math.hypot(b.x, b.y);
  if (aLength < 0.00001 || bLength < 0.00001) return 0;

  const dot = a.x * b.x + a.y * b.y;
  const cosine = Math.max(-1, Math.min(1, dot / (aLength * bLength)));
  return Math.acos(cosine) * 180 / Math.PI;
}

function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}

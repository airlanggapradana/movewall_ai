import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HOLD_SECONDS,
  extractCurrentROM,
  getApplePositionForAngle,
  getDrawHandPositionForAngle,
  getLevelForHits,
  getTargetAngleForHits,
  isInsideRomTarget,
} from "../gameplay/clinicalRom.js";

function createSnapshot(activeArm) {
  const targetAngle = getTargetAngleForHits(0);
  const currentROM = 0;

  return {
    activeArm,
    hits: 0,
    level: 1,
    targetAngle,
    currentROM,
    holdTime: 0,
    holdProgress: 0,
    status: "waiting",
    completed: false,
    applePosition: getApplePositionForAngle(targetAngle, activeArm),
    drawHandPosition: getDrawHandPositionForAngle(currentROM, activeArm),
    arrow: null,
  };
}

export function useClinicalGameplay({ poseResult, activeArm, onSessionComplete }) {
  const poseRef = useRef(poseResult);
  const snapshotRef = useRef(createSnapshot(activeArm));
  const [snapshot, setSnapshot] = useState(snapshotRef.current);

  poseRef.current = poseResult;

  useEffect(() => {
    const next = createSnapshot(activeArm);
    snapshotRef.current = next;
    setSnapshot(next);
  }, [activeArm]);

  const commit = useCallback((next) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const shootArrow = useCallback(() => {
    const current = snapshotRef.current;
    if (current.completed || current.arrow) return;

    commit({
      ...current,
      status: "shooting",
      holdTime: HOLD_SECONDS,
      holdProgress: 1,
      arrow: {
        from: current.drawHandPosition,
        to: current.applePosition,
        progress: 0,
      },
    });
  }, [commit]);

  useFrame((_, delta) => {
    const current = snapshotRef.current;
    if (current.completed) return;

    if (current.arrow) {
      const progress = Math.min(1, current.arrow.progress + delta * 1.65);

      if (progress >= 1) {
        const hits = current.hits + 1;
        const completed = hits >= 10;
        const targetAngle = getTargetAngleForHits(hits);
        const next = {
          ...current,
          hits,
          level: getLevelForHits(hits),
          targetAngle,
          holdTime: 0,
          holdProgress: 0,
          status: completed ? "complete" : "waiting",
          completed,
          applePosition: getApplePositionForAngle(targetAngle, activeArm),
          drawHandPosition: getDrawHandPositionForAngle(current.currentROM, activeArm),
          arrow: null,
        };

        commit(next);
        if (completed) onSessionComplete?.(next);
        return;
      }

      commit({
        ...current,
        arrow: {
          ...current.arrow,
          progress,
        },
      });
      return;
    }

    const measuredROM = extractCurrentROM(poseRef.current, activeArm);

    if (measuredROM == null && current.status === "waiting") return;

    const currentROM = measuredROM ?? current.currentROM;
    const targetAngle = getTargetAngleForHits(current.hits);
    const insideTarget = measuredROM != null && isInsideRomTarget(currentROM, targetAngle);
    const holdTime = insideTarget ? Math.min(HOLD_SECONDS, current.holdTime + delta) : 0;
    const holdProgress = holdTime / HOLD_SECONDS;
    const next = {
      ...current,
      currentROM,
      targetAngle,
      level: getLevelForHits(current.hits),
      holdTime,
      holdProgress,
      status: measuredROM == null ? "waiting" : insideTarget ? "holding" : "aiming",
      applePosition: getApplePositionForAngle(targetAngle, activeArm),
      drawHandPosition: getDrawHandPositionForAngle(currentROM, activeArm),
    };

    if (shouldCommitFrame(current, next)) commit(next);
    if (holdTime >= HOLD_SECONDS) shootArrow();
  });

  return {
    ...snapshot,
    shootArrow,
  };
}

function shouldCommitFrame(current, next) {
  return (
    current.status !== next.status ||
    current.level !== next.level ||
    current.targetAngle !== next.targetAngle ||
    Math.abs(current.currentROM - next.currentROM) >= 0.25 ||
    Math.abs(current.holdTime - next.holdTime) >= 0.016
  );
}

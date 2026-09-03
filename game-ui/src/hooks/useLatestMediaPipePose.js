import { useEffect, useState } from "react";

const POSE_EVENT = "apple-archer:pose";

export function publishMediaPipePose(result) {
  window.__APPLE_ARCHER_LAST_POSE__ = result;
  window.dispatchEvent(new CustomEvent(POSE_EVENT, { detail: result }));
}

export function useLatestMediaPipePose() {
  const [poseResult, setPoseResult] = useState(() => window.__APPLE_ARCHER_LAST_POSE__ ?? null);

  useEffect(() => {
    const onPose = (event) => setPoseResult(event.detail ?? null);
    window.addEventListener(POSE_EVENT, onPose);
    return () => window.removeEventListener(POSE_EVENT, onPose);
  }, []);

  return poseResult;
}

export { POSE_EVENT };

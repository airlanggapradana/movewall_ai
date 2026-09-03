import { CharacterModel } from "./CharacterModel.jsx";

export function Character({ activeArm, onReady, poseResult }) {
  const handednessScale = activeArm === "left" ? -1 : 1;

  return (
    <group position={[0, 0, 0]} scale={[handednessScale, 1, 1]}>
      <CharacterModel
        activeArm={activeArm}
        onReady={onReady}
        poseResult={poseResult}
        position={[0, 0, 0]}
        rotation={[0, Math.PI, 0]}
      />
    </group>
  );
}

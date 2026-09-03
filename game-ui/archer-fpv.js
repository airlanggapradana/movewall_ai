import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

// ── Asset URLs ──────────────────────────────────────────────────────────────
const MODEL_URL       = "./assets/erika-archer-with-bow-arrow.fbx";
const ANIM_IDLE_URL   = "./assets/Standing Aim Idle 01.fbx";
const ANIM_RECOIL_URL = "./assets/Standing Aim Recoil.fbx";

// Y offset so character feet sit at ground level of the background
const FPV_RIG_BASE_Y  = -1.05;

const canvas = document.getElementById("archerFpvCanvas");
const host   = canvas?.closest(".projection");

if (canvas && host) initFirstPersonArcher();

// ── Expose state for app.js to trigger recoil on hit ───────────────────────
window.__archerFPV__ = { triggerRecoil: null };

function initFirstPersonArcher() {
  // ── Renderer ──────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  // ── Scene / Camera ────────────────────────────────────────────────────────
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  camera.position.set(0.28, 0.60, 3.55);
  camera.lookAt(0, 0.05, 0);

  // ── Character rig (position + breathing sway) ─────────────────────────────
  const rig = new THREE.Group();
  rig.position.set(0, FPV_RIG_BASE_Y, 0);
  rig.rotation.y = 0;
  scene.add(rig);

  // ── Lighting — warm orchard sun from upper-right ──────────────────────────
  scene.add(new THREE.HemisphereLight(0xfff3d0, 0x2d5a2d, 2.6));

  const sunLight = new THREE.DirectionalLight(0xfff4d6, 3.2);
  sunLight.position.set(4, 7, 3);
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0xb8d8ff, 0.7);
  fillLight.position.set(-3, 2, 2);
  scene.add(fillLight);

  // ── State ─────────────────────────────────────────────────────────────────
  const clock        = new THREE.Clock();
  let   loadFailed   = false;
  let   mixer        = null;
  let   actionIdle   = null;
  let   actionRecoil = null;
  let   recoilActive = false;

  // ── Load model + animations in parallel ───────────────────────────────────
  const loader = new FBXLoader();
  let   fbxModel     = null;
  let   clipIdle     = null;
  let   clipRecoil   = null;
  let   pendingLoads = 3; // model + idle + recoil

  function onAllLoaded() {
    if (fbxModel === null) return; // model not yet ready

    // Attach model to rig
    rig.add(fbxModel);
    fbxModel.updateMatrixWorld(true);

    // Create mixer on the model root
    mixer = new THREE.AnimationMixer(fbxModel);

    // ── Play idle animation (loop forever) ──────────────────────────────
    if (clipIdle) {
      actionIdle = mixer.clipAction(clipIdle);
      actionIdle.setLoop(THREE.LoopRepeat, Infinity);
      actionIdle.play();
      console.log("[MoveWall] Playing idle:", clipIdle.name, `${clipIdle.duration.toFixed(2)}s`);
    } else {
      console.warn("[MoveWall] Idle clip not available");
    }

    // ── Preload recoil (paused, ready to trigger) ────────────────────────
    if (clipRecoil) {
      actionRecoil = mixer.clipAction(clipRecoil);
      actionRecoil.setLoop(THREE.LoopOnce, 1);
      actionRecoil.clampWhenFinished = true;
      actionRecoil.enabled = true;
      actionRecoil.weight  = 0;
      console.log("[MoveWall] Recoil clip ready:", clipRecoil.name, `${clipRecoil.duration.toFixed(2)}s`);
    }

    // ── Expose recoil trigger to app.js ─────────────────────────────────
    window.__archerFPV__.triggerRecoil = () => {
      if (!actionRecoil || !actionIdle || recoilActive) return;
      recoilActive = true;

      // Cross-fade from idle → recoil
      actionRecoil.reset();
      actionRecoil.play();
      actionIdle.crossFadeTo(actionRecoil, 0.12, true);

      // Return to idle after recoil finishes
      const recoilDuration = (clipRecoil.duration / actionRecoil.getEffectiveTimeScale()) * 1000;
      setTimeout(() => {
        actionRecoil.crossFadeTo(actionIdle, 0.18, true);
        recoilActive = false;
      }, recoilDuration - 180);
    };

    canvas.classList.add("model-ready");
    resize();
    animate();
  }

  // ── Load character model ─────────────────────────────────────────────────
  loader.load(
    MODEL_URL,
    (fbx) => {
      fbxModel = prepareModel(fbx);
      pendingLoads -= 1;
      if (pendingLoads === 0) onAllLoaded();
    },
    undefined,
    (err) => {
      console.warn("[MoveWall] Model load failed:", err);
      loadFailed = true;
      canvas.classList.add("model-failed");
    },
  );

  // ── Load Standing Aim Idle 01 ────────────────────────────────────────────
  loader.load(
    ANIM_IDLE_URL,
    (fbx) => {
      if (fbx.animations?.length) {
        clipIdle = fbx.animations[0];
        clipIdle.name = "AimIdle";
        console.log("[MoveWall] Idle clip loaded:", `${clipIdle.duration.toFixed(2)}s`, clipIdle.tracks.length, "tracks");
      } else {
        console.warn("[MoveWall] No animation in idle FBX");
      }
      pendingLoads -= 1;
      if (pendingLoads === 0) onAllLoaded();
    },
    undefined,
    (err) => {
      console.warn("[MoveWall] Idle anim load failed:", err);
      pendingLoads -= 1;
      if (pendingLoads === 0) onAllLoaded();
    },
  );

  // ── Load Standing Aim Recoil ─────────────────────────────────────────────
  loader.load(
    ANIM_RECOIL_URL,
    (fbx) => {
      if (fbx.animations?.length) {
        clipRecoil = fbx.animations[0];
        clipRecoil.name = "AimRecoil";
        console.log("[MoveWall] Recoil clip loaded:", `${clipRecoil.duration.toFixed(2)}s`, clipRecoil.tracks.length, "tracks");
      } else {
        console.warn("[MoveWall] No animation in recoil FBX");
      }
      pendingLoads -= 1;
      if (pendingLoads === 0) onAllLoaded();
    },
    undefined,
    (err) => {
      console.warn("[MoveWall] Recoil anim load failed:", err);
      pendingLoads -= 1;
      if (pendingLoads === 0) onAllLoaded();
    },
  );

  // ── Resize observer ───────────────────────────────────────────────────────
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  window.addEventListener("resize", resize);

  // ── Prepare model: scale, center, materials ───────────────────────────────
  function prepareModel(fbx) {
    const box    = new THREE.Box3().setFromObject(fbx);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scale  = 2.1 / maxDim;

    fbx.scale.setScalar(scale);
    fbx.position.set(
      -center.x * scale,
      -center.y * scale,
      -center.z * scale,
    );

    fbx.traverse((child) => {
      if (!child.isMesh) return;
      child.visible        = true;
      child.frustumCulled  = false;
      child.castShadow     = false;
      child.receiveShadow  = false;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.filter(Boolean).forEach((m) => {
        m.side       = THREE.DoubleSide;
        m.needsUpdate = true;
      });
    });

    return fbx;
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function animate(now = 0) {
    if (loadFailed) return;
    requestAnimationFrame(animate);

    const dt     = Math.min(clock.getDelta(), 0.05);
    const breath = Math.sin(now / 1200) * 0.006;

    if (mixer) mixer.update(dt);

    // Subtle idle sway / breathing on the rig
    rig.position.x = Math.sin(now / 2000) * 0.004;
    rig.position.y = FPV_RIG_BASE_Y + breath;
    rig.rotation.y = Math.sin(now / 2600) * 0.003;

    renderer.render(scene, camera);
  }
}

import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const MODEL_URL = "./assets/erika-archer-with-bow-arrow.fbx";
const FPV_MESH_PATTERN = /(Bow|Arrow)/i;
const FPV_MATERIAL_PATTERN = /(Bow|Arrow)_MAT/i;
const FPV_RIG_BASE_Y = -0.92;

const canvas = document.getElementById("archerFpvCanvas");
const host = canvas?.closest(".projection");

if (canvas && host) {
  initFirstPersonArcher();
}

function initFirstPersonArcher() {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
  camera.position.set(0, 0.02, 3.25);
  camera.lookAt(0, 0, 0);

  const rig = new THREE.Group();
  rig.position.set(0, FPV_RIG_BASE_Y, 0);
  rig.rotation.y = 0;
  scene.add(rig);

  scene.add(new THREE.HemisphereLight(0xfff7d6, 0x355038, 2.1));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.35);
  keyLight.position.set(-2.5, 3.5, -2.2);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xffd28a, 1.35);
  rimLight.position.set(2.5, 1.8, 2.5);
  scene.add(rimLight);

  let model = null;
  let mixer = null;
  const clock = new THREE.Clock();
  let loadFailed = false;

  const loader = new FBXLoader();
  loader.load(
    MODEL_URL,
    (fbx) => {
      model = prepareModel(fbx);
      mixer = startModelAnimation(fbx);
      rig.add(model);
      canvas.classList.add("model-ready");
      resize();
      animate();
    },
    undefined,
    (error) => {
      loadFailed = true;
      canvas.classList.add("model-failed");
      console.warn("MoveWall FPV archer model failed to load:", error);
    },
  );

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  window.addEventListener("resize", resize);

  function prepareModel(fbx) {
    const hasWeaponMaterials = modelHasWeaponMaterials(fbx);
    const focusMeshes = [];
    fbx.traverse((child) => {
      if (child.isMesh && isFirstPersonWeaponMesh(child, hasWeaponMaterials)) {
        focusMeshes.push(child);
      }
    });

    const box = new THREE.Box3();
    if (focusMeshes.length) {
      focusMeshes.forEach((mesh) => box.expandByObject(mesh));
    } else {
      box.setFromObject(fbx);
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const normalizedScale = 2.25 / maxDim;

    fbx.scale.setScalar(normalizedScale);
    fbx.position.set(
      -center.x * normalizedScale,
      -center.y * normalizedScale,
      -center.z * normalizedScale,
    );

    fbx.traverse((child) => {
      if (!child.isMesh) return;
      child.visible = focusMeshes.length ? isFirstPersonWeaponMesh(child, hasWeaponMaterials) : true;
      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => {
        material.side = THREE.DoubleSide;
        material.needsUpdate = true;
      });
    });

    return fbx;
  }

  function modelHasWeaponMaterials(root) {
    let found = false;
    root.traverse((child) => {
      if (!child.isMesh || found) return;
      found = hasFirstPersonWeaponMaterial(child);
    });
    return found;
  }

  function hasFirstPersonWeaponMaterial(mesh) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.some((material) => FPV_MATERIAL_PATTERN.test(material?.name || ""));
  }

  function isFirstPersonWeaponMesh(mesh, hasWeaponMaterials) {
    if (hasWeaponMaterials) return hasFirstPersonWeaponMaterial(mesh);
    return FPV_MESH_PATTERN.test(mesh.name || "");
  }

  function startModelAnimation(fbx) {
    if (!fbx.animations?.length) return null;

    const animationMixer = new THREE.AnimationMixer(fbx);
    const action = animationMixer.clipAction(fbx.animations[0]);
    action.reset();
    action.play();
    animationMixer.update(0.6);
    return animationMixer;
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate(now = 0) {
    if (loadFailed) return;
    requestAnimationFrame(animate);

    const breath = Math.sin(now / 900) * 0.018;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (mixer) mixer.update(dt);

    rig.position.x = Math.sin(now / 1450) * 0.012;
    rig.position.y = FPV_RIG_BASE_Y + breath;
    rig.rotation.z = Math.sin(now / 1800) * 0.008;

    renderer.render(scene, camera);
  }
}

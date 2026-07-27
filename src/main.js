import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

document.body.classList.add('is-loading');

const canvas = document.querySelector('#stage canvas');
const stage = document.querySelector('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 7);

scene.add(new THREE.HemisphereLight(0xffffff, 0x2d3436, 1.15));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(2.5, 4.2, 2.8);
key.castShadow = true;
scene.add(key);
const fill = new THREE.DirectionalLight(0x8fc7ff, .75);
fill.position.set(-2.2, 2.2, 1.6);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffd49a, 1.4);
rim.position.set(-1.4, 2.8, -3.2);
scene.add(rim);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enableZoom = false;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.2;

const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const looperUrl = new URL('../model/looper/recorder.glb', import.meta.url).href;
const hornUrl = new URL('../model/honk/horn_gltf.glb', import.meta.url).href;
const branchUrl = new URL('../model/branch/scene.glb', import.meta.url).href;
const textureUrls = {
  horn: {
    map: new URL('../model/honk/clown_horn_diffuse_map.png', import.meta.url).href,
    normalMap: new URL('../model/honk/Clay001_2K-JPG_NormalGL.jpg', import.meta.url).href,
    roughnessMap: new URL('../model/honk/Clay001_2K-JPG_Roughness_curves.png', import.meta.url).href
  },
  looper: {
    map: new URL('../model/looper/recorder2_lambert1SG_BaseColor.png', import.meta.url).href,
    normalMap: new URL('../model/looper/recorder2_lambert1SG_Normal.png', import.meta.url).href,
    roughnessMap: new URL('../model/looper/recorder2_lambert1SG_Roughness.png', import.meta.url).href,
    metalnessMap: new URL('../model/looper/recorder2_lambert1SG_Metallic.png', import.meta.url).href
  },
  branch: {
    normalMap: new URL('../model/branch/branch_3d_model_pbr_normal.JPEG', import.meta.url).href,
    roughnessMap: new URL('../model/branch/branch_3d_model_pbr_roughness.JPEG', import.meta.url).href,
    metalnessMap: new URL('../model/branch/branch_3d_model_pbr_metallic.JPEG', import.meta.url).href
  }
};
const entries = {
  looper: { url: looperUrl, size: 3.2, object: null, alpha: 0, targetAlpha: 0 },
  horn: { url: hornUrl, size: 3.7, object: null, alpha: 0, targetAlpha: 0 },
  branch: { url: branchUrl, size: 4.4, object: null, alpha: 0, targetAlpha: 0 }
};
const root = new THREE.Group();
scene.add(root);
let current = '';
let targetX = innerWidth < 760 ? 0 : .8;
let targetScale = 1;
let scrollVelocity = 0;
let lastScroll = scrollY;

function normalize(object, targetSize) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z);
  object.scale.setScalar(scale);
  object.position.copy(center.multiplyScalar(-scale));
  object.userData.homePosition = object.position.clone();
  object.userData.homeScale = object.scale.clone();
  object.userData.homeMinY = new THREE.Box3().setFromObject(object).min.y;
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  object.visible = false;
  root.add(object);
}

function applyTextures(object, name) {
  const set = textureUrls[name];
  if (!set) return;
  let existingMap = null;
  object.traverse((child) => {
    if (child.isMesh && child.material?.map) existingMap = child.material.map;
  });
  const settings = {
    color: 0xffffff,
    roughness: set.roughnessMap ? 1 : .48,
    metalness: set.metalnessMap ? 1 : .02,
    map: existingMap,
    side: THREE.DoubleSide
  };
  Object.entries(set).forEach(([slot, url]) => {
    const texture = textureLoader.load(url);
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (slot === 'map') texture.colorSpace = THREE.SRGBColorSpace;
    settings[slot] = texture;
  });
  object.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        ...settings,
        transparent: true,
        opacity: 0
      });
    }
  });
}

const modelPromises = Object.entries(entries).map(([name, entry]) =>
  new Promise((resolve) => {
    loader.load(entry.url, (gltf) => {
      entry.object = gltf.scene;
      applyTextures(entry.object, name);
      normalize(entry.object, entry.size);
      resolve();
    }, undefined, () => resolve());
  })
);

function finishLoading() {
  document.querySelector('#loader').classList.add('is-done');
  document.body.classList.remove('is-loading');
}

Promise.all(modelPromises).then(() => {
  const visibleSection = [...document.querySelectorAll('[data-scene]')].find((panel) => {
    const rect = panel.getBoundingClientRect();
    return rect.top <= innerHeight * .5 && rect.bottom >= innerHeight * .5;
  });
  current = '';
  setScene(visibleSection?.dataset.scene || 'none', visibleSection);
  setTimeout(finishLoading, 550);
});

function setScene(name, section) {
  if (name === current) return;
  current = name;
  stage.dataset.scene = name;
  stage.classList.toggle('is-interactive', ['looper', 'horn', 'branch'].includes(name));
  controls.autoRotate = !['none', 'ensemble'].includes(name);
  Object.entries(entries).forEach(([key, entry]) => {
    entry.targetAlpha = name === 'ensemble' || key === name ? 1 : 0;
    if (!entry.object) return;
    entry.object.position.copy(entry.object.userData.homePosition);
    entry.object.scale.copy(entry.object.userData.homeScale);
  });

  if (name === 'ensemble') {
    const isPhone = innerWidth < 760;
    const isShortPhone = isPhone && innerHeight < 760;
    const ensembleScale = isPhone ? (isShortPhone ? .2 : .32) : .72;
    const baselineY = isPhone ? (isShortPhone ? -1.15 : -1.35) : -1.45;
    root.scale.setScalar(1);
    root.rotation.z = 0;
    camera.position.set(0, 0, 7);
    controls.target.set(0, 0, 0);
    controls.update();
    const ensembleMetrics = [];
    ['looper', 'horn', 'branch'].forEach((key, i) => {
      const obj = entries[key].object;
      if (!obj) return;
      obj.position.copy(obj.userData.homePosition).multiplyScalar(ensembleScale);
      obj.scale.copy(obj.userData.homeScale).multiplyScalar(ensembleScale);
      obj.updateWorldMatrix(true, true);
      let renderedBounds = new THREE.Box3().setFromObject(obj);
      const renderedCenter = renderedBounds.getCenter(new THREE.Vector3());
      const desiredX = (i - 1) * (isPhone ? .7 : 2);
      obj.position.x += desiredX - renderedCenter.x;
      obj.position.z -= renderedCenter.z;
      obj.updateWorldMatrix(true, true);
      renderedBounds = new THREE.Box3().setFromObject(obj);
      obj.position.y += baselineY - renderedBounds.min.y;
      obj.updateWorldMatrix(true, true);
      renderedBounds = new THREE.Box3().setFromObject(obj);
      ensembleMetrics.push(`${key}:${renderedBounds.min.y.toFixed(3)}`);
    });
    stage.dataset.ensembleBounds = ensembleMetrics.join(',');
    targetX = 0;
  } else {
    const rightCopy = section?.querySelector('.instrument__copy--right');
    targetX = name === 'none' || innerWidth < 760 ? 0 : rightCopy ? -1.45 : 1.35;
  }
}

const sceneSections = [...document.querySelectorAll('[data-scene]')];
function syncSceneToScroll() {
  const active = sceneSections.reduce((best, panel) => {
    const rect = panel.getBoundingClientRect();
    const visiblePixels = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
    if (!best || visiblePixels > best.visiblePixels) return { panel, visiblePixels };
    return best;
  }, null);
  if (active?.visiblePixels > 0) {
    const panelHeight = Math.max(active.panel.getBoundingClientRect().height, 1);
    const visibleFraction = THREE.MathUtils.clamp(active.visiblePixels / Math.min(panelHeight, innerHeight), 0, 1);
    targetScale = .94 + visibleFraction * .06;
    setScene(active.panel.dataset.scene, active.panel);
  }
}
syncSceneToScroll();

const revealObserver = new IntersectionObserver((items) => {
  items.forEach((item) => {
    if (item.isIntersecting) {
      item.target.classList.add('is-visible');
      revealObserver.unobserve(item.target);
    }
  });
}, { threshold: .14 });
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${(i % 3) * 80}ms`;
  revealObserver.observe(el);
});

window.addEventListener('scroll', () => {
  scrollVelocity = scrollY - lastScroll;
  lastScroll = scrollY;
}, { passive: true });

let soundOn = false;
let audioContext;
const soundButton = document.querySelector('.sound-toggle');
soundButton.addEventListener('click', () => {
  soundOn = !soundOn;
  soundButton.classList.toggle('is-on', soundOn);
  soundButton.setAttribute('aria-pressed', soundOn);
  soundButton.lastChild.textContent = soundOn ? ' sound on' : ' sound off';
  if (soundOn) ping(180);
});

function ping(frequency = 240) {
  if (!soundOn) return;
  audioContext ||= new AudioContext();
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(frequency * .55, audioContext.currentTime + .12);
  gain.gain.setValueAtTime(.05, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .14);
  osc.connect(gain).connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + .15);
}
document.querySelectorAll('a, button').forEach((el) => el.addEventListener('pointerenter', () => ping(280)));

let previousFrameTime = performance.now();
function animate(frameTime = performance.now()) {
  requestAnimationFrame(animate);
  syncSceneToScroll();
  const elapsed = Math.min((frameTime - previousFrameTime) / 1000, .25);
  previousFrameTime = frameTime;
  const fadeBlend = 1 - Math.exp(-elapsed * 8);
  Object.values(entries).forEach((entry) => {
    if (!entry.object) return;
    entry.alpha += (entry.targetAlpha - entry.alpha) * fadeBlend;
    if (Math.abs(entry.targetAlpha - entry.alpha) < .002) entry.alpha = entry.targetAlpha;
    entry.object.visible = entry.alpha > .002;
    entry.object.traverse((child) => {
      if (!child.isMesh) return;
      child.material.opacity = entry.alpha;
      child.material.depthWrite = entry.alpha > .96;
    });
  });
  stage.dataset.models = Object.entries(entries)
    .filter(([, entry]) => entry.alpha > .05)
    .map(([name]) => name)
    .join(',');
  if (!Number.isFinite(root.scale.x) || !Number.isFinite(root.scale.y) || !Number.isFinite(root.scale.z)) {
    root.scale.set(1, 1, 1);
  }
  stage.dataset.scaleFinite = String(
    Number.isFinite(root.scale.x) && Number.isFinite(root.scale.y) && Number.isFinite(root.scale.z)
  );
  root.position.x += (targetX - root.position.x) * .045;
  root.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), .04);
  const scrollTilt = ['looper', 'horn', 'branch'].includes(current) ? scrollVelocity * .0007 : 0;
  root.rotation.z += (scrollTilt - root.rotation.z) * .06;
  scrollVelocity *= .9;
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  current = '';
  syncSceneToScroll();
});

import * as THREE from 'three';
import * as content from './content.js';
import { Scheduler, isMobile } from './core/util.js';
import { Fader } from './core/Fader.js';
import { Haze } from './core/Haze.js';
import { Grain } from './core/Grain.js';
import { Input } from './core/Input.js';
import { LookControls } from './core/LookControls.js';
import { AudioSystem } from './core/AudioSystem.js';
import { Narrator } from './core/Narrator.js';
import { SceneManager } from './core/SceneManager.js';
import { loadFonts } from './core/TextBlock.js';
import { SCENES, ORDER } from './scenes/index.js';
import { setupUI } from './ui.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const FIRST_SCENE = params.get('scene') && SCENES[params.get('scene')] ? params.get('scene') : 'sphinx';
const FIRST_PARAMS = { phase: params.get('phase') || undefined, ending: params.get('ending') || undefined };
const FOV = 70;
const SPEED = Math.min(8, Number(params.get('speed')) || 1); // ?speed=4 fast-forwards timelines (testing)

// ---------- renderer / world ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
// 'local' = origin at the head when the session starts: the rig position *is* the eye position,
// the same on flat screens and in the headset (seated, standing or lying down).
renderer.xr.setReferenceSpaceType('local');
renderer.xr.setFoveation(1);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.05, 300);
rig.add(camera);

// ---------- systems ----------
const scheduler = new Scheduler();
const fader = new Fader(camera, scheduler);
const haze = new Haze(camera, renderer);
const grain = new Grain(camera);
const look = new LookControls(camera, renderer.domElement);
const input = new Input({ renderer, camera, rig, settings: content.SETTINGS });
const audio = new AudioSystem(camera, content.AUDIO);
const narrator = new Narrator(content.SETTINGS);

const ctx = { renderer, scene, rig, camera, scheduler, fader, haze, grain, look, input, audio, narrator, content, isMobile };
const manager = new SceneManager(ctx, SCENES, ORDER);
ctx.manager = manager;

// ---------- flow ----------
let started = false;
let paused = false;

/** Start the experience (first time) or jump to a chapter { scene, params }. */
function begin(chapter) {
  const target = chapter || { scene: FIRST_SCENE, params: FIRST_PARAMS };
  if (!started) {
    started = true;
    ui.hideTitle();
    ui.showHud(!renderer.xr.isPresenting);
  }
  ready.then(() => manager.goto(target.scene, target.params || {}, { out: 1.2 }));
}

function setPaused(on) {
  if (paused === on) return;
  paused = on;
  if (on) {
    audio.ctx.suspend();
    if (narrator.supported) speechSynthesis.pause();
  } else {
    audio.ctx.resume();
    if (narrator.supported) speechSynthesis.resume();
    clock.getDelta(); // don't count the paused time
  }
}

const ready = loadFonts().then(() => manager.goto('title', {}, { in: 2 }));

const ui = setupUI({
  content,
  renderer,
  audio,
  narrator,
  look,
  isMobile,
  onBegin: begin,
  onPause: setPaused,
  onRestart: () => begin({ scene: 'prologue' }),
});

renderer.xr.addEventListener('sessionstart', () => {
  look.enabled = false;
  setPaused(false);
  ui.showHud(false);
  if (!started) begin();
});
renderer.xr.addEventListener('sessionend', () => {
  camera.position.set(0, 0, 0);
  camera.fov = FOV;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  look.enabled = true;
  look.reset();
  ui.showHud(started);
});

window.addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyN' && started && !paused) manager.skip(); // jump to the next scene (testing / demo rescue)
});

// ---------- debug overlay (?debug) ----------
const debugEl = document.getElementById('debug');
let frames = 0;
let fpsTime = 0;
if (DEBUG) {
  debugEl.classList.remove('hidden');
  window.app = ctx; // poke at it from the console
}
function updateDebug(dt) {
  frames++;
  fpsTime += dt;
  if (fpsTime < 0.5) return;
  const fps = Math.round(frames / fpsTime);
  frames = 0;
  fpsTime = 0;
  const info = renderer.info.render;
  debugEl.textContent = `${fps} fps · ${info.calls} calls · ${info.triangles} tris\nscene: ${manager.id}${renderer.xr.isPresenting ? ' · XR' : ''}${look.gyro ? ' · gyro' : ''}`;
}

// ---------- loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = paused ? 0 : Math.min(clock.getDelta(), 0.1) * SPEED;
  scheduler.update(dt);
  haze.update(dt, scheduler.time);
  grain.update(scheduler.time);
  look.update(dt);
  input.reticle.visible = renderer.xr.isPresenting || (manager.current ? manager.current.showReticle : false);
  input.update(dt);
  manager.update(dt, scheduler.time);
  renderer.render(scene, camera);
  if (DEBUG) updateDebug(dt);
});

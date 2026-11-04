import * as THREE from 'three';
import * as content from './content.js';
import { Scheduler, isMobile, isQuest } from './core/util.js';
import { Fader } from './core/Fader.js';
import { Haze } from './core/Haze.js';
import { Grain } from './core/Grain.js';
import { Input } from './core/Input.js';
import { Locomotion } from './core/Locomotion.js';
import { Interact } from './core/Interact.js';
import { Prefs } from './core/Prefs.js';
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
// ?xr (dev server only): a simulated Quest 3 in the browser, for testing without a headset.
const xrReady = import.meta.env.DEV && params.has('xr') ? import('./dev/emulator.js').then((m) => m.installEmulator()) : Promise.resolve();
const SPEED = Math.min(8, Number(params.get('speed')) || 1); // ?speed=4 fast-forwards timelines (testing)

// ---------- renderer / world ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
// 'local' = origin at the head when the session starts: the rig position *is* the eye position,
// the same on flat screens and in the headset (seated, standing or lying down). Walking around
// the room still works: the head moves within it, and Locomotion recentres it for each scene.
renderer.xr.setReferenceSpaceType('local');
renderer.xr.setFoveation(1);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.05, 300);
const offset = new THREE.Group(); // where the viewer's room sits inside the rig (see Locomotion)
rig.add(offset);
offset.add(camera);

// ---------- systems ----------
const scheduler = new Scheduler();
const fader = new Fader(camera, scheduler);
const haze = new Haze(camera, renderer);
const grain = new Grain(camera);
const look = new LookControls(camera, renderer.domElement);
const prefs = new Prefs();
const input = new Input({ renderer, scene, camera, rig: offset, settings: content.SETTINGS });
const locomotion = new Locomotion({ renderer, scene, camera, rig, offset, input, look, prefs });
const interact = new Interact({ renderer, camera, input, parent: offset });
const audio = new AudioSystem(camera, content.AUDIO);
const narrator = new Narrator(content.SETTINGS);

const platform = () => (renderer.xr.isPresenting || isQuest ? 'xr' : isMobile ? 'phone' : 'desktop');
const ctx = { renderer, scene, rig, camera, scheduler, fader, haze, grain, look, input, locomotion, interact, prefs, audio, narrator, content, isMobile, platform };
const manager = new SceneManager(ctx, SCENES, ORDER);
ctx.manager = manager;
locomotion.onToggle = (key) => {
  const { UI } = content;
  const label = key === 'smooth' ? (prefs.smooth ? UI.smoothOn : UI.smoothOff) : prefs.subtitles ? UI.subtitlesOn : UI.subtitlesOff;
  manager.current?.say(label, { narrate: false, force: true, hold: 0.4 });
};

// ---------- flow ----------
let started = false;
let paused = false;

/**
 * Start the experience, or jump to a chapter { scene, params }.
 * opts.run: played from the wheel, the chapter's scenes and the sector to come back to. opts.out, opts.color: the fade.
 */
function begin(chapter, opts = {}) {
  const target = chapter || { scene: FIRST_SCENE, params: FIRST_PARAMS };
  manager.run = opts.run || null;
  if (!started) {
    started = true;
    ui.hideTitle();
    ui.showHud(!renderer.xr.isPresenting);
  }
  ready.then(() => manager.goto(target.scene, target.params || {}, { out: opts.out ?? 1.2, color: opts.color }));
}
ctx.begin = begin;

/** A chapter as a run from the wheel: it ends when the story leaves its scenes. */
function runOf(chapter) {
  const i = content.CHAPTERS.indexOf(chapter);
  return { scenes: chapter.scenes || [chapter.scene], next: (i + 1) % content.CHAPTERS.length };
}

/** Back to the wheel. */
function backToWheel(params = {}) {
  manager.run = null;
  manager.goto('title', params, { out: 1.2, in: 1.6 });
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
  prefs,
  isMobile,
  platform,
  xrReady,
  onAction: () => interact.runHeldAction(),
  // On the wheel, "begin" turns the crank. Anywhere else a chapter is a jump.
  onBegin: (chapter) => {
    const hub = manager.id === 'title' ? manager.current : null;
    if (hub?.play) {
      if (chapter) hub.playChapter(content.CHAPTERS.indexOf(chapter));
      else hub.play();
    } else if (chapter) begin(chapter, { run: runOf(chapter) });
    else begin();
  },
  onStep: (d) => manager.current?.stepBy?.(d),
  onPause: setPaused,
  onRestart: () => backToWheel(),
});
ctx.ui = ui;

input.onTip = ui.setTip;
interact.onActionChange = ui.setAction;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') interact.runHeldAction();
});
manager.onChange = () => {
  ui.showControls(!!manager.current?.walkArea, manager.id === 'title' || manager.id === 'credits');
  if (manager.id === 'title' && started) {
    started = false;
    ui.showTitle();
  }
};

renderer.xr.addEventListener('sessionstart', () => {
  look.enabled = false;
  setPaused(false);
  ui.showHud(false);
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
  locomotion.update(dt);
  interact.update(dt);
  manager.update(dt, scheduler.time);
  renderer.render(scene, camera);
  if (DEBUG) updateDebug(dt);
});

import * as THREE from 'three';
import { disposeObject, forPlatform } from './util.js';
import { Subtitle } from './Subtitle.js';

/**
 * Base class for a scene. Lifecycle:
 *   enter(params)  build objects (may be async: preload audio etc.) — screen is still faded
 *   start(params)  the scene's timeline; runs while the fade-in happens. Use `await this.wait(s)`.
 *   update(dt, t)  every frame
 *   exit()         extra cleanup (root is removed and disposed automatically)
 *   onSelectNothing()  the viewer clicked / tapped / triggered on empty space
 */
export class BaseScene {
  showReticle = true;
  /** Walkable area, set in enter(): { center: [x, z], radius, blockers: [{ x, z, r }], floorY }. Null = no walking. */
  walkArea = null;

  constructor(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.alive = false;
    this.animated = [];
    this.sounds = [];
    this.subtitle = null;
  }

  wait(seconds) {
    return this.ctx.scheduler.wait(seconds, this);
  }

  tween(seconds, fn, easing) {
    return this.ctx.scheduler.tween(seconds, fn, easing, this);
  }

  next(id, params, opts) {
    return this.ctx.manager.goto(id, params, opts);
  }

  /** Add to the scene; objects with update(t, dt) get animated automatically. */
  add(...objs) {
    for (const o of objs) {
      this.root.add(o);
      if (typeof o.update === 'function') this.animated.push(o);
    }
    return objs[0];
  }

  /** Remove and free an object added earlier. */
  drop(obj) {
    if (!obj) return;
    obj.parent?.remove(obj);
    this.animated = this.animated.filter((o) => o !== obj);
    disposeObject(obj);
  }

  /** Resolve when `cond()` is true or after `timeout` seconds. Returns true if the condition was met. */
  async until(cond, timeout = Infinity) {
    let t = 0;
    while (!cond()) {
      if (t >= timeout) return false;
      await this.wait(0.1);
      t += 0.1;
    }
    return true;
  }

  /** Play a sound owned by this scene: it is stopped automatically when the scene ends. */
  async sound(name, opts) {
    const a = await this.ctx.audio.playSfx(name, opts);
    if (!this.alive) {
      if (a.isPlaying) a.stop();
    } else this.sounds.push(a);
    return a;
  }

  /**
   * A line of narration: a small subtitle that follows your gaze, plus the voice.
   * `narrate: false` for instructions, which are read but not spoken; those can be
   * { desktop, phone, xr }. Resolves when it has been said.
   */
  say(line, { hold, narrate = true, force = false } = {}) {
    const { ctx } = this;
    const text = forPlatform(line, ctx.platform());
    if (!this.subtitle) this.subtitle = this.add(new Subtitle(ctx.camera, { prefs: ctx.prefs, isXR: () => ctx.renderer.xr.isPresenting }));
    const speech = narrate ? ctx.narrator.speak(text) : null;
    return this.subtitle.show(this, text, { speech, hold, force });
  }

  enter() {}
  start() {}
  exit() {}
  onSelectNothing() {}

  update(dt, t) {
    for (const o of this.animated) o.update(t, dt);
  }
}

/** Simple state machine: one scene at a time, joined by fades to black or white. */
export class SceneManager {
  constructor(ctx, registry, order) {
    this.ctx = ctx;
    this.registry = registry;
    this.order = order;
    this.current = null;
    this.busy = false;
    this.queued = null;
    this.onChange = null;
  }

  get id() {
    return this.current ? this.current.id : null;
  }

  /**
   * opts: { color: '#000' | '#fff', out: seconds, in: seconds, hold: seconds }
   */
  async goto(id, params = {}, opts = {}) {
    if (this.busy) {
      this.queued = [id, params, opts];
      return;
    }
    const Scene = this.registry[id];
    if (!Scene) throw new Error(`Unknown scene "${id}"`);
    this.busy = true;
    const { ctx } = this;
    const color = opts.color ?? '#000000';

    ctx.input.enabled = false;
    if (this.current) {
      await ctx.fader.fade(1, opts.out ?? 1.0, color);
      this._teardown();
    } else {
      ctx.fader.set(1, color);
    }

    const scene = new Scene(ctx);
    scene.id = id;
    this.current = scene;
    ctx.scene.background = new THREE.Color(0x000000);
    ctx.scene.fog = null;
    ctx.haze.reset();
    ctx.grain.reset();
    ctx.rig.position.set(0, 0, 0);
    ctx.rig.rotation.set(0, 0, 0);
    ctx.look.reset();
    ctx.input.onSelectNothing = () => scene.alive && scene.onSelectNothing();
    ctx.scene.add(scene.root);
    scene.alive = true;
    try {
      await scene.enter(params);
    } catch (err) {
      console.error(`[scene ${id}] enter failed`, err);
    }
    ctx.locomotion.setArea(scene.walkArea);
    ctx.interact.env = { floorY: scene.walkArea?.floorY ?? 0, blockers: scene.walkArea?.blockers ?? [] };
    ctx.locomotion.recenter();
    ctx.interact.setHandsVisible(!!scene.walkArea);
    scene.ready = true; // update() waits for this: async enter() may still be loading art
    this.onChange?.(id);
    if (opts.hold) await ctx.scheduler.wait(opts.hold);

    ctx.input.enabled = true;
    Promise.resolve()
      .then(() => scene.start(params))
      .catch((err) => console.error(`[scene ${id}] start failed`, err));
    await ctx.fader.fade(0, opts.in ?? 1.4);

    this.busy = false;
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      this.goto(...q);
    }
  }

  _teardown() {
    const { ctx } = this;
    const scene = this.current;
    scene.alive = false;
    ctx.scheduler.cancel(scene);
    ctx.narrator.stop();
    try {
      scene.exit();
    } catch (err) {
      console.error(err);
    }
    for (const a of scene.sounds) {
      if (a.isPlaying) a.stop();
      a.parent?.remove(a);
    }
    ctx.input.clear();
    ctx.interact.clear();
    ctx.locomotion.setArea(null);
    ctx.scene.remove(scene.root);
    disposeObject(scene.root);
    this.current = null;
  }

  /** Jump ahead (debug key N): the scene's `skipTo`, else the next in `order`. */
  skip() {
    const s = this.current;
    if (!s) return;
    const next = s.skipTo ?? this.order[this.order.indexOf(s.id) + 1];
    if (next) this.goto(next, s.skipParams || {}, { out: 0.4, in: 0.6 });
  }

  update(dt, t) {
    if (this.current && this.current.alive && this.current.ready) this.current.update(dt, t);
  }
}

import * as THREE from 'three';
import { Time, FixedStepper } from './time.ts';
import { Loop } from './loop.ts';
import { Scheduler, type Co } from './coroutines.ts';
import { refs } from './refs.ts';
import { Input } from './Input.ts';
import { GameSettings } from './GameSettings.ts';
import { SaveSystem, newSaveData, type SaveData } from './SaveSystem.ts';
import { css, yawOf } from './math.ts';
import { onEscape, shouldPauseOnUnlock } from './pauseRules.ts';
import { LedgeKind } from './StageData.ts';
import { Physics } from '../physics/Physics.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { MountainGenerator } from '../world/MountainGenerator.ts';
import { WorldDecor } from '../world/WorldDecor.ts';
import { Effects } from '../world/Effects.ts';
import { FakeCheckpoint, ShortcutFish, spawnSnowball } from '../world/Interactables.ts';
import { PenguinController, PState } from '../player/PenguinController.ts';
import { PenguinVisual } from '../player/PenguinVisual.ts';
import { Outfit } from '../player/cosmetics/Outfit.ts';
import { CurrentRole } from '../player/roles/Roles.ts';
import type { OutfitIds } from '../player/cosmetics/Catalog.ts';
import { ThirdPersonCamera, CamMode } from '../player/ThirdPersonCamera.ts';
import { WindSystem } from '../trolls/WindSystem.ts';
import { TrapDirector } from '../trolls/TrapDirector.ts';
import { ControlChaos } from '../trolls/ControlChaos.ts';
import { Taunts } from '../trolls/Taunts.ts';
import { TrapEffects } from '../trolls/TrapEffects.ts';
import { seagullAttack } from '../trolls/Seagull.ts';
import { UIManager, type GameForUI } from '../ui/UIManager.ts';
import { SequenceDirector } from '../sequences/SequenceDirector.ts';

export const GState = { Boot: 0, Menu: 1, Playing: 2, Paused: 3, Cutscene: 4, Ending: 5 } as const;
export type GState = (typeof GState)[keyof typeof GState];

/**
 * Bootstraps the whole game (everything is built from code), owns game state, stats, saving,
 * stage tracking, falls and the summit triggers. Port of GameManager.cs plus the render/physics loop.
 */
export class Game implements GameForUI {
  static instance: Game;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2500);
  state: GState = GState.Boot;
  get isPlaying() { return this.state === GState.Playing; }

  data: SaveData = newSaveData();
  currentStage = 0;
  get tiersRevealed() { return this.data.tiersRevealed; }

  mountain!: MountainGenerator;
  decor!: WorldDecor;
  penguin!: PenguinController;
  cam!: ThirdPersonCamera;
  ui!: UIManager;
  traps!: TrapDirector;
  chaos!: ControlChaos;
  seq!: SequenceDirector;

  private stepper = new FixedStepper(0.02);
  private last = 0;
  private autosave = 0; private idle = 0; private lastBannerTime = -999;
  private lastBannerStage = -1;
  private lastSafePos = new THREE.Vector3();
  private lastSafeYaw = 0;
  private sendingToBottom = false;
  private hadPointerLock = false;
  /** while true, losing the mouse doesn't pause and clicks don't re-capture it (used by the local dev menu) */
  holdUnlocked = false;

  constructor(canvas: HTMLCanvasElement) {
    Game.instance = this;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.userData.camera = this.camera;
    refs.camera = this.camera;
    addEventListener('resize', () => this.resize());
  }

  // ------------------------------------------------------------------ Awake

  init() {
    GameSettings.load();
    Input.init(this.renderer.domElement);
    AudioManager.prepare();
    Input.onGesture(() => AudioManager.unlock());
    Physics.init();
    Effects.setScene(this.scene);

    this.mountain = new MountainGenerator(this.scene);
    this.mountain.tiersRevealed = () => this.data.tiersRevealed;
    this.mountain.generate();

    this.decor = new WorldDecor(this.scene, this.mountain);
    this.decor.build();

    const wind = new WindSystem(() => this.mountain.summitY);

    this.penguin = new PenguinController(this.scene);
    new PenguinVisual(this.penguin);
    this.penguin.teleport(this.mountain.spawnPoint, this.mountain.spawnYaw);
    this.penguin.fell.on((drop, at) => this.onFell(drop, at));

    this.camera.position.set(0, 60, -200);
    this.cam = new ThirdPersonCamera(this.camera, this.mountain);
    this.cam.target = this.penguin.object;
    refs.cam = this.cam;

    wind.init(this.penguin.object);

    this.traps = new TrapDirector(i => this.mountain.getLedge(i));
    this.penguin.landed.on((l, impact) => this.traps.onLanded(l, impact));
    this.penguin.jumped.on(l => this.traps.onJumped(l));
    this.penguin.fell.on(drop => this.traps.onFell(drop));
    this.traps.spawnSnowball = from => spawnSnowball(this.scene, from, this.penguin.collider);
    this.traps.spawnSeagull = () => seagullAttack(this.scene);

    this.chaos = new ControlChaos();

    this.ui = new UIManager(document.getElementById('ui')!);
    this.ui.gm = this;
    this.ui.build();

    this.seq = new SequenceDirector(this, this.scene);

    for (const f of this.mountain.checkpointFlags) new FakeCheckpoint(f.object, f.stage);
    for (const f of this.mountain.fishes) new ShortcutFish(f.object);

    Effects.snowFall(this.penguin.object);
    this.lastSafePos.copy(this.mountain.spawnPoint);
    this.lastSafeYaw = this.mountain.spawnYaw;
    refs.game = this;

    GameSettings.onChanged(() => this.applyQuality());
    this.applyQuality();
    this.resize();

    // browser equivalents of OnApplicationFocus / OnApplicationQuit
    addEventListener('blur', () => { if (this.state === GState.Playing) this.setPaused(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === GState.Playing) this.setPaused(true); });
    addEventListener('pagehide', () => { if (this.state === GState.Playing || this.state === GState.Paused) this.saveNow(); });
    // Esc while the mouse is captured is eaten by the browser to release the pointer: treat that as "pause"
    Input.onLockChange(locked => {
      if (locked) { this.hadPointerLock = true; return; }
      if (shouldPauseOnUnlock(this.hadPointerLock, this.state === GState.Playing, this.holdUnlocked)) this.setPaused(true);
      this.hadPointerLock = false;
    });
  }

  private applyQuality() {
    const q = GameSettings.quality;
    this.renderer.setPixelRatio(q === 0 ? 0.75 : q === 1 ? 1 : Math.min(devicePixelRatio, 2));
    const sun = this.decor.sun;
    sun.castShadow = q > 0;
    const size = q === 1 ? 1024 : 2048;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    Effects.setPixelScale(h * this.renderer.getPixelRatio() / (2 * Math.tan(this.camera.fov * Math.PI / 360)));
  }

  // ------------------------------------------------------------------ Start

  start() {
    this.toMenu();
    Scheduler.start(this, this.ui.fade(0, 1.2));
    this.last = performance.now();
    this.renderer.setAnimationLoop(now => this.frame(now));
  }

  // ------------------------------------------------------------------ flow

  toMenu() {
    if (this.state === GState.Playing || this.state === GState.Paused) this.saveNow();
    Time.timeScale = 1;
    this.state = GState.Menu;
    this.cam.mode = CamMode.MenuOrbit;
    this.ui.showMenu();
    AudioManager.duckMusic(1);
    AudioManager.setFallLoop(0);
    this.setCursor(false);
  }

  private pendingRole = 'normal';
  /** start a fresh climb as the given role (locked for the whole run) */
  newGame(role = 'normal') { this.pendingRole = role; Scheduler.start(this, this.beginRun(false)); }
  continueGame() { Scheduler.start(this, this.beginRun(true)); }

  private *beginRun(resume: boolean): Co {
    Time.timeScale = 1;
    this.state = GState.Cutscene;
    this.setCursor(false);
    yield* this.ui.fade(1, 0.35);

    this.resetWorld();
    const loaded = resume ? SaveSystem.load() : null;
    if (loaded) {
      this.data = loaded;
      for (let t = 1; t <= this.data.tiersRevealed && t < this.mountain.tiers.length; t++) this.revealInstant(t);
      let p = new THREE.Vector3(this.data.px, this.data.py + 0.2, this.data.pz);
      if (p.lengthSq() < 0.01) p = this.mountain.spawnPoint.clone();
      this.penguin.teleport(p, this.data.yaw);
      this.lastSafePos.copy(p); this.lastSafeYaw = this.data.yaw;
    } else {
      // abandoning an old game: its traps become "last game's" so this game differs
      const old = SaveSystem.load();
      if (old && old.firedTraps.length) SaveSystem.lastRunTraps = old.firedTraps;
      SaveSystem.clear();
      this.data = newSaveData();
      this.data.role = this.pendingRole;
      this.penguin.teleport(this.mountain.spawnPoint, this.mountain.spawnYaw);
      this.lastSafePos.copy(this.mountain.spawnPoint); this.lastSafeYaw = this.mountain.spawnYaw;
      this.saveNowForce();
    }
    // the run's role (Continue keeps the saved one) — re-dress the penguin so role looks (Ghost) apply
    CurrentRole.set(this.data.role);
    PenguinVisual.instance.applyOutfit(PenguinVisual.instance.outfit);
    this.traps.loadRun(this.data.bannedTraps, this.data.firedTraps, SaveSystem.lastRunTraps);
    this.chaos.resetTimer();
    this.currentStage = this.mountain.stageAtHeight(this.penguin.position.y);
    this.lastBannerStage = -1;

    this.ui.enterGameplayUI();
    this.cam.mode = CamMode.Follow;
    this.cam.snapBehindTarget();
    this.state = GState.Playing;
    this.setCursor(true);
    if (!resume) this.ui.showControlsHint(14);
    yield* this.ui.fade(0, 0.5);
    if (resume) this.ui.taunt('Welcome back. The mountain missed you.');
  }

  /** Puts the world back to a fresh run: only tier 1 visible, ledges reset, no doom. */
  resetWorld() {
    for (let t = 0; t < this.mountain.tiers.length; t++) {
      this.mountain.tiers[t].root.position.set(0, 0, 0);
      this.mountain.setTierActive(t, t === 0);
      this.mountain.syncTier(t);
    }
    this.mountain.resetAllLedges();
    WorldDecor.instance.doomAmount = 0;
    this.seq.cleanup();
    TrapEffects.reset();
    this.penguin.inputLocked = false;
    this.penguin.gravityScale = 1;
    Time.timeScale = 1;
  }

  revealInstant(tier: number) {
    const r = this.mountain.tiers[tier].root;
    r.position.set(0, 0, 0);
    this.mountain.setTierActive(tier, true);
    this.mountain.syncTier(tier);
    for (const l of this.mountain.ledges) if (l.root === r) l.resetState();
  }

  setPaused(paused: boolean) {
    if (paused && this.state !== GState.Playing) return;
    if (!paused && this.state !== GState.Paused) return;
    this.state = paused ? GState.Paused : GState.Playing;
    Time.timeScale = paused ? 0 : 1;
    this.ui.showPause(paused);
    AudioManager.duckMusic(paused ? 0.5 : 1);
    this.setCursor(!paused);
    if (paused) this.saveNow();
  }

  setCutscene(on: boolean) {
    if (on) { this.state = GState.Cutscene; this.penguin.inputLocked = true; this.setCursor(false); }
    else { this.state = GState.Playing; this.penguin.inputLocked = false; this.setCursor(true); this.cam.mode = CamMode.Follow; }
  }

  setEnding() { this.state = GState.Ending; this.penguin.inputLocked = true; }

  private setCursor(locked: boolean) {
    if (locked) Input.lockPointer(); else Input.unlockPointer();
  }

  // ------------------------------------------------------------------ Update

  private update() {
    let esc = Input.wasPressed('Escape');
    const gp = Input.gamepad();
    if (gp && gp.pressed(9)) esc = true;

    if (esc) {
      const st = this.state === GState.Playing ? 'playing' : this.state === GState.Paused ? 'paused' : this.state === GState.Menu ? 'menu' : 'other';
      onEscape(st, this.ui, on => this.setPaused(on));   // Esc never resumes: only the RESUME button does
    }

    // clicking back into the game re-locks the cursor
    if (this.state === GState.Playing && !Input.isLocked && Input.mouseClicked && !this.holdUnlocked) this.setCursor(true);

    if (this.state !== GState.Playing) return;

    const dt = Time.deltaTime;
    this.data.time += dt;
    const pc = this.penguin;
    const pos = pc.position;

    // stage tracking
    const stage = pc.groundLedge && pc.groundLedge.index >= 0 ? pc.groundLedge.stage : this.mountain.stageAtHeight(pos.y);
    if (pc.grounded && stage !== this.currentStage) {
      const first = stage + 1 > this.data.maxStage;
      const again = stage > this.currentStage && !first;
      this.currentStage = stage;
      if (first) this.data.maxStage = stage + 1;
      if ((first || again) && (stage !== this.lastBannerStage || Time.time - this.lastBannerTime > 30)) {
        this.ui.stageBanner(stage, again);
        this.lastBannerStage = stage; this.lastBannerTime = Time.time;
        AudioManager.play(again ? 'pop' : 'checkpoint', 0.5);
      }
    }
    WorldDecor.instance.setStageFog(this.currentStage);

    if (pos.y > this.data.bestHeight) this.data.bestHeight = pos.y;

    if (pc.grounded) {
      const gl = pc.groundLedge;
      if (!gl || (!gl.isDynamic && gl.kind !== LedgeKind.Crumble && gl.kind !== LedgeKind.Blink && gl.kind !== LedgeKind.Bouncy)) {
        this.lastSafePos.copy(pos);
        this.lastSafeYaw = yawOf(pc.facing);
      }
    }

    // idle taunt
    const m = pc.rawMove;
    if (m.x * m.x + m.y * m.y > 0.01 || !pc.grounded) this.idle = 0;
    else if ((this.idle += dt) > 45) { this.idle = 0; this.ui.taunt(Taunts.pick(Taunts.Idle)); }

    // autosave
    if ((this.autosave += dt) > 8) { this.autosave = 0; this.saveNow(); }

    // summit checks
    const tierIdx = Math.min(Math.max(this.data.tiersRevealed, 0), this.mountain.tiers.length - 1);
    const tier = this.mountain.tiers[tierIdx];
    const horiz = Math.hypot(pos.x, pos.z);
    if (pc.grounded && pos.y >= tier.topY - 0.35 && horiz < tier.rTop + 0.3 && !this.sendingToBottom) {
      if (tierIdx < this.mountain.tiers.length - 1) this.seq.runFakeSummit(tierIdx);
      else this.seq.runEnding();
    }
  }

  // ------------------------------------------------------------------ falls

  private onFell(drop: number, at: THREE.Vector3) {
    if (this.state !== GState.Playing) return;
    this.data.falls++;
    SaveSystem.lifetimeFalls = SaveSystem.lifetimeFalls + 1;
    if (drop > this.data.biggestFall) this.data.biggestFall = drop;
    let msg = Taunts.forFall(drop);
    const rt = CurrentRole.role.taunts;
    if (rt.length && Math.random() < 0.35) msg = rt[Math.floor(Math.random() * rt.length)];
    if (at.y < 1.5 && drop > 12) { msg = Taunts.pick(Taunts.Bottom); this.data.bottomResets++; }
    this.ui.taunt(msg);
    this.ui.toast(`-${Math.round(drop)} m`, css(1, 0.5, 0.45), 1.1);
    if (drop > 40) this.cam.shake(0.35);
  }

  sendToBottom(message: string) {
    if (this.sendingToBottom || this.state === GState.Ending) return;
    Scheduler.start(this, this.sendToBottomRoutine(message));
  }

  /** Trapdoor: back to the rest platform at the start of the current stage (not the very bottom). */
  sendToStageStart(message: string) {
    if (this.sendingToBottom || this.state === GState.Ending) return;
    const rest = this.mountain.ledges.find(l => l.stage === this.currentStage && l.kind === LedgeKind.Rest);
    if (!rest) { this.sendToBottom(message); return; }
    const pos = rest.position.add(new THREE.Vector3(0, 0.05, 0));
    Scheduler.start(this, this.sendToBottomRoutine(message, pos, yawOf(rest.forward), false));
  }

  private *sendToBottomRoutine(message: string, target = this.mountain.spawnPoint, yaw = this.mountain.spawnYaw, isBottom = true): Co {
    this.sendingToBottom = true;
    this.penguin.inputLocked = true;
    AudioManager.play('suck', 0.9);
    const drop = this.penguin.position.y - target.y;
    const tint = css(0.9, 0.95, 1);
    yield* this.ui.fade(1, 0.45, tint);
    this.penguin.teleport(target, yaw);
    TrapEffects.reset();
    this.lastSafePos.copy(target);
    this.cam.snapBehindTarget();
    this.data.falls++; if (isBottom) this.data.bottomResets++;
    SaveSystem.lifetimeFalls = SaveSystem.lifetimeFalls + 1;
    if (drop > this.data.biggestFall) this.data.biggestFall = drop;
    yield 0.3;
    yield* this.ui.fade(0, 0.5, tint);
    this.ui.taunt(message);
    if (drop > 1) this.ui.toast(`-${Math.round(drop)} m`, css(1, 0.5, 0.45), 1.4);
    this.penguin.inputLocked = false;
    this.sendingToBottom = false;
    this.saveNow();
  }

  // ------------------------------------------------------------------ saving

  saveNow() {
    if (this.state !== GState.Playing && this.state !== GState.Paused && this.state !== GState.Cutscene) return;
    this.saveNowForce();
  }

  private saveNowForce() {
    this.data.px = this.lastSafePos.x; this.data.py = this.lastSafePos.y; this.data.pz = this.lastSafePos.z;
    this.data.yaw = this.lastSafeYaw;
    this.data.bannedTraps = this.traps.exportBans();
    this.data.firedTraps = this.traps.exportFired();
    SaveSystem.save(this.data);
  }

  // ------------------------------------------------------------------ GameForUI

  private camBeforeWardrobe: CamMode = CamMode.MenuOrbit;
  wardrobeCamera(on: boolean) {
    if (on) { this.camBeforeWardrobe = this.cam.mode; this.cam.mode = CamMode.Wardrobe; PenguinVisual.instance.lookAtPoint = this.camera.position; }
    else { this.cam.mode = this.camBeforeWardrobe; PenguinVisual.instance.lookAtPoint = null; }
  }
  get outfit() { return PenguinVisual.instance.outfit; }
  get roleName() { return CurrentRole.role.name; }
  setOutfit(o: OutfitIds) { PenguinVisual.instance.applyOutfit(o); Outfit.save(o); }

  penguinHeight() { return this.penguin.object.position.y; }
  penguinHanging() { return this.penguin.state === PState.Hang; }
  grip01() { return this.penguin.grip01; }
  tierTop() { return this.mountain.tiers[Math.min(Math.max(this.data.tiersRevealed, 0), this.mountain.tiers.length - 1)].topY; }

  // ------------------------------------------------------------------ frame

  private frame(now: number) {
    const raw = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    Time.unscaledDeltaTime = raw;
    Time.unscaledTime += raw;
    Time.deltaTime = raw * Time.timeScale;
    Time.time += Time.deltaTime;
    Time.frameCount++;

    Input.pollGamepad();
    if (Time.timeScale > 0) {
      const steps = this.stepper.stepsFor(Time.deltaTime);
      for (let i = 0; i < steps; i++) { Loop.fixed(); Physics.world.step(); this.penguin.afterStep(); }
    }
    refs.alpha = this.stepper.alpha;
    this.update();
    Loop.update();
    Scheduler.update();
    Loop.late();
    AudioManager.update();
    Effects.update(Time.deltaTime);
    this.decor.focusShadows(this.state === GState.Menu ? new THREE.Vector3(0, 40, 0) : this.penguin.object.position);
    this.renderer.render(this.scene, this.camera);
    Input.endFrame();
  }
}

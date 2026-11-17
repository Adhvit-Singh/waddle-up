import * as THREE from 'three';
import { Time, FixedStepper } from './time.ts';
import { Loop } from './loop.ts';
import { Scheduler } from './coroutines.ts';
import { refs } from './refs.ts';
import { Physics } from '../physics/Physics.ts';
import { MountainGenerator } from '../world/MountainGenerator.ts';
import { WorldDecor } from '../world/WorldDecor.ts';
import { Effects } from '../world/Effects.ts';
import { Input } from './Input.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { GameSettings } from './GameSettings.ts';
import { PenguinController } from '../player/PenguinController.ts';
import { PenguinVisual } from '../player/PenguinVisual.ts';
import { ThirdPersonCamera, CamMode } from '../player/ThirdPersonCamera.ts';

/** Owns renderer, scene, physics and the Unity-style frame loop. */
export class Game {
  static instance: Game;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2500);
  mountain!: MountainGenerator;
  decor!: WorldDecor;
  private stepper = new FixedStepper(0.02);
  private last = 0;
  penguin!: PenguinController;
  cam!: ThirdPersonCamera;
  playing = false;

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
    this.resize();
  }

  init() {
    Physics.init();
    Effects.setScene(this.scene);
    this.mountain = new MountainGenerator(this.scene);
    this.mountain.generate();
    this.decor = new WorldDecor(this.scene, this.mountain);
    this.decor.build();

    GameSettings.load();
    Input.init(this.renderer.domElement);
    AudioManager.prepare();
    Input.onGesture(() => AudioManager.unlock());
    this.penguin = new PenguinController(this.scene);
    new PenguinVisual(this.penguin);
    this.penguin.teleport(this.mountain.spawnPoint, this.mountain.spawnYaw);
    this.camera.position.set(0, 60, -200);
    this.cam = new ThirdPersonCamera(this.camera, this.mountain);
    this.cam.target = this.penguin.object;
    Effects.snowFall(this.penguin.object);

    // temporary (Task 4): straight into play, click to capture the mouse
    const game = this;
    refs.game = { get isPlaying() { return game.playing; }, currentStage: 0, sendToBottom: () => this.penguin.teleport(this.mountain.spawnPoint, this.mountain.spawnYaw) };
    this.playing = true;
    this.cam.mode = CamMode.Follow;
    this.cam.snapBehindTarget();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    Effects.setPixelScale(h * this.renderer.getPixelRatio() / (2 * Math.tan(this.camera.fov * Math.PI / 360)));
  }

  start() {
    this.last = performance.now();
    this.renderer.setAnimationLoop(now => this.frame(now));
  }

  private frame(now: number) {
    const raw = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    Time.unscaledDeltaTime = raw;
    Time.unscaledTime += raw;
    Time.deltaTime = raw * Time.timeScale;
    Time.time += Time.deltaTime;
    Time.frameCount++;

    if (Time.timeScale > 0) {
      const steps = this.stepper.stepsFor(Time.deltaTime);
      for (let i = 0; i < steps; i++) { Loop.fixed(); Physics.world.step(); this.penguin.afterStep(); }
    }
    refs.alpha = this.stepper.alpha;
    Input.pollGamepad();
    if (this.playing && !Input.isLocked && Input.mouseClicked) Input.lockPointer();
    Loop.update();
    Scheduler.update();
    Loop.late();
    AudioManager.update();
    Effects.update(Time.deltaTime);
    this.decor.focusShadows(this.penguin.object.position);
    this.renderer.render(this.scene, this.camera);
    Input.endFrame();
  }
}

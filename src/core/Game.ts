import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Time, FixedStepper } from './time.ts';
import { Loop } from './loop.ts';
import { Scheduler } from './coroutines.ts';
import { refs } from './refs.ts';
import { Physics } from '../physics/Physics.ts';
import { MountainGenerator } from '../world/MountainGenerator.ts';
import { WorldDecor } from '../world/WorldDecor.ts';
import { Effects } from '../world/Effects.ts';

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
  private debugControls: OrbitControls | null = null;

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

    // temporary viewer (Task 3): orbit the mountain
    this.camera.position.set(0, 60, -200);
    this.debugControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.debugControls.target.set(0, 45, 0);
    const follow = new THREE.Object3D();
    follow.position.copy(this.mountain.spawnPoint);
    this.scene.add(follow);
    Effects.snowFall(follow);
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
      for (let i = 0; i < steps; i++) { Loop.fixed(); Physics.world.step(); }
    }
    Loop.update();
    Scheduler.update();
    this.debugControls?.update();
    Loop.late();
    Effects.update(Time.deltaTime);
    this.decor.focusShadows(this.debugControls ? this.debugControls.target : this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }
}

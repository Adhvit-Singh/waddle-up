import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

async function boot() {
  await RAPIER.init();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5a8fd8);
  const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  cam.position.set(0, 1, 3);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial());
  scene.add(cube);
  document.getElementById('loading')!.remove();
  renderer.setAnimationLoop(() => { cube.rotation.y += 0.01; renderer.render(scene, cam); });
}
boot();

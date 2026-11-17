import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

/** What a collider belongs to (replaces GetComponent lookups on Unity colliders). */
export interface Owner {
  ledge?: import('../world/Ledge.ts').Ledge;
  sweeper?: boolean;
  mountain?: number;      // tier index
  penguin?: boolean;
  snowball?: object;
  object?: THREE.Object3D;
}

export interface Hit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  collider: RAPIER.Collider;
  owner: Owner | undefined;
}

const owners = new Map<number, Owner>();
let world: RAPIER.World;
let penguinBody: RAPIER.RigidBody | undefined;

const v = (p: THREE.Vector3) => ({ x: p.x, y: p.y, z: p.z });
const ID = { x: 0, y: 0, z: 0, w: 1 };
const FLAGS = RAPIER.QueryFilterFlags?.EXCLUDE_SENSORS ?? 8;

export const Physics = {
  get world() { return world; },
  init() {
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 0.02;
    return world;
  },
  setPenguinBody(b: RAPIER.RigidBody) { penguinBody = b; },
  register(c: RAPIER.Collider, owner: Owner) { owners.set(c.handle, owner); return c; },
  unregister(c: RAPIER.Collider) { owners.delete(c.handle); },
  ownerOf(c: RAPIER.Collider | null | undefined): Owner | undefined { return c ? owners.get(c.handle) : undefined; },

  /** Physics.Raycast (ignores triggers and the penguin, like Unity's layer mask). */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): Hit | null {
    const d = dir.clone().normalize();
    const ray = new RAPIER.Ray(v(origin), v(d));
    const h = world.castRayAndGetNormal(ray, maxDist, true, FLAGS, undefined, undefined, penguinBody, enabledOnly);
    if (!h) return null;
    const point = origin.clone().addScaledVector(d, h.timeOfImpact);
    return { point, normal: new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z), distance: h.timeOfImpact, collider: h.collider, owner: owners.get(h.collider.handle) };
  },

  /** Physics.SphereCast. Shapes already overlapping at the start are ignored, as in Unity. */
  sphereCast(origin: THREE.Vector3, radius: number, dir: THREE.Vector3, maxDist: number): Hit | null {
    const d = dir.clone().normalize();
    const h = world.castShape(v(origin), ID, v(d), new RAPIER.Ball(radius), 0, maxDist, false, FLAGS, undefined, undefined, penguinBody, enabledOnly);
    if (!h || h.time_of_impact <= 0) return null;
    return {
      point: new THREE.Vector3(h.witness1.x, h.witness1.y, h.witness1.z),
      normal: new THREE.Vector3(h.normal1.x, h.normal1.y, h.normal1.z),
      distance: h.time_of_impact, collider: h.collider, owner: owners.get(h.collider.handle),
    };
  },

  /** Physics.CheckCapsule between two sphere centers. */
  checkCapsule(a: THREE.Vector3, b: THREE.Vector3, radius: number): boolean {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const half = a.distanceTo(b) * 0.5;
    const c = world.intersectionWithShape(v(mid), ID, new RAPIER.Capsule(half, radius), FLAGS, undefined, undefined, penguinBody, enabledOnly);
    return c != null;
  },
};

function enabledOnly(c: RAPIER.Collider) { return c.isEnabled(); }

export { RAPIER };

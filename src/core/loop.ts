/** Unity-like update registry: anything with fixedUpdate / update / lateUpdate gets called each frame. */
export interface Behaviour {
  enabled?: boolean;
  fixedUpdate?(): void;
  update?(): void;
  lateUpdate?(): void;
}

const list: Behaviour[] = [];

export const Loop = {
  add<T extends Behaviour>(b: T): T { list.push(b); return b; },
  remove(b: Behaviour) { const i = list.indexOf(b); if (i >= 0) list.splice(i, 1); },
  fixed() { for (const b of list.slice()) if (b.enabled !== false) b.fixedUpdate?.(); },
  update() { for (const b of list.slice()) if (b.enabled !== false) b.update?.(); },
  late() { for (const b of list.slice()) if (b.enabled !== false) b.lateUpdate?.(); },
};

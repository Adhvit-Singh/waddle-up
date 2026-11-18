/** The 8 penguin roles. Chosen at New Game, locked for the whole run. Traps are identical for every role. */
export interface RoleMods {
  speed: number;          // walking speed multiplier
  groundSpeed: number;    // extra multiplier while on the ground (Ice Skater)
  jump: number;           // jump velocity multiplier
  gravity: number;        // gravity multiplier
  grip: number;           // hang (grip) time multiplier
  knockback: number;      // how hard trap knock-backs and gusts push (1 = normal)
  passThrough: number;    // chance a trap knock-back / gust passes straight through (Ghost)
  noStun: boolean;        // big falls never stun
  groundAccel: number;    // multiplier on ground acceleration / braking (lower = slippier)
  iceAccel: number;       // multiplier on acceleration / braking on ice
  tremble: boolean;       // Scaredy: controls shake more the higher you are, tunnel vision up high
  wander: boolean;        // Squirrel: idle 2 s → wanders off
  glances: boolean;       // Squirrel: camera glances at "shiny things"
  lateJump: number;       // Bird Brain: chance a jump fires 0.35 s late
  drift: number;          // Bird Brain: controls rotated off-centre by up to this many degrees
  flip: boolean;          // Show-off: flips on every jump, landing direction nudged
  jumpZoom: boolean;      // Show-off: dramatic camera zoom on jumps
  seeThrough: boolean;    // Ghost: the penguin is see-through
}

export interface Role {
  id: string;
  name: string;
  tagline: string;
  description: string;
  plus: string;
  minus: string;
  taunts: string[];
  mods: RoleMods;
}

const BASE: RoleMods = {
  speed: 1, groundSpeed: 1, jump: 1, gravity: 1, grip: 1, knockback: 1, passThrough: 0, noStun: false,
  groundAccel: 1, iceAccel: 1, tremble: false, wander: false, glances: false, lateJump: 0, drift: 0, flip: false, jumpZoom: false, seeThrough: false,
};
const mods = (m: Partial<RoleMods>): RoleMods => ({ ...BASE, ...m });

export const ROLES: Role[] = [
  {
    id: 'normal', name: 'Normal Penguin', tagline: 'The easiest way to suffer.',
    description: 'Just a penguin and a mountain. No special powers, no special problems. The way the climb was meant to hurt.',
    plus: '', minus: '', taunts: [], mods: mods({}),
  },
  {
    id: 'scaredy', name: 'Scaredy Penguin', tagline: 'Afraid of heights. Climbing a mountain. Great plan.',
    description: 'Totally fine at the bottom. The higher it climbs, the more it panics: shaky flippers, tunnel vision, quiet whimpering.',
    plus: 'Grip lasts 50% longer while hanging. It holds on for dear life.',
    minus: 'Controls tremble more the higher you get, and your view narrows near the top.',
    taunts: ["Don't look down. ...You looked down.", 'Deep breaths. Penguin breaths.', 'The ground is very far away. Just so you know.', 'Your flippers are shaking. So is the mountain. (It isn\'t.)'],
    mods: mods({ grip: 1.5, tremble: true }),
  },
  {
    id: 'squirrel', name: 'Squirrel Mode', tagline: 'Ooh, shiny!',
    description: 'Fast, eager and absolutely unable to focus. Stop for a second and it wanders off; the camera keeps getting distracted by shiny things.',
    plus: 'Moves 15% faster than a normal penguin.',
    minus: 'Stand still for 2 seconds and it wanders off. The camera randomly glances away.',
    taunts: ['Was that a fish? It was not a fish.', 'Focus. FOCUS. ...ooh, a cloud.', 'You were climbing. Remember climbing?'],
    mods: mods({ speed: 1.15, wander: true, glances: true }),
  },
  {
    id: 'birdbrain', name: 'Bird Brain', tagline: 'Lights on, nobody home.',
    description: 'A lovable little dummy. Too dim to notice when it belly-flops, but it takes a moment to remember how jumping works.',
    plus: 'Big falls never stun it. It just gets back up, confused.',
    minus: '1 in 4 jumps happen a beat late, and its sense of direction drifts slightly.',
    taunts: ['It forgot to jump. Then it remembered. Then it fell.', 'Thinking... thinking... splat.', 'Which way is up? (It\'s up.)'],
    mods: mods({ noStun: true, lateJump: 0.25, drift: 10 }),
  },
  {
    id: 'old', name: 'Old Penguin', tagline: 'Back in my day the mountain was smaller.',
    description: 'A creaky veteran with heavy old bones. Slow, stubborn and very hard to knock over. Complains the whole way up.',
    plus: 'Never stunned by falls, and traps and wind push it 40% less.',
    minus: 'Walks 20% slower and jumps a little lower.',
    taunts: ['My knees! MY KNEES!', 'In my day we climbed this mountain both ways.', 'Slow and steady. Mostly slow.'],
    mods: mods({ speed: 0.8, jump: 0.95, noStun: true, knockback: 0.6 }),
  },
  {
    id: 'showoff', name: 'Show-off', tagline: 'Did you see that? DID YOU SEE THAT?',
    description: 'Every jump is a performance. Big air, a flip and a dramatic camera zoom, whether it lands or not.',
    plus: 'Jumps 15% higher than a normal penguin.',
    minus: 'Every jump flips, nudging where you land, with a dramatic camera zoom.',
    taunts: ['Style points: 10. Landing: 0.', 'The crowd goes mild.', 'That flip was unnecessary. Like you.'],
    mods: mods({ jump: 1.15, flip: true, jumpZoom: true }),
  },
  {
    id: 'skater', name: 'Ice Skater', tagline: 'Glides like a dream. Stops like a nightmare.',
    description: 'Born on ice and never learned to brake. Zooms around on the ground, but every surface feels a little slippery, and real ice is a disaster.',
    plus: 'Runs 20% faster on the ground.',
    minus: 'Everything is slippery, and icy ledges are almost impossible to stop on.',
    taunts: ['Brakes not included.', 'Graceful. Briefly.', 'That was a triple axel off a cliff.'],
    mods: mods({ groundSpeed: 1.2, groundAccel: 0.32, iceAccel: 0.4 }),
  },
  {
    id: 'ghost', name: 'Ghost Penguin', tagline: 'Already dead. Still climbing.',
    description: 'A see-through spirit penguin. Some traps go straight through it, but it floats around like a balloon and is hard to see.',
    plus: '1 in 3 trap knock-backs and gusts pass right through it.',
    minus: 'Floaty low gravity makes jumps long and hard to aim, and you\'re see-through.',
    taunts: ['Boo. ...Boo-hoo.', 'You can\'t die twice. You can fall twice though.', 'Spooky. Clumsy, but spooky.'],
    mods: mods({ gravity: 0.72, passThrough: 0.33, seeThrough: true }),
  },
];

export const roleById = (id: string | null | undefined) => ROLES.find(r => r.id === id) ?? ROLES[0];

/** the role of the run being played (set by the game when a run starts) */
let current = ROLES[0];
export const CurrentRole = {
  get role() { return current; },
  get mods() { return current.mods; },
  set(id: string) { current = roleById(id); },
};

import { UnityRandom } from '../core/rng.ts';

export const Taunts = {
  SmallFall: [
    'Oops.', 'That was avoidable.', 'Gravity: 1. Penguin: 0.', 'Have you tried not falling?',
    'Waddle harder.', 'A minor setback. Emphasis on minor. For now.', 'Again?', 'Bold of you.',
    'The ledge was RIGHT there.', "Penguins can't fly. Noted.", 'Close! Not really.', 'Skill issue.',
  ],
  MediumFall: [
    'There goes a few minutes.', 'The mountain says hi. From way up there.', 'Bold strategy.',
    "That's a lot of stairs you'll be doing again.", 'Have you considered a different hobby?',
    'The view from down here is lovely though.', 'Whoops-a-daisy.', 'Physics: working as intended.',
    'Somewhere, a seagull is laughing.', 'You were doing so well. Relatively.',
  ],
  BigFall: [
    'Spectacular.', 'History will remember this fall.', "That's a LOT of meters to re-climb.",
    'Ever thought about knitting? Knitting is nice.', 'The penguin is fine. Its dignity is not.',
    'Speedrunning the descent, I see.', 'Somewhere a physics teacher is proud.',
    'Truly, a fall for the ages.', "Hope you enjoyed the scenery. You'll see it again.",
  ],
  Bottom: [
    'Welcome back to the beginning!', 'Ah, the scenic route.', 'Back to square one. Literally.',
    "Fresh start! Isn't that nice?", 'The bottom missed you.',
  ],
  GripLost: [
    'Your flippers are not designed for this.', "Penguins don't have fingers. Who knew.",
    'Grip strength: penguin.', 'Hold on! ...no, not like that.',
  ],
  Achievements: [
    'Achievement: Gravity Enthusiast', 'Achievement: Pressed Space', 'Achievement: Still Here',
    'Achievement: Looked At The Sky', 'Achievement: Participation Trophy', 'Achievement: Walked Forward',
    'Achievement: Did Nothing Wrong (This Time)',
  ],
  Idle: [
    "Take your time. The mountain isn't going anywhere.", 'Still thinking?', 'The penguin is getting cold.',
    'Any day now.', 'Contemplating life choices?',
  ],
  pick: (arr: string[]) => arr[UnityRandom.rangeInt(0, arr.length)],
  forFall(meters: number) {
    if (meters > 45) return Taunts.pick(Taunts.BigFall);
    if (meters > 15) return Taunts.pick(Taunts.MediumFall);
    return Taunts.pick(Taunts.SmallFall);
  },
};

# Penguin Wardrobe — Design (approved 2026-11-18)

**Intent:** players dress up the penguin with goofy cosmetics. Approved by the user: "(a) … put it in game right now".

## Decisions (user)
- Everything free, chosen any time, **purely cosmetic** (nothing reacts in game, nothing changes physics).
- Colour = one **body colour scheme** category (option a); items have fixed designs.
- Categories and counts: Body colour 14 · Eyes 12 · Hats 15 · Outfits 12 · Accessories 30 · Feet 10 (lists as agreed in chat).

## Decisions (mine, stated in chat, not objected to)
- **WARDROBE** button in the main menu and in the pause menu (pausing to change is fine; the timer is paused).
- Screen: item list + tabs on the left; the live penguin on the right with the camera orbiting it slowly.
  **RANDOMISE** and **RESET** buttons. Saved in the browser (`wu_outfit`). Esc / BACK closes it.
- Unknown or missing saved ids fall back to the default (classic penguin, googly eyes, red beanie, nothing else).

## Build
- `src/player/cosmetics/Catalog.ts`: pure data + builders (MeshBuilder), testable in Node.
- `src/player/cosmetics/Outfit.ts`: outfit state, load/save/normalize, randomise.
- `PenguinVisual.applyOutfit()`: rebuilds the cosmetic meshes on the existing animated skeleton (body, head, flippers, feet).
- Camera mode `Wardrobe`: slow close orbit around the penguin.

## Tests
- Catalog: exact counts, unique ids, defaults exist, every item builds, sizes stay sane (nothing > 1.3 m from its anchor).
- Outfit storage: round trip, bad/unknown ids → defaults, randomise only picks valid ids.
- Browser: open the wardrobe from the menu and from pause, pick an item in every tab, randomise, reset, reload keeps the outfit.

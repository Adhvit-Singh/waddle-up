# Waddle Up — Changelog

A plain-language list of every major update to the game, newest first. It's updated after every major update.
(Technical details of how each change was built and tested are in [`GAME_LOG.md`](GAME_LOG.md).)

---

## v0.8 — No More Pause-Quit Cheating (2026-11-18)
- **Fixed a cheat:** pausing mid-fall and quitting to the menu put you back on the ledge you fell from.
  Now the game saves the fall itself, so Continue carries on falling exactly where you left it.
- Also closed two related holes: quitting while stunned after a big fall, and quitting during a
  "back to the bottom" trap (trapdoor, golden fish). Both now keep you where the game put you.
- The home page says **"by Adhvit"**, and the credits open with **"a game by Adhvit"**, with
  **Game Design: Adhvit** further down.

## v0.7 — Penguin Roles (2026-11-18)
- **New: choose a role when you start a New Game.** It's locked for the whole climb; to switch, start a new game.
  Normal is the easiest; every other role has one advantage and a bigger disadvantage. Traps are the same for everyone.
  | Role | Advantage | Disadvantage |
  |---|---|---|
  | Normal Penguin | — | — |
  | Scaredy Penguin | grip lasts 50% longer | controls tremble more the higher you are, tunnel vision near the top |
  | Squirrel Mode | 15% faster | wanders off if you stand still for 2 s, camera glances away |
  | Bird Brain | never stunned by falls | 1 in 4 jumps happen late, direction drifts |
  | Old Penguin | never stunned, traps and wind push it 40% less | 20% slower, jumps a bit lower |
  | Show-off | jumps 15% higher | every jump flips and nudges the landing, dramatic zoom |
  | Ice Skater | 20% faster on the ground | everything is slippery, ice is nearly impossible |
  | Ghost Penguin | 1 in 3 trap knock-backs and gusts pass through | floaty low gravity, see-through |
- Your role shows under the stage name, on the stats screen, and each role keeps its own best time.
- Each role has its own taunts. "Give Up (Restart)" asks for a role again.

## v0.6 — The Wardrobe (2026-11-18)
- **New: WARDROBE** (main menu and pause menu). Dress up your penguin, all free and purely cosmetic:
  - **Colours (14):** classic, hot pink, toxic green, gold chrome, rainbow, zebra, leopard, see-through ghost,
    burnt toast, snow camo, glow-in-the-dark, cow, galaxy, traffic-cone orange
  - **Eyes (12)**, **Hats (15 + No Hat)**, **Outfits (12)**, **Extras (30)**, **Feet (10)**
  - RANDOMISE for chaos outfits, RESET for the classic penguin. Your outfit is saved in the browser.
- The main menu buttons are slightly slimmer so everything fits on short screens.

## v0.5 — Heavier Traps (2026-11-18)
- Traps fire much more often: **30% → 80%** chance per new ledge (was 10% → 45%), only **2 seconds** between traps.
  Roughly 3 traps per stage early on, 5 in the middle, 6+ near the top.
- Gust and Seagull keep their old chance.
- Control flips (inverted, mirrored, rotated 90°) **last twice as long**.

## v0.4 — Play-Test Fixes (2026-11-18)
- Fixed: after the first fake summit you could end up trapped halfway up the next tier.
- Fixed: you could grab the loop above and skip a whole round (top of the mountain widened, plus a no-skip grab rule).
- Fixed: stage 18's low ceilings where the penguin bumped its head.
- Wind gusts are half as strong.
- The camera swings outward instead of getting jammed against the rock.
- Pause: **Esc can't resume** any more, only clicking RESUME does, and RESUME now always runs away 4–7 times.
- Developer menu (F10, local only) no longer pauses the game.

## v0.3 — A Real Mountain (2026-11-18)
- The mountain is a tapering, craggy peak: carved gullies, rocky ribs, crags on the summits, patchy snow, rock texture.
- Ledges are rocky outcrops growing out of the cliff (icy, cracked and crystal variants for the special ones).
- Hills and small mountains around, a forest three times thicker, small pines on the slopes.
- **8 new traps:** seagull, fall-through ledge, tilting ledge, slippery grab, camera troll (zoom / upside-down),
  input lag, fake crash, fake "save corrupted".
- Traps never repeat on the same ledge in one game, and avoid your previous game's pattern.
- The trapdoor sends you to the start of the stage instead of the very bottom.
- Fixed: bouncy (pink) ledges now actually bounce.

## v0.2 — First Fixes (2026-11-17)
- Fixed: random jump launches and uneven jumps. Jumps now feel exactly like the Unity version.
- Fixed: the world was mirror-imaged. It now climbs counter-clockwise like the original.
- Fixed: mouse look sometimes snapping to a new direction.

## v0.1 — Web Version (2026-11-17)
- Waddle Up remade for the browser (no Unity): the same 20 stages, mountain, traps, fake summits, asteroid ending,
  procedural sounds and music, menus and saving.

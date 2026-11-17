# Penguin Roles — Design (approved 2026-11-18)

**Intent:** at the start of a run the player picks one of 8 roles. Normal is the easiest; every other role has one real
advantage and a bigger disadvantage. All traps stay exactly as they are. Approved: "ya these seems fine implement them".

## Rules (user)
- 8 roles (table below). The role is **locked for the whole game**; to switch you start a New Game.
- Every role has a proper description (what it is, its advantage, its disadvantage).
- Traps unchanged.

## Roles
| id | Name | Advantage | Disadvantage |
|---|---|---|---|
| normal | Normal Penguin | — | — |
| scaredy | Scaredy Penguin | grip lasts 50% longer | controls tremble more the higher you are; tunnel vision up high |
| squirrel | Squirrel Mode | 15% faster | idle 2 s → wanders off; camera glances at "shiny things" |
| birdbrain | Bird Brain | belly-flops never stun it | 1 in 4 jumps fire 0.35 s late; controls drift off-centre |
| old | Old Penguin | never stunned; trap knock-backs and gusts push it 40% less | 20% slower, jumps a bit lower |
| showoff | Show-off | jumps 15% higher | every jump flips and nudges the landing direction; dramatic camera zoom |
| skater | Ice Skater | 20% faster on the ground | everything is slippery; real ice is lethal |
| ghost | Ghost Penguin | 1 in 3 trap knock-backs / gusts pass through | floaty (low gravity), see-through |

## Build
- `src/player/roles/Roles.ts`: role data (name, description, plus, minus, taunts) + numeric modifiers (pure, tested).
- `SaveData.role` (old saves → `normal`); best time per role (`wu_besttime` for Normal, `wu_besttime_<id>` otherwise).
- PenguinController reads the modifiers (speed, jump, gravity, grip, stun, ground grip, input effects); traps call a
  role-aware `knockback()` (bouncy ledges and cutscenes still use plain `launch()`).
- NEW GAME (and GIVE UP) → role-select screen (8 cards) → START. HUD shows the role; stats screen shows it.

## Safety (tests)
- **Every role can still make every jump** (rise and gap of all 296 jumps, using the role's speed/jump/gravity).
- **No role can land on a ledge more than 2 ahead** (no new skip routes from bigger jumps).
- Save/role normalisation; role data complete (descriptions, plus/minus for all but Normal).
- Browser: role screen on New Game, chosen role in HUD + save, Continue keeps it, Give Up asks again, effects measurable
  (e.g. Old walks slower, Squirrel faster).

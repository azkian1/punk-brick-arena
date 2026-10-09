# Punk Brick Arena

A browser arena prototype where one player and three bots fight in a destructible 160 × 160 arena. Later rounds introduce bot alliances and coordinated roles. The player wins by surviving every opponent; losing the player's Core ends the run immediately. Fire real inventory parts, break procedural cover, collect debris, and build one of five rock-punk bodies downward from your original head. A winning player carries the surviving construction and spare-part reserve into a fresh battle.

Built with TypeScript, Three.js, and Vite. The game runs in the browser with local assets and no backend or accounts. The interface and project documentation are in English.

Current local snapshot: **v2 Battle Royal patch** (2026-10-09). See [Release notes](docs/RELEASE_NOTES.md) for the full patch scope and accepted verification. The playable mode is the four-fighter battle; a selectable 1×1 duel is a future proposal. The package metadata remains `0.1.0`.

**[Play Punk Brick Arena](https://azkian1.github.io/punk-brick-arena/)** in a browser with a keyboard and mouse or touch controls.

## About the project

Punk Brick Arena is an independent, noncommercial fan project inspired by CryptoPunks, created purely for NFT culture with no financial interest. It is not affiliated with, sponsored by, or endorsed by CryptoPunks or LEGO.

Created by [@azaticus on Twitter / X](https://x.com/azaticus).

Character generation uses source code from [Punk to Bricks](https://github.com/hs7j4yk4sz-boop/punk-to-bricks) by **[John Karp (@johnkarp)](https://x.com/johnkarp)**. Thank you for making the generator available. Using that code does not imply its author's involvement in or endorsement of this game. You can also [try the original generator](https://hs7j4yk4sz-boop.github.io/punk-to-bricks/).

The game's original source code and documentation are released under the [MIT License](LICENSE). You may use, modify, fork, and redistribute that code, including commercially, while retaining the copyright and license notices. The project's noncommercial purpose does not add a noncommercial restriction to the code license. A link back to [Punk Brick Arena](https://github.com/azkian1/punk-brick-arena) is appreciated.

Third-party code and assets retain their own licenses and rights. The project license does not grant rights to CryptoPunks images, character likenesses, or third-party trademarks. See [Third-party notices](THIRD_PARTY_NOTICES.md) for source credits, the original generator license, and asset terms.

## Quick start

Use Node.js 22.12 or newer and npm. This snapshot was verified with Node.js 24.11.0 and npm 11.6.1. Dependencies are pinned by `package-lock.json`.

From the project directory:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). The development server binds to the local computer and requires port 5173 to be free. No environment variables or asset generation are needed for the first run: generated characters, portraits, and audio are included.

Use a browser with WebGL support and hardware acceleration. Desktop play uses a keyboard and mouse. On a touch device, use the left joystick to move and touch the arena to aim and fire.

## Play

1. Choose one of 17 heads and an evolution: Mosher, Guitar Demon, Stage Spider, Bass Titan, or Winged Frontman.
2. Start a battle with three bots, four corner spawns, and random walls, towers, ruins, steps, and arches.
3. Choose 1–20 parts per shot with the slider under DASH. Each volley spends available spare parts first, then safely removed body parts; its damage equals the parts actually fired. Break cover or opponents, dodge, and collect debris to repair and grow.
4. Survive all three opponents. If your Core is destroyed, **DEFEAT / You Lost** appears immediately; restart or choose a character.
5. Pick up the center color rune when it appears every 30 combat seconds to restore your installed head/body palette. After a player victory, finish loose reward collection and choose **Next Round** to keep your build, or **Start Over** to reset.

| Control | Action |
| --- | --- |
| WASD or arrow keys | Move in the arena plane |
| Mouse | Aim |
| Left mouse button | Fire; hold for repeated shots |
| Left touch joystick | Move on touch devices |
| Touch the arena | Aim and fire; hold for repeated shots |
| Space / DASH button | Dash in the movement direction, or toward aim from rest; 2.4-second cooldown |
| PARTS / SHOT slider | Request 1–20 real parts per volley; starts at 1 |
| P or Escape | Pause or resume combat or victory collection |
| R | Restart the run at round 1 outside the lobby |
| M | Toggle sound outside the lobby; a sound button is also available |

Player base speed is 19.8375 world units/second; bot base speed is 15.20875 before difficulty modifiers. Running and dashing are 15% faster than the preceding battle snapshot.

Movement and shortcuts use physical key positions. Space triggers one dash per press; dashing permits fire and grants no invulnerability. Buildings block movement and dashes, with sliding along their faces.

Switching windows or hiding the tab pauses combat/collection and clears held input. Resume explicitly. Form inputs keep normal keyboard behavior; Space/Enter activate menu controls normally.

## Menus and match flow

| Screen | Available actions |
| --- | --- |
| Lobby | Select a head/path, start, toggle sound, read instructions and credits |
| Combat | Move, aim, fire, choose parts per shot, dash, collect the color rune, pause or restart |
| Victory collection | Watch loose loot repair/growth; pause/resume or restart |
| Pause | Resume the interrupted phase, restart, or choose a character |
| Victory result | Next Round, Start Over, or Choose Character |
| Defeat result | Restart or Choose Character; Next Round is unavailable |

Eliminating a bot releases its stock and combat continues while the player has opponents. Player death ends combat immediately, even with several bots alive; the result does not invent a winner. A sole surviving player finishes loose reward collection before the victory result. P/Escape does not dismiss a result. Shot count and sound settings survive in-page restarts; reload resets them. Roster paging preserves the selected character.

## Current rules

- **Real parts are ammunition.** Each shot requests 1–20 parts and transfers as many real parts as available, consuming reserve before safely removable non-Core body pieces. Body removal is deterministic and preserves surviving connectivity without a firing cascade. A bare Core with no stock cannot fire.
- **Shots preserve every part.** One logical volley packs its real parts visually and resolves one nearest contact. Every ID, dimension, color, and shape stays intact; every spent part becomes debris after impact or a non-damaging boundary arc. No lifetime timeout deletes ammunition.
- **Fired recovery is shared.** No fighter can collect a fired part until it lands and reaches five seconds since firing. This age continues through impact/rebound, and the lock remains during victory collection.
- **Damage follows ammunition.** Direct damage equals the number of parts actually fired, with a default one-part shot. Hits remove up to that many eligible target pieces, then detach unsupported sections; cascades can exceed direct damage. There is no independent damage setting.
- **Core protection is temporary.** The Core stays protected until attached pieces reach `max(1, floor(roundStartPieces × 0.4))`; a damage batch starting protected cannot remove it. Firing can also expose it. Repair cannot rearm protection during that battle. Core destruction eliminates the fighter.
- **Cover is destructible.** Twenty clustered buildings mix five procedural types and block shots, movement, and dashes. Four diagonal routes, each 52 world units wide, connect the corner spawns to a clear center and accommodate the largest authored body. Local damage drops unsupported sections using all remaining floor anchors. Grounded fragments survive, and demolished gaps become traversable. Their bricks can repair, grow, bank, or fire.
- **Combat loot is contested.** Ordinary damage debris must settle and reach 0.8 seconds; its last owner waits five seconds from detachment. Dead fighters release banked parts as floor loot. Nearest eligible fighters compete for up to 8 pickups each per simulation step.
- **Repair precedes planned growth.** Exact-size compatible missing slots are filled before connected new body slots. Original color and shape are preserved. Unused parts go to reserve; parts are not resized, split, combined, or rotated to fit.
- **Survive every opponent.** The player must outlast all three bots. Player Core destruction immediately freezes combat, inputs, debris ages and rune time and shows defeat. Pending shots become drops with their fired ages and five-second lock preserved. A player victory collects remaining loose debris and fired parts after their lock; standing buildings are not awarded.
- **Victories continue the run.** Next Round preserves attached inventory, Core, repair history, evolution stage and reserve, rearms protection from attached starting count, and generates three fresh base bots and a new map. Start Over, the lobby, or reload clears the run.
- **Three forms.** Start as a head and assemble phase 2. After victory collection/assembly, at least 85% of its body slots unlocks phase 3 using existing body parts and stock. No replacement parts are granted; phase 3 is final.
- **A color rune restores installed colors.** A cube appears at the clear center every 30 combat seconds and remains until a living player or bot touches it. Each pickup restores the selected head's original colors and a dark clothing/silver/detail palette for the chosen body, once. IDs, geometry, missing parts, reserve, drops and active shots are unchanged; later loot keeps its own color. Uncollected runes do not stack.
- **Bots cooperate as rounds advance.** Round 1 is free-for-all. In round 2, two bots ally and share a target; the player and third bot remain independent. From round 3, all three bots ally against the player. From round 4, two attack from different angles while one gathers and grows. Losing at least 35% of a bot's attained attached build triggers recovery; a healthy collector immediately replaces it. Returning requires 90% restoration, preventing repeated role switching. Allies cannot hurt each other. Bots use real DASH with the same duration/recharge rules, choose 1–20 actual parts per volley and can sustain player-rate fire when stocked or using bounded body ammunition while healthy. Recovery and harvesting spend real parts and never create free health or ammunition.
- **Storage is automatic.** Two equally sized desktop HUD columns align with the arena's visible top and bottom, with large numbers and a common Segoe UI font. Your build/Core, evolution, repair and growth sit above Backpack on the left; DASH sits above parts per shot on the right. Smaller windows use compact cards; short touch and mouse windows show the Backpack header/count. Its transparent 3D stage samples actual stored parts. Opponent counters, time/round/alive counters, Rival stock and pickup-report toasts are absent. Repair/growth totals remain in the player card. Each battle starts with 24 neutral loose pieces. Attachment caps at 16,000 per fighter; eligible excess loot can remain banked.

Combat uses planar collision with circular actor bounds and actual remaining building footprints. The earliest swept contact blocks a shot; pointing at a fighter's visible body aims at its arena position. Camera framing follows living constructions and cover. Pause freezes simulation timers, including fired-part recovery, rune spawning and reward collection.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server on port 5173 |
| `npm test` | Run the Vitest suite once |
| `npm run build` | Type-check `src/` and build the static site into `dist/` |
| `npm run security:check` | Check credential patterns and publication boundaries after a fresh build |
| `npm run preview` | Serve the production build locally; run the build first |
| `npm run assets:generate` | Regenerate all character templates and diagnostics from local PNGs |

For production preview, use the URL printed by Vite. GitHub Pages publishes the game automatically after tests, build, and publication checks pass on `main`. Other static hosts can serve the complete `dist/` directory; set `DEPLOY_BASE_PATH` when deploying below a path prefix. See [Development](docs/DEVELOPMENT.md).

## Project layout

```text
index.html                 Browser entry point
src/main.ts                Input, four-fighter simulation, immediate defeat, shots and debris
src/game/                  Structure, part ammo, projectiles, cover, evolution, bots, rounds
src/render.ts              Three.js arena and instanced character rendering
src/ui.ts                  Lobby, HUD, pause and result screens
src/style.css              Responsive interface styles
src/sound.ts               Local samples and synthesized feedback
src/assets/                Roster, generated templates, diagnostics, provenance
src/vendor/punk-to-bricks/  Pinned offline generator and original notices
scripts/                   Development, asset preparation, battle browser audit
vite.config.js             Production CSP and local preview security headers
prototypes/brick-evolution/ Authored models, assembly viewer, and prototype validation
public/assets/             Source portraits, audio, attribution
art/evolutions/            Color concept illustrations for offline reference
docs/                      Technical and testing documentation
```

The ignored `artifacts/` directory contains local review pages, earlier QA outputs, and a pickup benchmark. It is not required to run or build the game.

## Documentation

| Document | Contents |
| --- | --- |
| [Product requirements](PRD.md) | Implemented gameplay, scope, and acceptance criteria |
| [Architecture](docs/ARCHITECTURE.md) | Modules, data model, simulation, geometry, rendering, and state transitions |
| [Evolution and reserve](docs/EVOLUTION.md) | Five playable paths, phase progression, exact-part assembly, and stock carryover |
| [Development](docs/DEVELOPMENT.md) | Setup, commands, configuration, build, hosting, and troubleshooting |
| [Asset pipeline](docs/ASSETS.md) | Character roster, generator conversion, provenance, and audio preparation |
| [Testing](docs/TESTING.md) | Automated coverage, manual checks, diagnostics, and verification results |
| [Gameplay audit](docs/GAMEPLAY_AUDIT.md) | Current battle harness, conservation/fixtures, and historical duel evidence |
| [Performance audit](docs/PERFORMANCE_AUDIT.md) | Local hardware, measured bottlenecks, optimizations, and repeatable profiling |
| [Security audit](docs/SECURITY_AUDIT.md) | Dependencies, UI data, credential scans, production policy, and hosting scope |
| [Third-party notices](THIRD_PARTY_NOTICES.md) | Existing source credits and license notices |

## Status and credits

Version `0.1.0` is a playable prototype. Match duration, bot difficulty, balance, and performance across devices still need playtesting. Runs, inventories, and settings are held in memory and are not saved across reloads. There is no online multiplayer, gamepad support, or character editor. The intended 2–5 minute match length is a design target, not an enforced limit.

The final 2026-10-09 coordinated-bot rule suite passed 446 tests in 23 files. `scripts/bot-squad-browser-audit.mjs` checks alliances, real recovery/replacement, rapid reserve/body fire and DASH through the production loop, plus five partial native-map behavior runs. The current `scripts/battle-browser-audit.mjs` harness checks earlier combat/progression regressions; its default assisted matches and granted fixtures have different scopes. Exact commands, reports and snapshot dates are recorded in [Testing](docs/TESTING.md). The earlier HUD/367-test record and the 2026-10-06 199-test/100-match duel audit remain historical and do not establish current human balance or GPU FPS. Device performance and remote hosting settings still need verification; Vite's large-chunk warning remains.

Characters come from the 17 sample portraits supplied with the vendored Punk to Bricks revision. Its generator code carries John Karp's MIT notice; image rights are documented separately. Combat samples are credited to kurt and Kenney. See [Third-party notices](THIRD_PARTY_NOTICES.md) and the distribution copy at [public/assets/ATTRIBUTION.txt](public/assets/ATTRIBUTION.txt). The project's [MIT License](LICENSE) applies to its original code and documentation; it does not relicense third-party artwork or trademarks.

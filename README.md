# Punk Brick Arena

A browser arena prototype where one player fights a bot using destructible brick characters. Shoot pieces off your opponent, collect the debris, repair your construction, and grow into an increasingly asymmetric mutant. Destroy the opponent's Core to win and carry your surviving construction into the next fight.

Built with TypeScript, Three.js, and Vite. The game runs in the browser with local assets and no backend, accounts, or blockchain integration. The interface and project documentation are in English.

## About the project

Punk Brick Arena is an independent, noncommercial fan project inspired by CryptoPunks, created purely for NFT culture with no financial interest. It is not affiliated with, sponsored by, or endorsed by CryptoPunks or LEGO.

Created by [@azaticus on Twitter / X](https://x.com/azaticus).

Character generation uses source code from [Punk to Bricks](https://github.com/hs7j4yk4sz-boop/punk-to-bricks) by **[John Karp (@johnkarp)](https://x.com/johnkarp)**. Thank you for making the generator available. Using that code does not imply its author's involvement in or endorsement of this game. You can also [try the original generator](https://hs7j4yk4sz-boop.github.io/punk-to-bricks/).

The game's source code is available to explore, modify, and fork. Credit to **Punk Brick Arena** and a link back to the original project would be appreciated. Existing third-party license and attribution requirements still apply; this invitation does not grant rights to third-party images or trademarks. See [Third-party notices](THIRD_PARTY_NOTICES.md) for the original credits and notices.

## Quick start

Use Node.js 22.12 or newer and npm. This snapshot was verified with Node.js 24.11.0 and npm 11.6.1. Dependencies are pinned by `package-lock.json`.

From the project directory:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). The development server binds to the local computer and requires port 5173 to be free. No environment variables or asset generation are needed for the first run: generated characters, portraits, and audio are included.

Use a desktop browser with WebGL support, hardware acceleration, a keyboard, and a mouse. The lobby adapts to narrow screens, but touch combat controls are not implemented.

## Play

1. Choose one of 17 characters across three roster pages and inspect its live 3D preview.
2. Start against a randomly selected character controlled by an easy Balanced bot.
3. Shoot, dash away from incoming projectiles, and move near settled debris to collect it automatically.
4. Reduce the opponent's construction until its Core becomes vulnerable, then destroy it.
5. Let victory collection finish, then choose **Next Round** to keep your mutant or **Start Over** to restart with the base character.

Next Round is the victory action that preserves the mutant; Start Over is the restart action that returns to round 1.

| Control | Action |
| --- | --- |
| WASD or arrow keys | Move in the arena plane |
| Mouse | Aim |
| Left mouse button | Fire; hold for repeated shots |
| Space | Dash in the movement direction, or toward aim from rest; 2.4-second cooldown |
| P or Escape | Pause or resume combat or victory collection |
| R | Restart the run at round 1 outside the lobby |
| M | Toggle sound outside the lobby; a sound button is also available |

Movement and letter shortcuts use physical key positions, so switching keyboard layouts does not change the bindings. Space activates one dash per press; holding it does not repeat the burst. You can shoot during a dash, but it grants no invulnerability.

Switching away from the window or hiding the tab pauses combat or victory collection and clears held movement/fire. Return to the game and resume explicitly. Game shortcuts are ignored while a form input, such as the damage slider, has focus. Space and Enter retain their normal menu activation behavior on buttons, links, and expandable settings.

## Menus and match flow

| Screen | Available actions |
| --- | --- |
| Lobby | Browse roster pages, select a character, start a fight, adjust shared damage, toggle sound, read instructions and credits |
| Combat | Move, aim, fire, dash, pause, restart with R, or mute with M |
| Victory collection | Watch automatic repair/growth; pause/resume, restart, and mute remain available; movement, fire, and dash stop |
| Pause | Resume the interrupted phase, restart from the base character, choose a character, or adjust shared damage |
| Victory result | Continue with Next Round, restart from the base character, or choose a character |
| Defeat result | Restart from the base character or choose a character; Next Round is unavailable |

The result screen stays open until an action is chosen; P/Escape does not dismiss it. Damage and sound settings survive restarts and returning to the lobby. Reloading resets them. Changing roster pages alone does not change the selected character.

## Current rules

- **Your body is your health.** Each brick or plate counts as one gameplay piece, regardless of its dimensions. Projectiles are separate objects and never consume body pieces.
- **Damage is random, with cascades.** A hit removes up to 10 eligible pieces by default, then detaches everything disconnected from the Core. The lobby and pause menu provide a shared player/bot damage slider from 1 to 20.
- **Core protection is temporary.** The Core is excluded from random damage until a hit leaves at most `max(1, floor(roundStartPieces × 0.4))` pieces. It becomes eligible on the following hit. Pickups can delay exposure, but cannot restore protection after exposure in that round. Exposure alone is not defeat.
- **Combat pickup requires landing.** Debris must settle and be at least 0.8 seconds old. Its last owner must wait 5 seconds from detachment. These timers use simulation time and freeze during pause.
- **Repair comes before growth.** A collected piece fills a compatible recorded vacancy first, otherwise it attaches to an available face. Dimensions, color, and shape are preserved; solid volumes cannot overlap. Failed placements stay on the ground.
- **Combat pickup happens in batches.** Each fighter can collect up to 8 pieces per simulation step. Collection range grows with the construction. Contested loot is resolved by distance, subject to eligibility, placement, and the batch limit.
- **Victories can form a run.** Next Round preserves attached pieces, positions, colors, the Core, and remaining repair vacancies. Enemies start from base templates. The other 16 characters are shuffled without repeats within a cycle or at cycle boundaries.
- **Victory collection.** Combat and its clock stop; remaining debris flies to the winner and repairs or grows its body. Landing and ownership delays no longer apply after victory. The result appears after collection finishes. The 16,000-piece cap still applies; rejected pieces remain on the ground. Pause freezes this stage too.
- **Four bot styles and opening difficulty.** Round 1 uses an easy Balanced bot; round 2 uses a medium Balanced bot. From round 3, a full-strength Aggressor, Collector, Sniper, or Balanced bot is picked independently each fight, with repeats allowed. Balanced bots alternate approaching, strafing, and collecting. Aggressors pressure without dodging, Collectors seek safe loot, and Snipers keep their distance and fire rapidly under close pressure. The HUD identifies the style, opening difficulty, and sniper panic. There is no manual style or difficulty selector.
- **Only attached pieces carry forward.** Any debris left after victory collection is discarded between fights. Each fight starts with 24 neutral loose pieces. Returning to the lobby, restarting, or reloading loses the current run.

Combat uses planar collision even though characters are rendered in 3D. Pointing at the opponent's visible body aims at its arena position; there is no separate height targeting. Live pickup stops at 16,000 attached pieces per fighter, and character render buffers grow as needed.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server on port 5173 |
| `npm test` | Run the Vitest suite once |
| `npm run build` | Type-check `src/` and build the static site into `dist/` |
| `npm run preview` | Serve the production build locally; run the build first |
| `npm run assets:generate` | Regenerate all character templates and diagnostics from local PNGs |

For production preview, use the URL printed by Vite. Deploy the complete `dist/` directory to a static host. Audio and portrait paths currently assume hosting at the domain root; subdirectory hosting requires path changes. See [Development](docs/DEVELOPMENT.md).

## Project layout

```text
index.html                 Browser entry point
src/main.ts                Input, fixed-step simulation, bot, projectiles, debris
src/game/                  Structure, pickup, movement, bots, victory, rounds
src/render.ts              Three.js arena and instanced character rendering
src/ui.ts                  Lobby, HUD, pause and result screens
src/style.css              Responsive interface styles
src/sound.ts               Local samples and synthesized feedback
src/assets/                Roster, generated templates, diagnostics, provenance
src/vendor/punk-to-bricks/  Pinned offline generator and original notices
scripts/                   Development server and asset preparation
public/assets/             Source portraits, audio, distributable attribution
docs/                      Technical and testing documentation
```

The ignored `artifacts/` directory contains local review pages, earlier QA outputs, and a pickup benchmark. It is not required to run or build the game.

## Documentation

| Document | Contents |
| --- | --- |
| [Product requirements](PRD.md) | Implemented gameplay, scope, acceptance criteria, and deferred ideas |
| [Architecture](docs/ARCHITECTURE.md) | Modules, data model, simulation, geometry, rendering, and state transitions |
| [Development](docs/DEVELOPMENT.md) | Setup, commands, configuration, build, hosting, and troubleshooting |
| [Asset pipeline](docs/ASSETS.md) | Character roster, generator conversion, provenance, and audio preparation |
| [Testing](docs/TESTING.md) | Automated coverage, manual checks, diagnostics, and verification results |
| [Third-party notices](THIRD_PARTY_NOTICES.md) | Existing source credits and license notices |

## Status and credits

Version `0.1.0` is a playable prototype. Match duration, bot difficulty, balance, and performance across devices still need playtesting. There is no save system, online multiplayer, gamepad support, or character editor. The intended 2–5 minute match length is a design target, not an enforced limit.

On 2026-10-05, the English interface update passed all **159 tests in 11 files** and the production build. A local Chromium review covered 11 UI states at desktop and narrow viewport sizes, with no page errors, Cyrillic text, or detected text overflow. Character regeneration changed only the 17 subtitles; geometry and diagnostics stayed identical. Vite reports a JavaScript chunk above its 500 kB warning threshold. The long-run test checks structure and render-buffer counts beyond 7,000 pieces; it is not a browser frame-rate benchmark. See [Testing](docs/TESTING.md) for verification scope and limits.

Characters come from the 17 sample portraits supplied with the vendored Punk to Bricks revision. Its generator code carries John Karp's MIT notice; image rights are documented separately. Combat samples are credited to kurt and Kenney. See [Third-party notices](THIRD_PARTY_NOTICES.md) and the distribution copy at [public/assets/ATTRIBUTION.txt](public/assets/ATTRIBUTION.txt). This snapshot does not contain a project-wide `LICENSE` file; the generator's MIT notice does not declare a license for all project content.

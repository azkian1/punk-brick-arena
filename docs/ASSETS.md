# Asset Pipeline

The browser uses pre-generated character JSON, local PNG portraits, and local audio. It does not generate models or request third-party media during gameplay. See [Third-party notices](../THIRD_PARTY_NOTICES.md) for retained credits and rights information.

## Files and provenance

| Location | Purpose |
| --- | --- |
| [src/assets/catalog.ts](../src/assets/catalog.ts) | Ordered roster, IDs, display names, subtitles, accents, portrait mapping |
| [public/assets/source/](../public/assets/source/) | Seventeen original sample PNGs used by generation and the lobby |
| [src/assets/templates.generated.json](../src/assets/templates.generated.json) | Complete runtime `CharacterTemplate[]` data |
| [src/assets/templates.ts](../src/assets/templates.ts) | Typed import of the generated JSON; no runtime schema validation |
| [src/assets/templates.diagnostics.json](../src/assets/templates.diagnostics.json) | Generated piece counts, bounds, Core contacts, connectivity, and upstream checks |
| [src/assets/provenance.json](../src/assets/provenance.json) | Pinned repository/commit and original Git blob hashes |
| [src/vendor/punk-to-bricks/](../src/vendor/punk-to-bricks/) | Copied generator modules, parts data, license, and disclaimer |
| [scripts/generate-templates.ts](../scripts/generate-templates.ts) | Project-specific offline importer |

The pinned repository is recorded in provenance as Punk to Bricks by John Karp, revision `15e95d6c4ed55cbc48ed3dd9a463a80fed443008`. The script also embeds this revision in each template's source URL. Generation does not fetch it: all required generator code and images are local.

The 17 PNGs match their recorded Git blob hashes exactly. The 11 recorded vendored text files (license, nine TypeScript modules, and parts data) each contain one extra trailing LF relative to the recorded upstream blob. Removing that single final byte for comparison reproduces the original hashes. Their code/data content is otherwise unchanged; raw file hashes therefore differ. The generator disclaimer is retained separately and has no entry in that manifest.

## Included roster

Names are game-specific labels, not CryptoPunk token IDs. Base counts come from the generated templates and diagnostics.

| Character ID | Display name | Source PNG | Pieces |
| --- | --- | --- | ---: |
| `violet` | VIOLET | `reference.png` | 423 |
| `flare` | FLARE | `a-1.png` | 499 |
| `ranger` | RANGER | `b-1.png` | 446 |
| `pilot` | PILOT | `b-2.png` | 452 |
| `ember` | EMBER | `b-3.png` | 420 |
| `ghoul` | GHOUL | `b-4.png` | 385 |
| `candy` | CANDY | `b-5.png` | 389 |
| `frost` | FROST | `b-6.png` | 403 |
| `spike` | SPIKE | `c-1.png` | 453 |
| `smoke` | SMOKE | `c-2.png` | 424 |
| `ivory` | IVORY | `c-3.png` | 377 |
| `shade` | SHADE | `c-4.png` | 519 |
| `hood` | HOOD | `c-5.png` | 639 |
| `rust` | RUST | `c-6.png` | 398 |
| `prism` | PRISM | `c-7.png` | 447 |
| `blaze` | BLAZE | `c-8.png` | 480 |
| `halo` | HALO | `c-9.png` | 553 |

Every character is selectable and can be an opponent when a different template is selected. The UI derives roster pages and piece counts from these arrays rather than maintaining separate count constants.

## Runtime presentation and credits

Bot style and difficulty are assigned independently of the character template. Aggressor, Collector, Sniper, and Balanced behavior share this same roster; no separate bot models or portraits are generated for the opening difficulty tiers. Next Round carries the player's attached geometry in memory without writing it back into template JSON. Movement, menu, and bot-rule changes do not require asset regeneration unless they also change the catalog, importer, or geometry format.

The lobby uses the catalog portrait for both the selected source-image inset and the character card, and renders the matching generated model in the shared WebGL preview. Its About section links to the creator, CryptoPunks, the original Punk to Bricks generator/author, and `/assets/ATTRIBUTION.txt`. These links are UI content in `src/ui.ts`; generation does not maintain them. Keep the README credits, lobby credits, and distributed notices consistent when changing provenance.

## Regenerating templates

From the project root, after installing dependencies:

```sh
npm run assets:generate
npm test
npm run build
```

Generation overwrites `templates.generated.json` and `templates.diagnostics.json`. It does not update portraits, the catalog, provenance, or notices. It prints per-template diagnostics and requires no external service.

The pipeline reads each catalog entry's PNG using `pngjs`, calls `detectPunk()`, and then calls `buildModel(grid, 'mini')`. The upstream detector expects a recognizable 24×24 Punk-style pixel grid. Although the detection module can analyze supplied RGBA buffers from larger images, this project's command reads PNG files only.

The builder maps image colors to its brick palette, constructs supported layers, repairs disconnected details, and adds base/top pieces. The importer preserves the builder's resulting pieces, not the PNG's exact original RGB palette. It uses the default Mini profile; the upstream XL and `preferLego` options are not exposed by the game command.

Generation rejects upstream collisions or floating pieces, then converts each builder piece as follows:

```text
position.x = x - (minX + maxX) / 2
position.y = (y - minY) * 0.4
position.z = -(z + d) + (minZ + maxZ) / 2
size       = { x: w, y: h * 0.4, z: d }
color      = model.colors[c]
shape      = kind
id         = characterId + '-' + zero-padded piece index
```

Converted positions and heights are rounded to three decimal places. Upstream X/Z dimensions use studs and Y/heights use plates. Multiplying plate units by 0.4 produces consistent stud units. The depth reflection puts the face toward +Z while preserving box minimum corners and topology.

The importer builds face-contact adjacency and selects a Core near the lower middle, favoring pieces with multiple neighbors. It verifies that all pieces connect to that Core before writing templates. Diagnostics also retain upstream weak-joint and center-of-mass information; those are descriptive and are not separate import rejection conditions.

All 17 included templates report zero upstream collisions/floating pieces and full game Core connectivity. The English interface update regenerated the templates on 2026-10-05 after translating all 17 catalog subtitles. Only subtitles changed: a comparison excluding that field confirmed identical template content, and the diagnostics JSON remained byte-identical. Keep catalog subtitles and generated metadata in sync by regenerating after copy changes.

## Vendored generator modules

| Module | Role in the offline pipeline |
| --- | --- |
| `detect.ts` | Locate/sample the pixel grid and cluster image colors |
| `color.ts` | Color conversion and color-distance calculations |
| `palette.ts` | Map source colors to brick colors while preserving visible distinctions |
| `analyze.ts` | Classify body, protrusions, supports, and front/back fill |
| `parts.ts` | Upstream piece format, dimensions, and part identifiers |
| `tile.ts` | Fill layers with rectangular pieces while respecting color/support constraints |
| `build.ts` | Construct Mini/XL models, repair supports, generate steps/BOM/checks |
| `check.ts` | Validate upstream stud connections, grounding, collisions, and balance |
| `lego.ts` | Consult local element availability data when requested by the builder |
| `data/elements.json` | Recorded parts lookup data used by `lego.ts` |

Upstream grounding starts from bottom-layer pieces and uses vertical stud connections. Game connectivity starts from one Core and accepts any shared face with positive area, including sides. These are different checks and both matter to the import pipeline.

The game keeps piece geometry/color/shape and provenance, but does not retain upstream part numbers, bill of materials, assembly steps, support flags, or slope direction in its runtime piece schema. Brick bodies are rendered as boxes; tiles and slopes omit studs. The included Mini roster contains no slopes.

## Adding or replacing characters

1. Add an appropriate source PNG to `public/assets/source/` and an ordered entry with a unique ID to `catalog.ts`.
2. Update source provenance and credits. The current importer constructs source URLs from one fixed repository/revision; change that metadata logic for assets from another source instead of leaving misleading URLs.
3. Run generation and inspect diagnostics. Resolve invalid input or disconnected output before treating it as a runtime asset.
4. Update roster-specific test expectations deliberately. Current tests require exactly the 17 pinned examples, verify their portrait hashes, and assume those IDs in round scenarios.
5. Run tests/build and manually inspect the portrait, preview, combat silhouette, damage, repair, and collection.

Keep the original vendor license and attribution. Generated templates are loaded with a TypeScript cast rather than a runtime validator, so generation and tests are the primary safeguards for new content. At least two templates are required by the round API.

## Audio preparation

| Runtime file | Use | Recorded origin |
| --- | --- | --- |
| `public/assets/audio/gunshot.wav` | Player and bot shots | Processed excerpt from kurt's **22 Magnum.wav** |
| `public/assets/audio/impact.ogg` | Hit feedback | Kenney `impactWood_heavy_001.ogg` |
| `public/assets/audio/debris.ogg` | Larger cascades | Kenney `impactGeneric_light_001.ogg` |

Source links and notices are retained in [Third-party notices](../THIRD_PARTY_NOTICES.md). Kenney's original notice is at [public/assets/audio/Kenney-LICENSE.txt](../public/assets/audio/Kenney-LICENSE.txt). Pickup, win, and loss cues are synthesized at runtime rather than loaded from files.

To recreate the included shot from the original source file, run from the project root:

```sh
node scripts/prepare-gunshot.mjs "path/to/22-Magnum.wav"
```

The script requires 96 kHz stereo PCM16 WAV input and overwrites `public/assets/audio/gunshot.wav`. It detects the first sample above the transient threshold, includes 192 source frames before onset, averages stereo channels and sample pairs, and writes 0.42 seconds of 48 kHz mono PCM16 audio with attenuation and fades. The original WAV must be supplied separately; the script does not download it. Existing runtime audio is sufficient for normal setup.

## Distribution notices

`THIRD_PARTY_NOTICES.md` is mirrored at `public/assets/ATTRIBUTION.txt` so Vite includes it in the static output. Keep those two files synchronized when changing asset credits. Vendor notices concern their respective upstream content; no project-wide license is declared in this snapshot.

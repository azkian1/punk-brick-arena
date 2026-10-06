# Third-party notices

## Project license scope

Punk Brick Arena's original code and documentation are MIT-licensed, copyright
(c) 2026 azaticus (azkian1). See the root `LICENSE` file. This license does not
relicense third-party code, images, character likenesses, audio, or trademarks.
The following notices and upstream terms apply to their respective materials.

## Combat audio

- `public/assets/audio/gunshot.wav`: excerpt of **22 Magnum.wav**, from
  [Gunshots by kurt](https://opengameart.org/content/gunshots), released under
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
  Source file: https://opengameart.org/sites/default/files/22%20Magnum.wav
  One recorded shot was extracted, converted from 96 kHz stereo PCM16 to
  48 kHz mono, attenuated, and faded to 0.42 seconds. Reproducible processing:
  `scripts/prepare-gunshot.mjs`.
- `public/assets/audio/impact.ogg` and `debris.ogg`: unmodified
  `impactWood_heavy_001.ogg` and `impactGeneric_light_001.ogg` from
  [Impact Sounds by Kenney](https://kenney.nl/assets/impact-sounds), CC0 1.0.
  Original license retained in `public/assets/audio/Kenney-LICENSE.txt`.

These files are served locally; audio playback does not contact external sites.

## Punk to Bricks generator

Source: https://github.com/hs7j4yk4sz-boop/punk-to-bricks

Pinned revision: `15e95d6c4ed55cbc48ed3dd9a463a80fed443008`.

Generator modules from `src/core/` and `src/data/elements.json` are vendored under `src/vendor/punk-to-bricks/`. Their code/data content matches the pinned source; each recorded vendored text file, including the license, has one additional trailing newline in this local copy. The original Git blob hashes are retained in `src/assets/provenance.json`. These modules are used only by the offline asset build script; the game imports the resulting JSON and makes no runtime requests to the generator.

`scripts/generate-templates.ts` uses the original detection, palette, and Mini builder. It preserves every brick's size, color, and kind, converts plate heights to stud units (0.4), centers horizontal coordinates, flips depth to face the camera, and assigns IDs and a Core. It does not modify the generated topology. All 17 exported models have zero overlaps and are connected to their Core using the game's face-contact rule.

Original license:

```text
MIT License

Copyright (c) 2026 John Karp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Source images and generated character examples

These examples are from the same pinned repository revision:

- VIOLET: `public/examples/reference.png` (423 Mini pieces).
- FLARE: `public/examples/a-1.png` (499 Mini pieces).
- RANGER: `public/examples/b-1.png` (446 Mini pieces).
- PILOT: `public/examples/b-2.png` (452 Mini pieces).
- EMBER: `public/examples/b-3.png` (420 Mini pieces).
- GHOUL: `public/examples/b-4.png` (385 Mini pieces).
- CANDY: `public/examples/b-5.png` (389 Mini pieces).
- FROST: `public/examples/b-6.png` (403 Mini pieces).
- SPIKE: `public/examples/c-1.png` (453 Mini pieces).
- SMOKE: `public/examples/c-2.png` (424 Mini pieces).
- IVORY: `public/examples/c-3.png` (377 Mini pieces).
- SHADE: `public/examples/c-4.png` (519 Mini pieces).
- HOOD: `public/examples/c-5.png` (639 Mini pieces).
- RUST: `public/examples/c-6.png` (398 Mini pieces).
- PRISM: `public/examples/c-7.png` (447 Mini pieces).
- BLAZE: `public/examples/c-8.png` (480 Mini pieces).
- HALO: `public/examples/c-9.png` (553 Mini pieces).

The source PNGs are retained at `public/assets/source/`; exact Git blob hashes are recorded in `src/assets/provenance.json`. These are generator sample busts with game-specific display names.

The upstream README explicitly states that its MIT license covers code only, not CryptoPunks images or any trademark. Those images and the likenesses of these example models retain their respective third-party rights. Their inclusion in this fan project is not a grant of an open-content license or a claim that permission for redistribution has been established. Anyone reusing or distributing the artwork must establish the applicable rights separately; consult the [CryptoPunks license terms](https://licenseterms.cryptopunks.app/) or replace the examples with owned or appropriately licensed source images. The same local generator pipeline supports that replacement.

Upstream parts data is attributed to Rebrickable. LEGO, BrickLink, and CryptoPunks are not affiliated with this prototype.

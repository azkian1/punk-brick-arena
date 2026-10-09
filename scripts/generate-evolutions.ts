import { readFileSync, writeFileSync } from 'node:fs';
import type { CharacterTemplate, Piece } from '../src/game/types';

// Geometry never grants prototype stock. The optional rune palette is applied
// only when a fighter collects a rune; ordinary loot keeps its own color.
const palette = ['#252936', '#454c60', '#8b5cf6', '#c2ccd8', '#674b36', '#de684b', '#36a995', '#ca9b45', '#a855b2'];
const accent: Record<string, number> = { mosher: 2, guitar: 5, spider: 6, bass: 7, frontman: 8 };
function runeColor(id: string, zone: string): number {
  if (/spike|knuckle|cuff|rim|lug|microphone|leading|finger|horn/.test(zone)) return 3;
  if (/guitar-neck|headstock|neck/.test(zone)) return 4;
  if (/lapel|belt|guitar-body|drum-shell|membrane|dustcap/.test(zone)) return accent[id];
  if (/shin|thigh|pelvis|cone/.test(zone)) return 1;
  return 0;
}
const ids = ['mosher', 'guitar', 'spider', 'bass', 'frontman'];
const colors: { id: string; stage: number; colors: number[] }[] = [];
const plans = ids.flatMap(id => [2, 3].map(stage => {
  const { model } = JSON.parse(readFileSync(new URL(`../prototypes/brick-evolution/data/${id}-${stage}.json`, import.meta.url), 'utf8')) as {
    model: CharacterTemplate & { pieces: (Piece & { zone: string })[] };
  };
  const head = model.pieces.filter(p => p.zone === 'original-head');
  colors.push({ id, stage, colors: model.pieces.filter(p => p.zone !== 'original-head').map(p => runeColor(id, p.zone)) });
  return { id, stage, neckY: Math.min(...head.map(p => p.position.y)),
    slots: model.pieces.filter(p => p.zone !== 'original-head').map(p =>
      [p.position.x, p.position.y, p.position.z, p.size.x, p.size.y, p.size.z]) };
}));
writeFileSync(new URL('../src/assets/evolutions.generated.json', import.meta.url), JSON.stringify(plans));
writeFileSync(new URL('../src/assets/evolution-colors.generated.json', import.meta.url), JSON.stringify({ palette, plans: colors }));
console.log(`Exported ${plans.length} evolution bodies without donor stock.`);

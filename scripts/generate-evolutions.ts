import { readFileSync, writeFileSync } from 'node:fs';
import type { CharacterTemplate, Piece } from '../src/game/types';

// Runtime plans contain geometry only. Donor colors and prototype stock must
// never grant the player free parts or override the colors of actual loot.
const ids = ['mosher', 'guitar', 'spider', 'bass', 'frontman'];
const plans = ids.flatMap(id => [2, 3].map(stage => {
  const { model } = JSON.parse(readFileSync(new URL(`../prototypes/brick-evolution/data/${id}-${stage}.json`, import.meta.url), 'utf8')) as {
    model: CharacterTemplate & { pieces: (Piece & { zone: string })[] };
  };
  const head = model.pieces.filter(p => p.zone === 'original-head');
  return { id, stage, neckY: Math.min(...head.map(p => p.position.y)),
    slots: model.pieces.filter(p => p.zone !== 'original-head').map(p =>
      [p.position.x, p.position.y, p.position.z, p.size.x, p.size.y, p.size.z]) };
}));
writeFileSync(new URL('../src/assets/evolutions.generated.json', import.meta.url), JSON.stringify(plans));
console.log(`Exported ${plans.length} evolution bodies without donor stock.`);

/** Rebuild offline game templates from the pinned Punk to Bricks generator. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { detectPunk } from '../src/vendor/punk-to-bricks/core/detect';
import { buildModel } from '../src/vendor/punk-to-bricks/core/build';
import type { CharacterTemplate, Piece } from '../src/game/types';
import { CHARACTER_CATALOG } from '../src/assets/catalog';

const COMMIT = '15e95d6c4ed55cbc48ed3dd9a463a80fed443008';
const REPOSITORY = 'https://github.com/hs7j4yk4sz-boop/punk-to-bricks';
const root = new URL('../', import.meta.url);
const examples = CHARACTER_CATALOG;

const epsilon = 1e-6;
function touches(a: Piece, b: Piece): boolean {
  const axes = ['x', 'y', 'z'] as const;
  return axes.some(axis => {
    const face = Math.abs(a.position[axis] + a.size[axis] - b.position[axis]) < epsilon
      || Math.abs(b.position[axis] + b.size[axis] - a.position[axis]) < epsilon;
    return face && axes.filter(other => other !== axis).every(other =>
      Math.min(a.position[other] + a.size[other], b.position[other] + b.size[other])
        - Math.max(a.position[other], b.position[other]) > epsilon);
  });
}

const diagnostics: object[] = [];
const templates: CharacterTemplate[] = examples.map(example => {
  const png = PNG.sync.read(readFileSync(new URL(`public/assets/source/${example.file}.png`, root)));
  const model = buildModel(detectPunk(png), 'mini');
  if (model.checks.collisions || model.checks.floating) {
    throw new Error(`${example.file}: upstream geometry failed checks: ${JSON.stringify(model.checks)}`);
  }
  const minX = Math.min(...model.pieces.map(p => p.x));
  const maxX = Math.max(...model.pieces.map(p => p.x + p.w));
  const minZ = Math.min(...model.pieces.map(p => p.z));
  const maxZ = Math.max(...model.pieces.map(p => p.z + p.d));
  const minY = Math.min(...model.pieces.map(p => p.y));
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const pieces: Piece[] = model.pieces.map((p, index) => ({
    id: `${example.id}-${String(index).padStart(4, '0')}`,
    position: {
      x: round(p.x - (minX + maxX) / 2),
      y: round((p.y - minY) * 0.4),
      // Generator's face is at -Z. Reflect the minimum corner so it faces +Z.
      z: round(-(p.z + p.d) + (minZ + maxZ) / 2),
    },
    size: { x: p.w, y: round(p.h * 0.4), z: p.d },
    color: model.colors[p.c],
    shape: p.kind,
  }));
  const adjacency = pieces.map((a, i) => pieces.flatMap((b, j) => i !== j && touches(a, b) ? [j] : []));
  const height = Math.max(...pieces.map(p => p.position.y + p.size.y));
  // Prefer an interior piece near the lower middle with several face contacts.
  const centrality = (p: Piece, i: number) => {
    const x = p.position.x + p.size.x / 2, z = p.position.z + p.size.z / 2;
    const y = p.position.y + p.size.y / 2 - height * 0.4;
    return x * x + z * z + y * y - Math.min(adjacency[i].length, 8) * 0.5;
  };
  const coreIndex = pieces.reduce((best, p, i) => centrality(p, i) < centrality(pieces[best], best) ? i : best, 0);
  const connected = new Set([coreIndex]);
  const queue = [coreIndex];
  for (let i = 0; i < queue.length; i++) {
    for (const neighbor of adjacency[queue[i]]) if (!connected.has(neighbor)) {
      connected.add(neighbor); queue.push(neighbor);
    }
  }
  if (connected.size !== pieces.length) throw new Error(`${example.file}: only ${connected.size}/${pieces.length} pieces connected to Core`);
  diagnostics.push({
    id: example.id, sourceImage: `${example.file}.png`, pieces: pieces.length,
    connected: connected.size, coreId: pieces[coreIndex].id, coreContacts: adjacency[coreIndex].length,
    dimensions: { x: maxX - minX, y: height, z: maxZ - minZ }, upstreamChecks: model.checks,
  });
  return {
    id: example.id, name: example.name, subtitle: example.subtitle, accent: example.accent,
    coreId: pieces[coreIndex].id, pieces,
    source: `${REPOSITORY}/blob/${COMMIT}/public/examples/${example.file}.png`,
  };
});

mkdirSync(new URL('src/assets/', root), { recursive: true });
writeFileSync(new URL('src/assets/templates.generated.json', root), JSON.stringify(templates) + '\n');
writeFileSync(new URL('src/assets/templates.diagnostics.json', root), JSON.stringify({ repository: REPOSITORY, commit: COMMIT, size: 'mini', templates: diagnostics }, null, 2) + '\n');
console.log(`Wrote ${fileURLToPath(new URL('src/assets/templates.generated.json', root))}`);
console.log(JSON.stringify(diagnostics, null, 2));

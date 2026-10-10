// Immutable geometry from the original v2 generator keeps old physical bugs
// reproducible when the live arena's generation and RNG sequence change.
// Never imported by the game entry point; browser QA imports it temporarily.
import raw from './legacy-arena.json';
import { getBounds } from '../structure';
import type { ArenaBuilding, ArenaTemplate } from '../arena';
import type { Piece, Structure } from '../types';

function decode(row: number[]): Piece {
  const [parent, index, x, y, z, size, color] = row;
  const [sx, sy, sz] = raw.sizes[size];
  return { id: raw.parents[parent] + '/piece-' + index, position: { x, y, z },
    size: { x: sx, y: sy, z: sz }, color: raw.colors[color], shape: sy < 1 ? 'plate' : 'brick' };
}
function decodeBuilding(saved: typeof raw.tower): ArenaBuilding {
  const pieces = saved.pieces.map(decode);
  const structure: Structure = { pieces: new Map(pieces.map(piece => [piece.id, piece])), coreId: pieces[0].id,
    vacancies: [], revision: 0, roundStartPieces: pieces.length, coreExposed: true };
  return { id: saved.id, template: saved.template as ArenaTemplate, x: saved.x, z: saved.z,
    structure, bounds: getBounds(structure) };
}
export function legacyTowerFixture(): { tower: ArenaBuilding; spent: Piece[] } {
  return { tower: decodeBuilding(raw.tower), spent: raw.spent.map(decode) };
}
export function legacyEdgeBuildings(): ArenaBuilding[] { return raw.edge.map(decodeBuilding); }

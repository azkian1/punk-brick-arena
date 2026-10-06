import { assetUrl } from './url';

/** All 17 examples from the pinned Punk to Bricks revision, in roster order. */
export const CHARACTER_CATALOG = [
  { file: 'reference', id: 'violet', name: 'VIOLET', subtitle: 'Purple cap', accent: '#be93ff' },
  { file: 'a-1', id: 'flare', name: 'FLARE', subtitle: 'Fiery hair', accent: '#ff8667' },
  { file: 'b-1', id: 'ranger', name: 'RANGER', subtitle: 'Hat and shades', accent: '#a6d8ac' },
  { file: 'b-2', id: 'pilot', name: 'PILOT', subtitle: 'Aviator goggles', accent: '#d4c566' },
  { file: 'b-3', id: 'ember', name: 'EMBER', subtitle: 'Ape in an orange beanie', accent: '#dc8549' },
  { file: 'b-4', id: 'ghoul', name: 'GHOUL', subtitle: 'Zombie in a cap', accent: '#92c27c' },
  { file: 'b-5', id: 'candy', name: 'CANDY', subtitle: 'Pink hair', accent: '#fa95cd' },
  { file: 'b-6', id: 'frost', name: 'FROST', subtitle: 'Alien with a headband', accent: '#9af0ed' },
  { file: 'c-1', id: 'spike', name: 'SPIKE', subtitle: 'Mohawk and shades', accent: '#6dc8bd' },
  { file: 'c-2', id: 'smoke', name: 'SMOKE', subtitle: 'Cigar and earring', accent: '#cbbd99' },
  { file: 'c-3', id: 'ivory', name: 'IVORY', subtitle: 'Black fringe', accent: '#e2cfd4' },
  { file: 'c-4', id: 'shade', name: 'SHADE', subtitle: 'Messy hair', accent: '#c175af' },
  { file: 'c-5', id: 'hood', name: 'HOOD', subtitle: 'Gray hoodie', accent: '#a3acba' },
  { file: 'c-6', id: 'rust', name: 'RUST', subtitle: 'Orange beanie and shades', accent: '#d99a65' },
  { file: 'c-7', id: 'prism', name: 'PRISM', subtitle: 'Mohawk and 3D glasses', accent: '#74b6ff' },
  { file: 'c-8', id: 'blaze', name: 'BLAZE', subtitle: 'Red hair and a cigar', accent: '#ef7669' },
  { file: 'c-9', id: 'halo', name: 'HALO', subtitle: 'Blond curls', accent: '#f2dfa2' },
] as const;

const portraits = new Map(CHARACTER_CATALOG.map(entry => [entry.id as string, `source/${entry.file}.png`]));
export function characterPortrait(id: string): string {
  const path = portraits.get(id);
  if (!path) throw new Error(`Unknown character portrait: ${id}`);
  return assetUrl(path);
}

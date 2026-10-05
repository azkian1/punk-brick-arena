export interface Vec3 { x: number; y: number; z: number }
/** Axis-aligned brick with minimum-corner position, in stud units on every axis. */
export interface Piece {
  id: string;
  position: Vec3;
  size: Vec3;
  color: string;
  shape: 'brick' | 'plate' | 'tile' | 'slope';
}
export interface CharacterTemplate {
  id: string;
  name: string;
  subtitle: string;
  accent: string;
  coreId: string;
  pieces: Piece[];
  source: string;
}
export interface Structure {
  pieces: Map<string, Piece>;
  coreId: string;
  vacancies: Piece[];
  revision: number;
  roundStartPieces: number;
  coreExposed: boolean;
}
export interface DamageResult {
  direct: Piece[];
  cascade: Piece[];
  eliminated: boolean;
}
export interface AttachmentResult {
  piece: Piece;
  mode: 'repair' | 'growth';
}
export type Random = () => number;

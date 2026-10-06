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
  evolution?: EvolutionState;
}
export type EvolutionId = 'mosher' | 'guitar' | 'spider' | 'bass' | 'frontman';
export interface EvolutionPlan {
  id: EvolutionId;
  stage: 2 | 3;
  neckY: number;
  headCount: number;
  slots: Piece[];
  neighbors: number[][];
}
export interface EvolutionState {
  id: EvolutionId;
  stage: 2 | 3;
  template: CharacterTemplate;
  plan: EvolutionPlan;
  occupied: (string | null)[];
  everBuilt: Set<number>;
  reserve: Piece[];
  reserveRevision: number;
}
export interface DamageResult {
  direct: Piece[];
  cascade: Piece[];
  eliminated: boolean;
}
export interface AttachmentResult {
  piece: Piece;
  mode: 'repair' | 'growth' | 'bank';
}
export type Random = () => number;

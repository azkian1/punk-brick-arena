import type { PickupDrop } from './pickup';
import { PriorityQueue } from './priority-queue';

const CELL = 8;
interface Bucket<T> { x: number; z: number; parts: Map<string, Set<T>> }
interface Entry<T> { x: number; z: number; key: string; bucket?: Bucket<T>; epoch: number; order: number }
export interface RankedDrop<T> { drop: T; score: number; compatible: boolean }

/** One shared floor snapshot. Physical part dimensions are immutable on the
 * floor, as in projectileDrops/createBuildingDebris. Queries never own parts. */
export class GroundIndex<T extends PickupDrop = PickupDrop> {
  private entries = new Map<T, Entry<T>>();
  private buckets = new Map<string, Bucket<T>>();
  private epoch = 0;
  revision = 0;
  /** Number of actual parts examined by the most recent ranked/radius query. */
  examined = 0;

  sync(drops: readonly T[]): this {
    const epoch = ++this.epoch;
    for (let order = 0; order < drops.length; order++) {
      const drop = drops[order];
      let entry = this.entries.get(drop);
      if (!entry) {
        entry = { x: drop.x, z: drop.z, key: `${drop.piece.size.x}:${drop.piece.size.y}:${drop.piece.size.z}`, epoch, order };
        this.entries.set(drop, entry); this.revision++;
      }
      entry.epoch = epoch; entry.order = order;
      const moved = entry.x !== drop.x || entry.z !== drop.z;
      const bx = entry.bucket && !moved ? entry.bucket.x : Math.floor(drop.x / CELL);
      const bz = entry.bucket && !moved ? entry.bucket.z : Math.floor(drop.z / CELL);
      if (entry.bucket && (!drop.settled || entry.bucket.x !== bx || entry.bucket.z !== bz)) this.detach(drop, entry);
      if (drop.settled && !entry.bucket) {
        const id = `${bx}:${bz}`;
        let bucket = this.buckets.get(id);
        if (!bucket) { bucket = { x: bx, z: bz, parts: new Map() }; this.buckets.set(id, bucket); }
        let parts = bucket.parts.get(entry.key);
        if (!parts) { parts = new Set(); bucket.parts.set(entry.key, parts); }
        parts.add(drop); entry.bucket = bucket; this.revision++;
      }
      if (moved) { entry.x = drop.x; entry.z = drop.z; if (drop.settled) this.revision++; }
    }
    for (const [drop, entry] of this.entries) if (entry.epoch !== epoch) {
      this.detach(drop, entry); this.entries.delete(drop); this.revision++;
    }
    return this;
  }

  private detach(drop: T, entry: Entry<T>): void {
    const bucket = entry.bucket;
    if (!bucket) return;
    const parts = bucket.parts.get(entry.key)!;
    parts.delete(drop);
    if (!parts.size) bucket.parts.delete(entry.key);
    if (!bucket.parts.size) this.buckets.delete(`${bucket.x}:${bucket.z}`);
    entry.bucket = undefined; this.revision++;
  }
  has(drop: T): boolean { return this.entries.has(drop); }
  order(drop: T): number { return this.entries.get(drop)?.order ?? Infinity; }

  *within(x: number, z: number, radius: number): IterableIterator<T> {
    this.examined = 0;
    for (let bx = Math.floor((x - radius) / CELL); bx <= Math.floor((x + radius) / CELL); bx++) {
      for (let bz = Math.floor((z - radius) / CELL); bz <= Math.floor((z + radius) / CELL); bz++) {
        const bucket = this.buckets.get(`${bx}:${bz}`);
        if (!bucket) continue;
        for (const parts of bucket.parts.values()) for (const drop of parts) {
          this.examined++;
          if ((drop.x - x) ** 2 + (drop.z - z) ** 2 <= radius ** 2) yield drop;
        }
      }
    }
  }

  /** Exact useful-first top k with a proven distance lower bound, not a radius cap.
   * risk must be nonnegative; score must be >= distance * distanceFactor.
   * Rare compatible parts anywhere in the arena remain eligible. */
  ranked(x: number, z: number, useful: ReadonlySet<string>, bank: boolean,
    rank: (drop: T) => RankedDrop<T> | undefined, distanceFactor: number, limit = 12): RankedDrop<T>[] {
    this.examined = 0;
    const best: RankedDrop<T>[] = [];
    const pass = (matching: boolean) => {
      const queue = new PriorityQueue<Bucket<T>>();
      for (const bucket of this.buckets.values()) {
        if (![...bucket.parts.keys()].some(key => useful.has(key) === matching)) continue;
        const dx = Math.max(bucket.x * CELL - x, 0, x - (bucket.x + 1) * CELL);
        const dz = Math.max(bucket.z * CELL - z, 0, z - (bucket.z + 1) * CELL);
        queue.push(bucket, Math.hypot(dx, dz) * distanceFactor);
      }
      while (queue.size) {
        const next = queue.pop()!;
        // Equal scores preserve the original floor order.
        if (best.length === limit && (matching || !best[limit - 1].compatible) && next.priority > best[limit - 1].score) break;
        for (const [key, parts] of next.value.parts) {
          if (useful.has(key) !== matching) continue;
          for (const drop of parts) {
            this.examined++;
            const candidate = rank(drop);
            if (!candidate) continue;
            const at = best.findIndex(other => (candidate.compatible && !other.compatible)
              || candidate.compatible === other.compatible && (candidate.score < other.score
                || candidate.score === other.score && this.order(drop) < this.order(other.drop)));
            if (at >= 0) best.splice(at, 0, candidate);
            else if (best.length < limit) best.push(candidate);
            if (best.length > limit) best.pop();
          }
        }
      }
    };
    if (useful.size) pass(true);
    if (bank && best.length < limit) pass(false);
    return best;
  }
}

const indexes = new WeakMap<readonly PickupDrop[], GroundIndex>();
/** Standalone callers synchronize normally; the live loop shares one snapshot among bots. */
export function groundIndex<T extends PickupDrop>(drops: readonly T[]): GroundIndex<T> {
  let index = indexes.get(drops);
  if (!index) { index = new GroundIndex(); indexes.set(drops, index); }
  return index.sync(drops) as GroundIndex<T>;
}

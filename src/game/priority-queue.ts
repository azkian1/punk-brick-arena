/** A small binary min-heap; stale entries may be discarded by the caller. */
export class PriorityQueue<T> {
  private entries: { value: T; priority: number }[] = [];
  get size(): number { return this.entries.length; }
  push(value: T, priority: number): void {
    const entry = { value, priority }, entries = this.entries;
    let at = entries.length; entries.push(entry);
    while (at > 0) {
      const parent = (at - 1) >>> 1;
      if (entries[parent].priority <= priority) break;
      entries[at] = entries[parent]; at = parent;
    }
    entries[at] = entry;
  }
  pop(): { value: T; priority: number } | undefined {
    const entries = this.entries, first = entries[0], last = entries.pop();
    if (!entries.length || !last) return first;
    let at = 0;
    while (at * 2 + 1 < entries.length) {
      let next = at * 2 + 1;
      if (next + 1 < entries.length && entries[next + 1].priority < entries[next].priority) next++;
      if (entries[next].priority >= last.priority) break;
      entries[at] = entries[next]; at = next;
    }
    entries[at] = last;
    return first;
  }
}

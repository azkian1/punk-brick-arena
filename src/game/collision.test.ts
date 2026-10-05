import { describe, expect, it } from 'vitest';
import { segmentCircleHit } from './collision';
describe('swept projectile collision', () => {
  it('detects a fast shot crossing a character between frames', () => {
    expect(segmentCircleHit(-20, 0, 20, 0, 0, 0, 2)).toBeCloseTo(0.45);
  });
  it('rejects misses and hits beyond the segment', () => {
    expect(segmentCircleHit(-20, 3, 20, 3, 0, 0, 2)).toBeNull();
    expect(segmentCircleHit(-20, 0, -10, 0, 0, 0, 2)).toBeNull();
  });
  it('supports initial overlap without zero-velocity division', () => {
    expect(segmentCircleHit(0, 0, 0, 0, 0, 0, 2)).toBe(0);
    expect(segmentCircleHit(5, 0, 5, 0, 0, 0, 2)).toBeNull();
  });
});

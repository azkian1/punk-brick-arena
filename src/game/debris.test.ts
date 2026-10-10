import { describe, expect, it } from 'vitest';
import { DebrisStack, debrisFloorY, debrisRenderSize, type DebrisBody } from './debris';
import type { Piece } from './types';

const piece = (id: string, x = 1, y = 1.2, z = 1): Piece => ({
  id, position: { x: 0, y: 0, z: 0 }, size: { x, y, z }, color: '#445566', shape: y < 1 ? 'plate' : 'brick',
});
const body = (part: Piece, x = 0, z = 0, rotation = 0): DebrisBody => ({
  piece: part, x, y: debrisFloorY(part), z, rotation, settled: true,
});

describe('debris stack support geometry', () => {
  it('reconciles removed, moved, airborne and rotated supports without keeping phantom top faces', () => {
    const lower = body(piece('lower')), upper = body(piece('upper')), incoming = body(piece('incoming'));
    upper.y = 4;
    const stack = new DebrisStack(), parts = [lower, upper]; stack.sync(parts);
    expect(stack.landingY(incoming)).toBeGreaterThan(4);
    parts.pop(); stack.sync(parts);
    expect(stack.landingY(incoming)).toBeCloseTo(lower.y + debrisRenderSize(lower.piece).y + .012);
    lower.x = 20; stack.sync(parts); expect(stack.landingY(incoming)).toBe(debrisFloorY(incoming.piece));
    lower.x = 0; lower.settled = false; stack.sync(parts);
    expect(stack.landingY(incoming)).toBe(debrisFloorY(incoming.piece));
    const long = body(piece('long', 8, .4, 1)); parts[0] = long; incoming.z = 1.5;
    stack.sync(parts); expect(stack.landingY(incoming)).toBe(debrisFloorY(incoming.piece));
    long.rotation = Math.PI / 2; stack.sync(parts); expect(stack.landingY(incoming)).toBeGreaterThan(debrisFloorY(incoming.piece));
    stack.sync([]); expect(stack.landingY(incoming)).toBe(debrisFloorY(incoming.piece));
  });
  it('retains the floor clearance and exact gap between different-sized physical parts', () => {
    const bottom = body(piece('base', 8, .4, 8)), top = body(piece('top', 2, 1.2, 2));
    const stack = new DebrisStack(); stack.add(bottom);
    expect(bottom.y - debrisRenderSize(bottom.piece).y / 2).toBeCloseTo(.04);
    expect(stack.landingY(top)).toBeCloseTo(bottom.y + debrisRenderSize(bottom.piece).y / 2 + debrisRenderSize(top.piece).y / 2 + .012);
  });
  it('uses the settled support rotation and preserves narrow gaps beside a long rotated part', () => {
    const bottom = body(piece('long', 8, .4, 1), 0, 0, Math.PI / 2), onTop = body(piece('above'), 0, 1.5);
    const beside = body(piece('beside'), 1.5, 0);
    const stack = new DebrisStack(); stack.add(bottom);
    expect(stack.landingY(onTop)).toBeGreaterThan(debrisFloorY(onTop.piece));
    expect(stack.landingY(beside)).toBe(debrisFloorY(beside.piece));
  });
  it('rejects false overlap from a diagonal support bounding box', () => {
    const bottom = body(piece('diagonal', 8, .4, 1), -3, -3, Math.PI / 4);
    const falseCorner = body(piece('gap', .4, .4, .4), -1.8, -1.8);
    const realContact = body(piece('contact', .4, .4, .4), -1.8, -4.2);
    const stack = new DebrisStack(); stack.add(bottom);
    expect(stack.landingY(falseCorner)).toBe(debrisFloorY(falseCorner.piece));
    expect(stack.landingY(realContact)).toBeGreaterThan(debrisFloorY(realContact.piece));
  });
  it('indexes a newly landed part at its final height and leaves touching edges unstacked', () => {
    const lower = body(piece('lower')), upper = body(piece('upper')), incoming = body(piece('incoming'));
    const stack = new DebrisStack(); stack.add(lower);
    upper.y = stack.landingY(upper); stack.add(upper);
    expect(stack.landingY(incoming)).toBeCloseTo(upper.y + debrisRenderSize(upper.piece).y + .012);
    const beside = body(piece('touching'), debrisRenderSize(lower.piece).x, 0);
    expect(stack.landingY(beside)).toBe(debrisFloorY(beside.piece));
  });
  it('lands only on support faces crossed from above, retaining lower support and the stack gap', () => {
    const lower = body(piece('lower')), elevated = body(piece('elevated')), incoming = body(piece('incoming'));
    elevated.y = 4;
    const stack = new DebrisStack(); stack.add(lower); stack.add(elevated);
    const lowerContact = lower.y + debrisRenderSize(lower.piece).y / 2 + debrisRenderSize(incoming.piece).y / 2 + .012;
    expect(stack.landingY(incoming, lowerContact + .1)).toBeCloseTo(lowerContact);
    expect(stack.landingY(incoming, lowerContact - .1)).toBe(debrisFloorY(incoming.piece));
    expect(stack.landingY(incoming, 10)).toBeCloseTo(elevated.y + debrisRenderSize(elevated.piece).y / 2 + debrisRenderSize(incoming.piece).y / 2 + .012);
  });
  it('resolves rotated side contact locally while retaining an obstructed part if every path is blocked', () => {
    const support = body(piece('rotated', 4, 1.2, 1), 0, 0, Math.PI / 2);
    const incoming = body(piece('incoming'), 0, 0);
    const stack = new DebrisStack(); stack.add(support);
    const saved = JSON.stringify(incoming);
    expect(stack.resolveSideContact(incoming, incoming.y, () => false)).toBe(false);
    expect(JSON.stringify(incoming)).toBe(saved);
    expect(stack.resolveSideContact(incoming, incoming.y, () => true)).toBe(true);
    expect(Math.hypot(incoming.x, incoming.z)).toBeLessThan(2);
    expect(stack.landingY(incoming)).toBe(debrisFloorY(incoming.piece));
    expect(incoming.y).toBe(debrisFloorY(incoming.piece));
  });
  it('finds an exact corridor tangent for a long plate blocked by a rotated floor support', () => {
    const support = body(piece('arena-round-7/building-1/piece-205', 4, .4, 1),
      72.61885802289552, 19.34600127080224, .1512581746124638);
    const incoming = body(piece('arena-round-7/building-1/piece-228', 4, .4, 2),
      73.61174043563602, 19.435365813764538, .27293952153755147);
    incoming.y = .16391642365195472; incoming.settled = false;
    const stack = new DebrisStack(); stack.add(support);
    const initial = { x: incoming.x, y: incoming.y, z: incoming.z };
    const narrowCorridor = (x: number, z: number) => x > 60 && x < 78.8 && Math.abs(z - initial.z) < .009;
    const constrained = { ...incoming };
    expect(stack.resolveSideContact(constrained, constrained.y,
      (x, z) => narrowCorridor(x, z) && Math.abs(x - initial.x) <= .11, .1)).toBe(false);
    expect(Math.abs(constrained.x - initial.x)).toBeCloseTo(.1);
    expect(constrained.z).toBe(initial.z); expect(constrained.y).toBe(initial.y);
    expect(stack.resolveSideContact(incoming, incoming.y, narrowCorridor, .1)).toBe(true);
    expect(incoming.x).toBeGreaterThan(initial.x); expect(incoming.x - initial.x).toBeLessThanOrEqual(2);
    expect(incoming.z).toBe(initial.z); expect(incoming.y).toBe(initial.y);
    expect(stack.landingY(incoming)).toBe(debrisFloorY(incoming.piece));
  });
});

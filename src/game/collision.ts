/** First segment/circle contact in the arena plane; catches fast shots between ticks. */
export function segmentCircleHit(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, radius: number): number | null {
  const dx = bx - ax, dz = bz - az, ox = ax - cx, oz = az - cz;
  const c = ox * ox + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return null;
  const b = 2 * (ox * dx + oz * dz), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

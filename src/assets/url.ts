/** Public assets share Vite's base path; offline asset scripts default to root. */
export function assetUrl(path: string): string {
  return `${import.meta.env?.BASE_URL ?? '/'}assets/${path}`;
}

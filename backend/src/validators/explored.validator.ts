export function exploredBody(raw: unknown): boolean | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  return Object.keys(body).length === 1 &&
    Object.hasOwn(body, 'explored') &&
    typeof body.explored === 'boolean'
    ? body.explored
    : null;
}

export function exploredPath(path: string): boolean {
  return /^\/spots\/[^/]+\/explored$/.test(path);
}

export const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]+$/;

export function configuredClient(
  url: string | undefined,
  key: string | undefined
): boolean {
  try {
    const parsed = new URL(url ?? '');
    return (
      (parsed.protocol === 'https:' ||
        (parsed.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(parsed.hostname))) &&
      !parsed.username &&
      !parsed.password &&
      PUBLISHABLE_KEY.test(key ?? '')
    );
  } catch {
    return false;
  }
}

export function radiusBody(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, 'publicRadiusKm') ||
    !Number.isInteger(body.publicRadiusKm) ||
    (body.publicRadiusKm as number) < 1 ||
    (body.publicRadiusKm as number) > 25
  )
    return null;
  return body.publicRadiusKm as number;
}

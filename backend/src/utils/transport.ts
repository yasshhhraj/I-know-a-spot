export type SupabaseTransport = typeof fetch;

export function boundedTransport(
  transport: SupabaseTransport,
  timeoutMs = 5000
): SupabaseTransport {
  return (input, init) =>
    transport(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
}

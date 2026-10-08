import { createHash } from 'node:crypto';
import { MODEL_IDENTITY, validVector, type TextEncoder } from './encoder.js';
import { toSpot, type Spot, type SpotListOptions, type SpotRow, type SpotStore } from './spots.js';

export const CANDIDATE_LIMIT = 50;
// Provisional until the lead evaluates realistic pilot queries; not a confidence score.
export const RELEVANCE_THRESHOLD = 0.35;
const CACHE_LIMIT = 100;
const IDLE_TTL_MS = 5 * 60_000;
export class SearchFailure extends Error {
  constructor(public readonly code: 'SEARCH_UNAVAILABLE' | 'SEARCH_BUSY' | 'SERVICE_UNAVAILABLE') { super(code); }
}
export type SearchResult = { mode: 'semantic' | 'browse'; spots: Spot[]; candidateLimit: 50;
  emptyReason?: 'no_candidates' | 'no_matches' };

export class SearchDeadline {
  readonly endsAt: number;
  expired = false;
  constructor(durationMs = 40_000, private readonly now = Date.now) { this.endsAt = now() + durationMs; }
  async run<T>(work: Promise<T>): Promise<T> {
    const remaining = this.endsAt - this.now();
    if (this.expired || remaining <= 0) { this.expired = true; throw new SearchFailure('SEARCH_UNAVAILABLE'); }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([work, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { this.expired = true; reject(new SearchFailure('SEARCH_UNAVAILABLE')); }, remaining);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  check() { if (this.expired || this.now() >= this.endsAt) { this.expired = true; throw new SearchFailure('SEARCH_UNAVAILABLE'); } }
}

export interface SearchService {
  search(store: SpotStore, token: string, callerId: string, options: SpotListOptions, query: string, deadline: SearchDeadline, radiusKm: number): Promise<SearchResult>;
  invalidate(id: string): void;
  dispose(): Promise<void>;
}

export function createSearchService(encoder: TextEncoder, settings: { now?: () => number; inferenceMs?: number } = {}): SearchService {
  const now = settings.now ?? Date.now;
  type Entry = { key: string; vector: Float64Array; accessed: number; timer: ReturnType<typeof setTimeout> };
  const cache = new Map<string, Entry>();
  const deleteEntry = (id: string) => {
    const prior = cache.get(id);
    if (prior) clearTimeout(prior.timer);
    cache.delete(id);
  };
  const putEntry = (id: string, fingerprint: string, vector: Float64Array) => {
    deleteEntry(id);
    const entry: Entry = { key: fingerprint, vector, accessed: now(), timer: setTimeout(() => {
      if (cache.get(id) === entry) cache.delete(id);
    }, IDLE_TTL_MS) };
    entry.timer.unref();
    cache.set(id, entry);
    if (cache.size > CACHE_LIMIT) deleteEntry(cache.keys().next().value!);
  };
  // Invalidations during an active worker fence off its late insert, even if an
  // edit is followed by a second edit back to identical text before it completes.
  const invalidated = new Set<string>();
  let active = false;
  let closed = false;
  let inFlight: Promise<unknown> | undefined;
  const text = (row: SpotRow) => `${row.title.trim()}\n${row.note.trim()}`;
  const key = (row: SpotRow) => createHash('sha256').update(MODEL_IDENTITY).update('\0')
    .update(JSON.stringify([row.title.trim(), row.note.trim()])).digest('hex');
  const withinRadius = (row: SpotRow, options: Extract<SpotListOptions, { feed: 'public' }>, radiusKm: number) => {
    if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude) || row.latitude < -90 || row.latitude > 90 ||
        row.longitude < -180 || row.longitude > 180) return false;
    const radians = Math.PI / 180;
    const deltaLat = (row.latitude - options.centerLat) * radians;
    const deltaLon = (row.longitude - options.centerLon) * radians;
    const term = Math.sin(deltaLat / 2) ** 2 + Math.cos(options.centerLat * radians) * Math.cos(row.latitude * radians) * Math.sin(deltaLon / 2) ** 2;
    return 2 * 6371.0 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, term)))) <= radiusKm;
  };
  function validRows(rows: SpotRow[], options: SpotListOptions, radiusKm: number): SpotRow[] {
    if (!Array.isArray(rows) || rows.length > CANDIDATE_LIMIT) throw new SearchFailure('SERVICE_UNAVAILABLE');
    return rows.filter(row => row && !row.removed_at && (options.feed !== 'public' ||
      (row.audience === 'public' && typeof row.distance_km === 'number' && Number.isFinite(row.distance_km) &&
        row.distance_km >= 0 && row.distance_km <= radiusKm && withinRadius(row, options, radiusKm))));
  }
  async function list(store: SpotStore, token: string, callerId: string, options: SpotListOptions, deadline: SearchDeadline, radiusKm: number) {
    let rows: SpotRow[];
    try { rows = await deadline.run(store.list(token, callerId, options)); }
    catch (error) { if (error instanceof SearchFailure) throw error; throw new SearchFailure('SERVICE_UNAVAILABLE'); }
    deadline.check();
    return validRows(rows, options, radiusKm);
  }
  const result = (mode: SearchResult['mode'], rows: SpotRow[], reason: SearchResult['emptyReason']): SearchResult => ({
    mode, spots: rows.map(toSpot), candidateLimit: CANDIDATE_LIMIT, ...(rows.length ? {} : { emptyReason: reason }),
  });
  return {
    invalidate(id) { deleteEntry(id); if (active) invalidated.add(id); },
    async dispose() {
      closed = true;
      for (const id of cache.keys()) deleteEntry(id);
      // A request may have timed out while native ONNX work is still in progress.
      // Do not dispose its session before that actual work settles.
      if (inFlight) await inFlight.catch(() => {});
      await encoder.dispose?.();
    },
    async search(store, token, callerId, options, query, deadline, radiusKm) {
      if (closed) throw new SearchFailure('SEARCH_UNAVAILABLE');
      // Reserve before the first upstream list too: conflicting semantic searches
      // cannot accumulate an unbounded queue of provider reads before inference.
      if (query) {
        if (active) throw new SearchFailure('SEARCH_BUSY');
        active = true;
        invalidated.clear();
      }
      let candidates: SpotRow[];
      try { candidates = await list(store, token, callerId, options, deadline, radiusKm); }
      catch (error) { if (query) { active = false; invalidated.clear(); } throw error; }
      if (!query) return result('browse', candidates, 'no_candidates');
      if (!candidates.length) { active = false; invalidated.clear(); return result('semantic', [], 'no_candidates'); }
      let stageExpired = false;
      let stageTimer: ReturnType<typeof setTimeout> | undefined;
      const stageTimeout = new Promise<never>((_, reject) => {
        stageTimer = setTimeout(() => { stageExpired = true; reject(new SearchFailure('SEARCH_UNAVAILABLE')); }, settings.inferenceMs ?? 5000);
      });
      const check = () => { deadline.check(); if (stageExpired || closed) throw new SearchFailure('SEARCH_UNAVAILABLE'); };
      const vector = async (value: string) => {
        check();
        let encoded: Float64Array;
        try { encoded = await encoder.encode(value); }
        catch { throw new SearchFailure('SEARCH_UNAVAILABLE'); }
        check();
        if (!validVector(encoded)) throw new SearchFailure('SEARCH_UNAVAILABLE');
        return Float64Array.from(encoded);
      };
      const worker = (async (): Promise<SearchResult> => {
        const queryVector = await vector(query);
        const ranked: { row: SpotRow; score: number; position: number }[] = [];
        // Sequential batches of at most four; no concurrent native sessions or
        // unbounded queued inference. Each cache hit follows a fresh eligible list.
        for (let offset = 0; offset < candidates.length; offset += 4) {
          check();
          for (const [index, row] of candidates.slice(offset, offset + 4).entries()) {
            check();
            const fingerprint = key(row);
            const prior = cache.get(row.id);
            let embedding: Float64Array;
            if (prior && prior.key === fingerprint && now() - prior.accessed < IDLE_TTL_MS) {
              putEntry(row.id, fingerprint, prior.vector);
              embedding = prior.vector;
            } else {
              deleteEntry(row.id);
              embedding = await vector(text(row));
              if (!invalidated.has(row.id)) putEntry(row.id, fingerprint, embedding);
            }
            const score = queryVector.reduce((sum, value, i) => sum + value * embedding[i], 0);
            if (score >= RELEVANCE_THRESHOLD) ranked.push({ row, score, position: offset + index });
          }
        }
        // Stage timer covers inference only. A timed-out native call remains inside
        // this worker and retains the global permit until it actually settles.
        if (stageTimer) clearTimeout(stageTimer);
        check();
        ranked.sort((a, b) => b.score - a.score || a.position - b.position || a.row.id.localeCompare(b.row.id));
        const current = await list(store, token, callerId, options, deadline, radiusKm);
        deadline.check();
        const byId = new Map(current.map(row => [row.id, row]));
        const selected = ranked.filter(({ row }) => {
          const fresh = byId.get(row.id);
          return fresh && !invalidated.has(row.id) && fresh.title === row.title && fresh.note === row.note &&
            fresh.owner_id === row.owner_id && fresh.audience === row.audience;
        }).slice(0, 3).map(({ row }) => byId.get(row.id)!);
        return result('semantic', selected, candidates.length ? 'no_matches' : 'no_candidates');
      })();
      inFlight = worker;
      // Do not release on a race timeout. Worker alone owns release; late output
      // cannot be sent, inserted in the cache, or start another batch.
      void worker.then(() => { active = false; invalidated.clear(); inFlight = undefined; }, () => { active = false; invalidated.clear(); inFlight = undefined; })
        .finally(() => { if (stageTimer) clearTimeout(stageTimer); });
      try { return await Promise.race([deadline.run(worker), stageTimeout]); }
      catch (error) { if (error instanceof SearchFailure) throw error; throw new SearchFailure('SEARCH_UNAVAILABLE'); }
    },
  };
}

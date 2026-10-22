import type { Spot, SpotListOptions, SpotStore } from './spot.model.js';

export const CANDIDATE_LIMIT = 50;
// Provisional until the lead evaluates realistic pilot queries; not a confidence score.
export const RELEVANCE_THRESHOLD = 0.35;

export class SearchFailure extends Error {
  constructor(
    public readonly code: 'SEARCH_UNAVAILABLE' | 'SEARCH_BUSY' | 'SERVICE_UNAVAILABLE'
  ) {
    super(code);
  }
}

export type SearchResult = {
  mode: 'semantic' | 'browse';
  spots: Spot[];
  candidateLimit: 50;
  emptyReason?: 'no_candidates' | 'no_matches';
};

export class SearchDeadline {
  readonly endsAt: number;
  expired = false;
  constructor(durationMs = 40_000, private readonly now = Date.now) {
    this.endsAt = now() + durationMs;
  }
  async run<T>(work: Promise<T>): Promise<T> {
    const remaining = this.endsAt - this.now();
    if (this.expired || remaining <= 0) {
      this.expired = true;
      throw new SearchFailure('SEARCH_UNAVAILABLE');
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            this.expired = true;
            reject(new SearchFailure('SEARCH_UNAVAILABLE'));
          }, remaining);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  check() {
    if (this.expired || this.now() >= this.endsAt) {
      this.expired = true;
      throw new SearchFailure('SEARCH_UNAVAILABLE');
    }
  }
}

export interface SearchService {
  search(
    store: SpotStore,
    token: string,
    callerId: string,
    options: SpotListOptions,
    query: string,
    deadline: SearchDeadline,
    radiusKm: number
  ): Promise<SearchResult>;
  invalidate(id: string): void;
  dispose(): Promise<void>;
}

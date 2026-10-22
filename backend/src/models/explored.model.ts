/** A null setter result means the invoker RPC returned no authorized row. */
export interface ExploredStore {
  readonly configured: boolean;
  get(token: string, callerId: string, spotId: string): Promise<boolean>;
  set(token: string, callerId: string, spotId: string, explored: boolean): Promise<boolean | null>;
}

export type ExplorationResponse = {
  exploration: {
    spotId: string;
    explored: boolean;
  };
};

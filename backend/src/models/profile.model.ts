import type { SupabaseTransport } from '../utils/transport.js';

export type { SupabaseTransport };

export type Profile = {
  id: string;
  displayName: string;
  publicRadiusKm: number;
};

export type ProfileResult =
  | { kind: 'ok'; profile: Profile }
  | { kind: 'unauthorized' | 'not_enrolled' | 'unavailable' };

export type ProfileProvider = (token: string) => Promise<ProfileResult>;
export type ProfileUpdater = (
  token: string,
  callerId: string,
  radiusKm: number
) => Promise<ProfileResult>;

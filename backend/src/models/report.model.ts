export const REPORT_REASONS = [
  'private_property',
  'sensitive_location',
  'inappropriate_content',
  'inaccurate',
] as const;

export type ReportReason = typeof REPORT_REASONS[number];

/** Null means the narrow RPC returned no currently visible spot. */
export interface ReportStore {
  readonly configured: boolean;
  submit(token: string, spotId: string, reason: ReportReason): Promise<boolean | null>;
}

export type PendingReport = {
  id: string;
  spot_id: string;
  reporter_id: string;
  reason: ReportReason;
  status: 'pending';
  created_at: string;
};

export interface OperatorStore {
  list(): Promise<PendingReport[]>;
  review(id: string): Promise<'reviewed' | 'missing'>;
  owner(id: string): Promise<string | null>;
}

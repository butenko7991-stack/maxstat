export type ReachVerificationState = {
  link: string | null;
  reach: number | null;
  reachVerifiedLink: string | null;
  reachVerifiedValue: number | null;
  reachVerifiedAt: Date | null;
};

/** A record is skipped only while both the link and current reach remain exactly as verified. */
export function isReachVerificationCurrent(record: ReachVerificationState): boolean {
  return Boolean(
    record.reachVerifiedAt &&
    record.link &&
    record.link === record.reachVerifiedLink &&
    record.reach !== null &&
    record.reach === record.reachVerifiedValue,
  );
}

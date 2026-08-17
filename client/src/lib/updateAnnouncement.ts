export const UPDATE_ANNOUNCEMENT_VERSION = "2026-08-17-max-analytics-reach";
export const UPDATE_ANNOUNCEMENT_STORAGE_KEY = "max-ads-manager:update-announcement";

export function shouldShowUpdateAnnouncement(storedVersion: string | null): boolean {
  return storedVersion !== UPDATE_ANNOUNCEMENT_VERSION;
}

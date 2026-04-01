/** @implements NFR-001 — Pure scheduling decision logic. */
export const RESCHEDULE_DELAY_MS = 1000;
export const shouldReschedule = (remaining) => remaining > 0;

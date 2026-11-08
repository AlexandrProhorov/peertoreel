export const SESSION_COOKIE_NAME = 'peertoreel_session';

/** Sliding `lastSeenAt` updates are throttled to one write per this interval. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

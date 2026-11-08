import { HttpErrorResponse } from '@angular/common/http';
import {
  readinessResponseSchema,
  type ReadinessResponse,
} from '@peertoreel/contracts';

/**
 * Readiness returns 503 when a dependency is down, but the body is still a
 * valid ReadinessResponse. The store treats that as domain data, not as a
 * transport failure.
 */
export function parseDegradedReadiness(
  error: unknown,
): ReadinessResponse | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 503) {
    return null;
  }

  const parsed = readinessResponseSchema.safeParse(error.error);
  return parsed.success ? parsed.data : null;
}

import type { QcReport, Run } from '@peertoreel/contracts';

/**
 * REVIEW → SCHEDULED is a human gate. Pipeline runs require a passing QC
 * report; episode runs skip the QC stage, so their prototype review gate is
 * explicitly QC-free. Everything else is rejected here.
 */
export function canApproveReview(
  run: Pick<Run, 'mode' | 'state'>,
  qcReport: QcReport | null,
): boolean {
  if (run.state !== 'REVIEW') {
    return false;
  }

  if (run.mode === 'episode') {
    return true;
  }

  return qcReport !== null && qcReport.verdict !== 'fail';
}

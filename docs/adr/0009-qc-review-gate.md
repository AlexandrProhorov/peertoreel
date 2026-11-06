# ADR-0009 — QC stage and review gate

**Status:** accepted · 2026-11-05

## Context

M2.4 ends with a `draft.mp4` in `REVIEW`, but the reviewer had no checklist: duration,
loudness, audio sync, stop-words and speaking rate were checked manually, if at all. The
audio-gap bug (two ~3 s chunks missing at scene boundaries) showed that a draft can look
fine in the player and still be broken.

M2.5 adds an automated QC report and makes approval depend on it. The state machine already
has `REVIEW` as the human gate and `stageForState('REVIEW')` points at `qc`; no new run
state is needed.

## Decision

### QC is a separate stage, not part of render

- `qc` is a BullMQ queue/stage with `concurrency: 1`.
- It requires `REVIEW` and produces `REVIEW`: QC is advisory, it does not move the run.
- The render stage no longer owns QC. When a new draft is produced, render deletes the old
  `qc_report` artifact/object, so the review gate always checks the current file.
- A QC infrastructure error (missing draft, ffprobe failure) fails the job and marks the
  run `FAILED` with `resume_state = REVIEW`; a failed **check** only changes the report
  verdict.

### Report

`qc_report` is a JSON artifact (`runs/<runId>/qc/qc_report.json`) validated by
`qcReportSchema`:

- checks: `duration`, `loudness`, `sync`, `stop_words`, `aigc`, `readability`;
- statuses: `pass`, `warn`, `fail`;
- metrics: duration, audio/video duration, LUFS, true peak, LRA, words/minute, longest
  sentence, audio packet gaps, stop-words, `isAigc`;
- final verdict: worst status.

`GET /runs/:id/qc` returns the parsed report (404 when it does not exist). The web loads it
with the run detail, so the review page has one consistent snapshot.

### Checks

- **Duration:** > 0; warn outside 20–70 s; fail when the last word ends after the draft.
- **Loudness:** target −14 LUFS; warn at >1.5 dB deviation or true peak > −1 dBTP; fail at
  >3 dB or true peak > −0.1 dBTP.
- **Sync:** fail on an audio packet gap > 0.5 s, audio/video duration mismatch > 0.5 s, or
  speech extending past the draft; warn above 0.2 s. The packet-gap check is what catches
  the missing-chunk bug.
- **Stop-words:** a small RU list of spam/commercial triggers (секрет, скидка, казино, …).
  A match is a warning, not a hard block; the human decides.
- **AIGC:** always `true`; the publish path must send `is_aigc: true`.
- **Readability:** words per minute and longest sentence; warn outside 90–200 WPM or above
  25 words, fail outside 60–260 WPM or above 35 words.
- No LLM call in M2.5: rules + `ffprobe`/`ffmpeg` only.

### Review gate

- At `REVIEW` without a report, the UI offers **«Проверка качества»** as the next step and
  does not show «Одобрить».
- With `pass` or `warn`, «Одобрить» is available; `warn` is advisory.
- With `fail`, «Одобрить» is hidden; the reviewer can re-run QC, regenerate a stage, or
  stop the run with a comment.
- The QC report card sits below the draft and shows verdict, every check, metrics and a
  «Перепроверить» action.

## Alternatives considered

- **Run QC inline in the render processor.** Saves a queue, but violates "each stage is an
  independent job" and couples a slow media check to rendering. Rejected.
- **Add a new `QC` run state between `RENDERING` and `REVIEW`.** `REVIEW` already means
  "human gate"; a separate state would add transitions without changing the UX. Rejected.
- **Block on `warn` too.** Loudness tolerance and true-peak warnings are common and not
  necessarily blocking; the human should decide. Rejected.
- **Store the report only in `artifacts.meta`.** The report is a product artifact with its
  own schema and a dedicated endpoint; JSON in S3 is easier to audit. Rejected.
- **Keep the old QC report after a re-render and compare timestamps.** Deleting it at
  render time is simpler and cannot show a stale pass. Rejected the comparison approach.

## Consequences

- `REVIEW` now has two possible stage cards: QC when no report, none when the report is
  present; `stageForProgress('REVIEW')` returns `qc`.
- A new draft always resets the review gate to "run QC again".
- The API gains `GET /runs/:id/qc` and `StorageService.getObject`; the web gains a QC report
  signal and card.
- The QC report is included in the run artifacts but hidden from the generic artifact list
  (it is rendered as a card).
- `provider_usage` and the `scenes` table are still out of scope.

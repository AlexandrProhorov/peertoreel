---
description: Prepare the session handoff, state card update and session log entry
---

Session end. **Do not commit or push.** Do not rewrite history or migrate the log format.

Inspect the actual result:

!`git status --short`
!`git diff --stat`
!`git log -1 --oneline`

Prepare, but do not apply without confirmation:

1. **Session record**: a new file under `docs/sessions/<YYYY-MM>/` from
   `docs/templates/session-record.md` (at most 50 lines) plus one row in the
   `SESSION_LOG.md` index. Do not append a long narrative to the index.
2. **State card update** for `docs/state/current.md` (at most 80 lines): verified facts only;
   use `Not verified` when a check did not run. Mention the current branch and HEAD.
3. **ROADMAP update** only if the milestone status actually changed; otherwise say "no change".
4. **Theory block** of 5-10 bullets tied to the code just written. It belongs in the local
   `LEARNING.md`, not in the repository.
5. **Next session pointer**: the plan path, or "no plan yet".

Report the proposed edits first. Apply them only after the user confirms.
Never claim `pnpm check` passed unless it was run in this session.

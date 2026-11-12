---
description: Load the state card and one plan, then print a task card without starting work
---

Session start. **Do not edit files and do not begin implementation.**

Read, in this order, and only these:

1. `docs/state/current.md`.
2. The plan passed to this command: `$ARGUMENTS`.
   If it is empty, use the active plan named in the state card.
3. The Git facts below (already injected; do not run broad history commands).

!`git branch --show-current`
!`git status --short`
!`git log -1 --oneline`

Then produce a short task card:

- **Goal**: one or two sentences.
- **Done when**: the plan's Definition of Done as a checklist.
- **Constraints / out of scope**: only what changes the work.
- **Decisions already made**: do not reopen them.
- **Sources to read**: `file:line` or symbols from the plan's read map; nothing else for now.
- **State check**: compare the card with the actual branch, HEAD, dirty files and last check.
  If they differ, say what may be stale.
- **Open questions**: 0-3, only real ambiguities.

Rules:

- Do not read `SESSION_LOG.md`, `ROADMAP.md`, `ARCHITECTURE.md`, ADRs or
  `docs/workspace/research/*` unless the plan names a specific section. If you need history,
  read the `SESSION_LOG.md` index and then one record under `docs/sessions/`; never the whole
  archive.
- Do not explore the whole project or read every changed file.
- Stop after the task card and wait for confirmation.

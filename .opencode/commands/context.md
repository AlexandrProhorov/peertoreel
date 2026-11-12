---
description: Show the startup context budget and flag oversized files
---

Show the startup context budget. Do not read document contents and do not edit files.

!`pnpm context:check`

Then:

- Reproduce the table as-is.
- Explain each warning in one line and name the file to trim.
- If the total is above 25k tokens, suggest the smallest concrete cut (usually the active plan
  or a reference document that should stay lazy).
- Do not scan `node_modules`, build output or the whole `docs/` tree.
- Do not edit files; just report.

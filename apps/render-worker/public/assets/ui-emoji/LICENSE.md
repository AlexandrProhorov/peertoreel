# UI object assets

Files in this directory are 3D emoji renders from
[Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji).

- Licence: MIT (see the upstream `LICENSE` file for the full text).
- Usage: interface-storytelling pilot assets for `apps/render-worker/src/ui-demo`.
- Naming: `<asset-key>-3d.png`; every key is registered in
  `src/ui-demo/assets.ts` with its sha256 content hash.
- Do not edit these files in place: a changed byte invalidates every scene that
  references the old content hash (the resolver fails loudly by design).
- Substitutions: the reference video uses a dumbbell; Fluent Emoji 3D does not
  ship one, so the orbit scene uses `candy` instead.

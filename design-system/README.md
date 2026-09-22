# WizKlub Design System

Tokens, components and rules for every WizKlub Futurz web app, kept in three forms that say the same thing:

| Form | Where | Who it is for |
|---|---|---|
| **Figma library** | [WizKlub Design System](https://www.figma.com/design/ALYUYxBSYECsXW1jI0TPOC) | Designers (variables with code syntax, styles, 14 components + 27 icons, docs pages, “🤖 Read me — for AI agents”) |
| **Code tokens** | `../frontend/wizklub-testimonials/src/styles/tokens.css` | Developers (the source of truth) |
| **Machine-readable copy** | this folder | AI agents and tooling |

## Files

- `AGENTS.md`: the rules an AI agent must follow (read first). Golden rules, colour-by-purpose table, type scale, decision tree, checklist.
- `components.md`: every component as `purpose · variants · props · anatomy · rules · code`.
- `tokens/tokens.json`: [W3C Design Tokens](https://design-tokens.github.io/community-group/format/) format. Every token has
  `$description` and `$extensions["com.wizklub"]` = `{ css, figma, resolved }`.
- `tokens/tokens.css`: the CSS variables (copy of the code truth + health RAG variables).
- `tokens/tailwind.preset.js`: a semantic Tailwind preset for Tailwind apps.
- `figma.json`: Figma file key, page IDs, component IDs/keys, variant axes, property keys, icon IDs, gotchas.
- `llms.txt`: short index for LLM crawlers.
- `scripts/build_tokens.mjs` (or `build_tokens.py`): regenerates the three token files.
- `package.json`: npm package `@wizklub/design-tokens` with `exports` for CSS, Tailwind, and JSON.
- `PUBLISHING.md`: publish to AWS CodeArtifact and install in apps.

## Changing a token

1. Change `frontend/wizklub-testimonials/src/styles/tokens.css` (and the Inventory Tailwind config if it is a brand colour).
2. Update the value table in `scripts/build_tokens.mjs` (or `build_tokens.py`), then run:
   ```bash
   node design-system/scripts/build_tokens.mjs
   # or: cd design-system && npm run build
   # or (macOS/Linux): python3 design-system/scripts/build_tokens.py
   ```
3. Update the matching Figma variable (same name, see `com.wizklub.figma`) and republish the library.

## Related

- Real screens built with this system: Figma **WizKlub Admin Apps** (`8q6lkq4MWJA5vJPw61gwaz`): Teachers Portal,
  Parent Orientation Tracker, Kit Inventory & School Portal, Gateway (65 screens × desktop/mobile).
- Change history for the revamp: `../CHANGES_FOR_AGENT.md`.

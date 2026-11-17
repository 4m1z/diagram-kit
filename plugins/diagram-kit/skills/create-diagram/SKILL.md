---
name: create-diagram
description: Make clear, well-positioned, interactive diagrams (system design and architecture, flowcharts, sequences, state machines, data models, trees, mind maps) from a request, a codebase or a document. Use when someone asks to diagram, visualize, map or draw how something works or fits together, or wants to understand part of a project visually. Not for charts of numbers.
---

# Create diagram

Agents are poor at placing boxes. Use this skill's scripts for geometry: you decide the meaning, ELK.js decides the positions, the checks tell you what is wrong. Never place coordinates yourself.

`<skill>` below is the folder holding this file.

## Setup, once

- Node 22.12 or newer.
- `node <skill>/scripts/diagram.mjs setup` installs the pinned dependencies into `~/.cache/diagram-kit/` (needs network). One install serves Claude Code, Codex and every copy of the skill, and survives plugin refreshes. In Codex, ask to run it with escalated permissions.
- CLI: `node <skill>/scripts/diagram.mjs` (`help` lists commands). It prints the setup command when dependencies are missing.

## Adapt, never impose

- The user's environment wins: their medium, their style, their language and tone. Our look is only a fallback for a standalone page or artifact when there is no host style.
- Follow what the user asks about wording and depth: another language, a different tone, fewer details or none.
- Details (`about`, `details`, facts and sources, shown on click) are included by default only in standalone pages and artifacts. Elsewhere add them where the medium has a natural place for them.

## Pick a path

- **Quick**: a small, clear ask ("draw the request path of X") with the facts at hand. Go straight to the spec. No brief, no preamble, a minimal picture.
- **Deep**: understanding a project or a document, more than about 12 parts, or facts that need checking. Write the brief first ([brief](references/brief.md)), ask, get approval, then draw.
- Ask instead of guessing when the question the diagram answers is unclear, the audience or level is unclear, the subject is too big for one view (propose the split), or sources disagree. One round, at most three questions, two to four options each, your pick first. Use the host's question tool (AskUserQuestion in Claude Code); without one, ask in plain text and stop until the user answers.

## Steps

1. **Settle the destination** ([environment](references/environment.md)). If the user has not said where the diagram goes and you can ask, ask once, with options built from what this environment offers: their own medium (their app, canvas or drawing code, docs tool), a cloud artifact (when the Artifact tool exists), a standalone HTML page, or an image for docs. Ask together with any other questions. If nobody can answer (headless or `exec` runs), make a standalone page in `docs/diagrams/<slug>/` and say where it went.
2. **Know the subject.** Code: start at entry points and trace the real path; cite `file:line`. A document: extract its parts, flows and claims. Deep path: write the brief, show it, wait for approval, set `status: approved`.
3. **Choose the kind and the views** ([kinds](references/kinds.md)). One question per view, about 12 to 15 parts at most. Big subjects become an overview plus focused views.
4. **Write the spec** ([spec](references/spec.md)): meaning only. Tiers in reading order, groups, parts declared in flow order, the main flow, labels of one to three words.
5. **Build**: `node <skill>/scripts/diagram.mjs build <spec> --out <dir>` writes `<name>.layout.json`, `<name>.html` and `<name>.png`, and prints the check report.
6. **Check and look.** Fix every ✗; weigh every !. Then look at the PNG (Read tool in Claude Code, `view_image` in Codex) against the [checklist](references/checklist.md). Fix through the spec: tiers, order, groups, direction, labels, or splitting ([layout](references/layout.md)). At most two rounds, then report what is left.
7. **Deliver in the destination's medium.**
   - Standalone page or artifact: the built HTML. On the deep path the final build uses `--strict`, which fails while the brief is unapproved.
   - The user's own medium: treat the kit's result as the plan. Reproduce its positions and routes (`layout.json`) with their components, styles and conventions; do not ship our viewer or theme into their environment.
   - Fit first: if it fits what is already there (components, libraries, styles, folders), integrate it. If it would need new dependencies, new components, style or structural changes, propose that and ask before changing anything.
   - End with one or two lines saying exactly where the result is: the file path, the component, or the artifact link. Do not narrate the diagram.

## Rules

- Minimal canvas: short labels, no legends unless an encoding repeats, no decoration. Explanations go in the details, not on the picture.
- Correct: every part, wire and label traces to code, a document or the user. Never invent components, protocols or numbers. Mark assumptions as assumptions.
- Positions come from the engine. Never hand-edit generated files; change the spec and rebuild.
- Keep the spec (and brief) next to the output so the diagram can be rebuilt later.

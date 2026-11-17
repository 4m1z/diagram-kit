---
name: create-diagram
description: Make clear, well-positioned, interactive diagrams (system design and architecture, flowcharts, sequences, state machines, data models, trees, mind maps) from a request, a codebase or a document. Use when someone asks to diagram, visualize, map or draw how something works or fits together, or wants to understand part of a project visually. Not for charts of numbers.
---

# Create diagram

Turn understanding into a picture that is correct, minimal and easy to read. You decide the meaning; the scripts decide the geometry. Never place coordinates yourself.

`<skill>` below is the folder holding this file.

## Setup, once per install

- Node 22.12 or newer.
- `npm ci --ignore-scripts --prefix <skill>/scripts` (needs network; repeat after the skill or plugin updates). In Codex the skill usually sits outside the workspace, so ask to run this command with escalated permissions.
- CLI: `node <skill>/scripts/diagram.mjs` (`help` lists commands). It prints the setup command itself when dependencies are missing.

## Pick a path

- **Quick**: a small, clear ask ("draw the request path of X") with the facts at hand. Go straight to the spec. No brief, no preamble, a minimal picture.
- **Deep**: understanding a project or a document, more than about 12 parts, or facts that need checking. Write the brief first ([brief](references/brief.md)), ask, get approval, then draw.
- Ask instead of guessing when the question the diagram answers is unclear, the audience or level is unclear, the subject is too big for one view (propose the split), or sources disagree. One round, at most three questions, two to four options each, your pick first. Use the host's question tool (AskUserQuestion in Claude Code); without one, ask in plain text and stop until the user answers.

## Steps

1. **Read the environment**: where the result goes and what style the host already has ([environment](references/environment.md)).
2. **Know the subject.** Code: start at entry points and trace the real path; cite `file:line`. A document: extract its parts, flows and claims. Deep path: write the brief, show it, wait for approval, set `status: approved`.
3. **Choose the kind and the views** ([kinds](references/kinds.md)). One question per view, about 12 to 15 parts at most. Big subjects become an overview plus focused views.
4. **Write the spec** ([spec](references/spec.md)): meaning only. Tiers in reading order, groups, parts declared in flow order, the main flow, labels of one to three words. Technical detail goes in `sub` (one short line) and in `about`, `details` and `facts` (shown on click).
5. **Build**: `node <skill>/scripts/diagram.mjs build <spec> --out <dir>` writes `<name>.layout.json`, `<name>.html` and `<name>.png`, and prints the check report.
6. **Check and look.** Fix every ✗; weigh every !. Then look at the PNG (Read tool in Claude Code, `view_image` in Codex) against the [checklist](references/checklist.md). Fix through the spec: tiers, order, groups, direction, labels, or splitting ([layout](references/layout.md)). At most two rounds, then report what is left.
7. **Deliver** in the form the environment wants: the HTML page, a claude.ai artifact, or a React component (`--react`). On the deep path the final build uses `--strict`, which fails while the brief is unapproved; a draft page shows a Draft label. End with one or two lines and the link or path. Do not narrate the diagram.

## Rules

- Minimal: no extra text, legends only when an encoding repeats, no decoration. The picture shows structure and flow; explanations live in the click panel.
- Correct: every part, wire and label traces to code, a document or the user. Never invent components, protocols or numbers. Mark assumptions as assumptions.
- Positions come from the engine. Never hand-edit generated files; change the spec or the tokens and rebuild.
- Adopt the host's look when it has one ([design](references/design.md)); otherwise use the default, which is sleek and neutral.
- Keep specs next to their output so the diagram can be rebuilt and tuned later.

# The brief

A short Markdown document that holds the logic behind a diagram: what it answers, what is in it and why, and where each fact comes from. Write it on the deep path, or when the user hands you a document to turn into diagrams. The spec links to it with `brief: ./<name>-brief.md`.

## When a document already exists

- Read it whole. Extract parts, flows, claims and open questions into the brief's shape.
- Keep its terms. Cite it as the source (`(source: docs/design.md#queues)`).
- Do not add facts it does not contain unless you checked them elsewhere and cite that.

## Template

```markdown
---
status: draft
---
# <Subject>: <the one question this answers>

For: <reader and what they need to do with it>.
Scope: <what is in>. Out: <what is left out on purpose>.

## Views
1. <view name>: <its one question> (<kind>)

## Parts and flows
Short prose or bullets: the parts, how they connect, the main path in order.

## Facts
- F1: <one checkable sentence>. (source: src/payments/api.ts:42)
- F2: <...>. (source: https://docs.example.com/page, docs/adr/0003.md)

## Decisions and assumptions
- D1: <a design choice, and which facts support it>.
- A1: <an assumption the user should confirm>.

## Open questions
- <question>
```

## Rules

- One fact per line: `- F<n>: text. (source: a, b)`. The scripts read this exact shape, show facts and sources in the click panel, and warn about facts without a source.
- Sources: `path:line` for code, URLs for documentation, `user` for something the user said. Prefer primary sources.
- Facts are checkable statements. Choices go under decisions; unknowns under assumptions or open questions. Do not dress a guess as a fact.
- Decisions (`- D1: ...`) and assumptions (`- A1: ...`) use the same shape without a source; they explain choices and cite facts in their text.
- In the spec, link elements with `facts: [F1, D2]`. The click panel shows each item with its sources; assumptions are labelled as such.
- Keep it short: a reader should finish it in two minutes.

## Fact check

- Recheck each fact against its source before asking for approval. If the host supports subagents, give one fresh agent the brief and the sources and ask it to mark each fact verified, corrected or unsupported; fix the brief from its answer.
- Volatile facts (versions, limits, prices) get a date: `(source: https://..., checked 2026-11-17)`. The date is kept apart from the sources.

## Approval

- Show the brief (or its short summary plus the path) and ask for approval or changes with the question tool.
- On approval set `status: approved`. The build warns while it is anything else.
- If the user changes the logic later, update the brief first, then the spec.

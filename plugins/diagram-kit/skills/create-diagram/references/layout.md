# How positions are decided, and how to steer them

The graph kinds use ELK Layered (elkjs), the layered algorithm a bench of layout engines ranked best for request-flow diagrams. It places parts in columns along the flow, orders them to cut crossings, and routes wires at right angles. Sequences, mind maps and trees have their own deterministic layouts.

## Explore first

`diagram.mjs variants <spec> --out <dir>` builds the spec several ways and keeps the ones that look different, best measured first:

- What varies: both reading directions, the parts' declared order kept or free, three placements (balanced, compact, straight), and wrapping a long chain into rows like a line of text.
- `sheet.png`: all of them side by side, each captioned with crossings, issues, bends and size. One look compares them.
- `v1.png`, `v1.layout.json`, ...: each at full size; `variants.json`: each one's settings.
- `--aspect 1.6` prefers a page shape, `--aspect 0.6` a phone; `--count` sets how many.
- Numbers sort, your eyes decide: pick the one where the message lands, the main path reads at once and the important part is where the eye goes first.
- Keep the pick: copy its printed `direction` and `layout:` lines into the spec, then build. The same lines always give the same layout.

## Why a layout looks off, and what to change

The engine draws a flow in one direction. Most ugliness comes from fighting that:

- **A loop across the picture** (agent → code → agent, or a callback to the start) closes with a wire that wraps around everything. Tell the story as a straight flow; keep a loop only between neighbours, or say it in `about` and the flow text instead of drawing it.
- **Two parts of the same group that are not neighbours in the story** (the agent writes, then later looks) force a group to span the middle. Give each stretch its own group, even with the same label.
- **A wire between two parts of one group** fixes their order inside it; a feedback wire there flips them.
- **Groups of different heights side by side** put small steps in the wires between them. A straight chain of groups keeps one baseline.
- **Edge labels take a row of their own**, so labelled gaps are wider than bare ones. Label a wire only where the label adds meaning.
- **Too wide or too tall**: let `variants` try wrapping (a chain broken into rows like text). It works on simple chains and is skipped where the engine cannot wrap.
- **A pipeline inside a story that runs the other way** (you ask, a tool runs four steps, the result goes somewhere): give the group its own `direction`. Its parts form a row across a top-to-bottom picture, and wires that point at the group itself enter and leave it in the middle, which reads cleaner than wires into its first and last part.

## The hints that matter, in order of effect

1. **`tiers`**: columns in reading order. Without them the engine guesses from the wires, and a reply or callback (such as a push back to the client) can pull clients to the wrong side.
2. **Declaration order**: within a column, parts listed first come first. Put the main path's parts first and related parts next to each other.
3. **Groups**: parts that talk to each other a lot belong in one group. A group is kept together as a box; wires between groups cost more than wires inside one.
4. **The primary flow** (or `main: true` on a wire): kept straight and pointing forward.
5. **`direction`**: `right` for systems, `down` for processes and anything that would be too wide.
6. **Wire kinds**: replies (`-->`) and `back: true` callbacks are allowed to point backwards without fighting the layout. A `back: true` loop inside one group runs along the side of the main line.
7. **Cycles**: in a loop (for example a state machine that returns to idle), the wire declared first runs forward. Declare transitions in the order the reader should follow them.

## Reading the check

| Code | Means | Fix |
|---|---|---|
| `overlap`, `edge-through` (✗) | Something sits on something else | Change order or groups; if it persists, set `layout: { elk.spacing.nodeNode: 36 }` and report it |
| `crossings` (!) | Many wires cross | Try the variants; reorder parts inside a tier, group the chatty ones, or split the view |
| `main-backwards` (!) | The main flow runs against the reading direction | Add tiers or declare parts in flow order |
| `crowded` (!) | Too many parts | Split into overview plus focused views |
| `aspect` (!) | Very wide or tall | Try the variants (`--aspect`), merge tiers, or split |
| `label-overlap` (!) | Labels collide | Shorten labels; drop labels that only repeat the obvious |
| `approval`, `facts`, `sources` | Brief not approved, unknown fact ids, facts without sources | Fix the brief |

Numbers are measured from the actual geometry. After they are clean, look at the PNG for what numbers miss: does the main path read in one direction, is the important part where the eye lands first, do groups make sense?

## More room

`layout: { spacing: 1.5 }` in the spec (or `build --spacing 4`) multiplies the gaps between parts, rows and wires while parts keep their size. Use it when the destination needs room, for example a 3D world, a large wall screen or a medium where people move through the diagram. Reading order and routing stay the same.

## Raw engine options

`layout:` (whole graph) and `layout:` on a node or group pass options straight to ELK, for example:

```yaml
layout:
  elk.spacing.nodeNode: 32
  elk.layered.spacing.nodeNodeBetweenLayers: 72
  elk.layered.nodePlacement.strategy: NETWORK_SIMPLEX   # more compact, fewer straight lines
```

Reference: https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html. Prefer the semantic hints above; raw options are for tuning a finished diagram.

## What the engine will not do

- Keep a hand-made position. There is no pinning; positions come from the spec every time. Fine-tuning for a medium happens in the destination, adapting the reference.
- Route around a part that the spec places in the wrong column. Fix the tier.

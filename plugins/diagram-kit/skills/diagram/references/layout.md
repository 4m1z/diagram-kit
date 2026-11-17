# How positions are decided, and how to steer them

The graph kinds use ELK Layered (elkjs), the layered algorithm a bench of layout engines ranked best for request-flow diagrams. It places parts in columns along the flow, orders them to cut crossings, and routes wires at right angles. Sequences, mind maps and trees have their own deterministic layouts.

## The hints that matter, in order of effect

1. **`tiers`**: columns in reading order. Without them the engine guesses from the wires, and a reply or callback (such as a push back to the client) can pull clients to the wrong side.
2. **Declaration order**: within a column, parts listed first come first. Put the main path's parts first and related parts next to each other.
3. **Groups**: parts that talk to each other a lot belong in one group. A group is kept together as a box; wires between groups cost more than wires inside one.
4. **The primary flow** (or `main: true` on a wire): kept straight and pointing forward.
5. **`direction`**: `right` for systems, `down` for processes and anything that would be too wide.
6. **Wire kinds**: replies (`-->`) and `back: true` callbacks are allowed to point backwards without fighting the layout.
7. **Cycles**: in a loop (for example a state machine that returns to idle), the wire declared first runs forward. Declare transitions in the order the reader should follow them.

## Reading the check

| Code | Means | Fix |
|---|---|---|
| `overlap`, `edge-through` (✗) | Something sits on something else | Change order or groups; if it persists, set `layout: { elk.spacing.nodeNode: 36 }` and report it |
| `crossings` (!) | Many wires cross | Reorder parts inside a tier, group the chatty ones, or split the view |
| `main-backwards` (!) | The main flow runs against the reading direction | Add tiers or declare parts in flow order |
| `crowded` (!) | Too many parts | Split into overview plus focused views |
| `aspect` (!) | Very wide or tall | Change `direction`, merge tiers, or split |
| `label-overlap` (!) | Labels collide | Shorten labels; drop labels that only repeat the obvious |
| `approval`, `facts`, `sources` | Brief not approved, unknown fact ids, facts without sources | Fix the brief |

Numbers are measured from the actual geometry. After they are clean, look at the PNG for what numbers miss: does the main path read in one direction, is the important part where the eye lands first, do groups make sense?

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

- Keep a hand-made position. There is no pinning; positions come from the spec every time.
- Route around a part that the spec places in the wrong column. Fix the tier.

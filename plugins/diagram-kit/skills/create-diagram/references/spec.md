# Spec reference

A spec is YAML (or JSON) that says what the diagram means. It never holds coordinates. Inside `{ ... }` flow style, quote any value that contains a comma or a colon (`sub: "auth, rate limits"`), or YAML splits it. `node <skill>/scripts/diagram.mjs example <kind>` prints a working example for each kind.

## Common fields

```yaml
kind: architecture        # see Kinds below
title: Payments platform  # short; shown top left
subtitle: Card payment, one region   # optional, one line
brief: ./payments-brief.md           # optional; enables fact links and the approval check
numbered: true            # number the primary flow's steps on the picture (default true)
theme:                    # optional token overrides, see design.md
  light: { accent: '#0070f3' }
layout: { elk.spacing.nodeNode: 32 }  # optional raw ELK options (graph kinds), see layout.md
```

Every part, group, wire and message may carry explanation fields. They are hidden until someone clicks it:

```yaml
about: One or two sentences on what it does and why it is here.
details: { owner: payments-team, p99: 180 ms }
facts: [F2, F5]          # ids from the brief
sources: [src/api/pay.ts:40]   # direct sources when there is no brief
```

## Kinds

| kind | engine | default direction | use for |
|---|---|---|---|
| `architecture`, `system`, `graph`, `dataflow`, `dependencies` | graph | right | parts and how they talk |
| `flowchart`, `process` | graph | down | steps and decisions |
| `state` | graph | right | states and transitions |
| `datamodel`, `er` | graph | right | tables and relationships |
| `sequence` | sequence | top to bottom | who calls whom, in order |
| `tree`, `hierarchy` | tree | right / down | containment, org charts, file trees |
| `mindmap` | mindmap | both sides | ideas around a centre |

## Graph kinds

```yaml
direction: right            # right | down | left | up
tiers: [clients, edge, core, data, external]   # columns in reading order (optional)
groups:
  - { id: core, label: Payment core, tier: core }
  - { id: pci, label: PCI zone, parent: core, tone: amber }   # nested group
nodes:
  - id: api                 # required for anything wires point at
    label: Payments API     # 1 to 3 words
    sub: Go · gRPC          # optional one short technical line (mono)
    icon: server            # any Lucide name, or an alias: db, cache, queue, user, service ...
    group: core             # optional
    tier: core              # optional; a part in a group sits in the group's column (a different tier is warned about)
    shape: box              # box | pill | diamond | note | text | start | end | table
    tone: accent            # optional emphasis: accent | blue | green | amber | red | violet | pink | cyan | slate
edges:
  - "merchant -> gateway: POST /payments"   # sync call
  - "api ~> bus: PaymentAuthorized"          # async message
  - "api ..> db: write"                       # data read or write
  - "acquirer --> api: approved"              # reply or callback
  - "a -- b"                                  # plain link
  - { from: api, to: risk, label: score, kind: sync, main: true, about: ..., facts: [F4] }
  - { from: webhooks, to: merchant, label: event, kind: async, back: true }   # an intended callback
flows:
  - label: Card payment     # the first flow is primary: its steps get numbers on the picture
    steps:
      - "merchant -> gateway"
      - { edge: "gateway -> api", text: Validate and dedupe by idempotency key }
```

- Declaration order is reading order: parts listed first sit first (top or left) within their column.
- Several wires between the same two parts get ids `a->b`, `a->b#2`, ... Flow steps can use those ids.
- `main: true` on a wire, or being in the primary flow, keeps it straight.
- `back: true` marks an intended callback (a webhook or push to the caller): the layout lets it run backwards and the check does not flag it.

### Tables (datamodel)

```yaml
nodes:
  - id: orders
    label: orders
    icon: receipt
    fields: ["id uuid pk", "customer_id uuid fk", "status text"]
edges:
  - orders.customer_id -> customers.id     # attaches to the exact rows
```

### Flowchart and state shapes

- `shape: pill` for start and end steps of a process, `shape: diamond` for a decision (label wires `yes` / `no`).
- `shape: start` and `shape: end` are the small state-machine markers (use `label: ""`).
- `shape: note` is a muted aside; use sparingly.

## Sequence

```yaml
kind: sequence
participants:
  - { id: client, label: Merchant, icon: store }
  - { id: api, label: Payments API, icon: server }
messages:
  - "client -> api: POST /payments"     # sync call: activates the callee until its reply
  - "api --> client: 201 pending"       # reply: dashed, ends the activation
  - "api ~> bus: PaymentCreated"        # async: no activation
  - "api ..> db: insert"                # data access
  - block: alt                          # alt | opt | loop | par | critical | break
    label: approved
    messages: ["api --> client: 200"]
    else:
      - label: declined
        messages: ["api --> client: 402"]
  - note: Card data never reaches the merchant.
    over: [client]                      # one or two participants
```

Messages are numbered in order; the viewer plays them one by one.

## Tree and mindmap

```yaml
kind: tree            # or mindmap
direction: right      # tree only: right | down
root:
  label: repo
  icon: folder
  children:
    - label: apps
      children: [{ label: web, sub: Next.js }, { label: api }]
```

## Validation

The build stops with a clear message for unknown or duplicate ids, unknown groups, tiers, fields or flow steps, shapes, tones, wire kinds and block types, empty blocks, notes without `over`, and theme values that are not plain colours, lengths or font stacks. It warns about unknown icons with suggestions.

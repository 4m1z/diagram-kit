# Choosing the kind and the views

Start from the question the reader has, then pick the kind that answers it with the least ink.

| The reader asks | Kind | Notes |
|---|---|---|
| What are the parts and how do they talk? | `architecture` | Tiers left to right: callers, edge, services, async, data, external. |
| What happens, step by step, and where does it branch? | `flowchart` | Top to bottom. Diamonds only for real decisions. |
| Who calls whom, in what order, and what comes back? | `sequence` | Best for one request or saga. Four to seven participants. |
| What states can it be in, and what moves it? | `state` | Label every transition with its event. |
| How is the data shaped and related? | `datamodel` | Only the fields that matter for the question. |
| What contains what? | `tree` | Folders, modules, org charts, taxonomies. |
| What belongs to this topic? | `mindmap` | Brainstorms and overviews without flow. |

## Views

- One question per view. If the title needs "and", consider two views.
- About 12 to 15 parts per view. The check warns above 16.
- Big systems: an **overview** (one part per service or group, the main path numbered) plus **focused views** (one flow, one subsystem, one sequence). Name them so they read as a set: "Payments: overview", "Payments: card authorization".
- Pick one abstraction level per view (C4 style): systems, or services, or modules. Do not mix a database table with a whole region.
- A sequence diagram is often the best second view after an architecture overview: the overview shows where, the sequence shows when.

## Understanding a project

1. Find the entry points (routes, handlers, CLI commands, queues consumed) and the stores (databases, caches, buckets, external APIs).
2. Trace one real request end to end. Cite `file:line` for each hop.
3. Draft the overview from what you traced, not from folder names.
4. Ask which flow or part the user cares about most; make that the focused view.

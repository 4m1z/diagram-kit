# Environment: where the diagram goes

Decide this first; it changes the output, not the spec.

## Choosing the destination

- The user named it ("put it in the app", "make an artifact", "a PNG for the README"): do that.
- Not named, and you can ask: ask once, together with any other questions, offering only what this environment supports. Recommend the option that fits the context first:

| Option | Offer it when | What you produce |
|---|---|---|
| In this app | The workspace is an app the user develops (React: `--react`; anything else: `layout.json`) | A component in the app's source tree, or positioned data the app renders itself |
| Cloud artifact | The host has a publishing tool (Claude Code's Artifact tool) | The HTML page published as a private artifact, and its link |
| Standalone page | Always | `<name>.html` in a folder the user picks or the repo's diagram folder |
| Image for docs | The diagram goes into Markdown, a PR, slides or chat | `<name>.png` (and `--dark`), with the HTML linked for interaction |

- Cannot ask (headless, scheduled or `exec` runs, no question tool, no answer): use the standalone page in the default folder below and report the path.
- Layout happens when you build. An app that needs live layout for data that changes at runtime should render `layout.json` for fixed diagrams only, or call the scripts again when the spec changes.

## Where files go

- Inside a repository: follow its convention (`docs/diagrams/`, `design/`, ...). With none, use `docs/diagrams/<slug>/` and keep the spec, brief and outputs together.
- In this app: the component or data goes where the app keeps similar code (for example `src/components/diagrams/<name>/`); the spec and brief still live in the diagram folder so the diagram can be rebuilt.
- Outside a repository: next to the document being explained, or a folder the user names.
- Add `*.png` previews to version control only if the project keeps images; the spec rebuilds everything.

## Outputs

| Situation | Deliver |
|---|---|
| Default | `<name>.html`: one self-contained page (fonts, data and viewer inlined, no network). Open it or give its path. |
| Claude Code with the Artifact tool | Publish `<name>.html` as an artifact. It already follows the artifact page contract: tokens on `:root`, dark mode by media query and `data-theme`, an explicit body background, no external requests. |
| A React project | `build <spec> --react src/diagrams/<name>` writes `Diagram.tsx` (a client component), `diagram-viewer.js`, `diagram.css` (tokens scoped to `.dk-root`, Geist via `fonts/`), `<name>.layout.json` and a usage example. Import the JSON and render `<Diagram model={model} />`. Next.js Pages Router: import `diagram.css` from `pages/_app` instead. |
| Markdown, slides, chat, a PR | `<name>.png` (light) and `--dark` for `<name>.dark.png`. Link the HTML for the interactive version. |
| Another renderer | `<name>.layout.json` is the contract: every node, group and wire with its final coordinates. Draw it any way you like. |

## The interactive page

- Drag or scroll to pan; Ctrl/⌘ + scroll or pinch to zoom; F to fit, T for the theme.
- Hover a part or wire to trace its connections; click a part, wire or group for `about`, `details`, facts and sources.
- Flows: play, pause and step with Space and the arrow keys; a packet travels each wire in order.
- Works on phones: controls stay reachable, the inspector becomes a bottom sheet.

## Hosts

- **Claude Code**: look at previews with the Read tool. Skills live in `.claude/skills/` (project) or `~/.claude/skills/` (user), or come from the plugin.
- **Codex**: look at previews with `view_image`. The PNG renderer needs no browser, so it works inside the sandbox. Skills live in `.agents/skills/` or `~/.agents/skills/`, or come from the plugin (`$CODEX_HOME/plugins/cache/`, which Codex rewrites on refresh). The one-time `diagram.mjs setup` needs network and writes to `~/.cache/diagram-kit/`, so request escalation for it; builds afterwards only read that cache and write to the output folder.
- Both: dependencies live in `~/.cache/diagram-kit/deps-<lockfile hash>` (or `$DIAGRAM_KIT_DEPS`), outside any plugin folder, so one setup serves every host and survives plugin updates that keep the same lockfile. The CLI prints the exact command when setup is needed.

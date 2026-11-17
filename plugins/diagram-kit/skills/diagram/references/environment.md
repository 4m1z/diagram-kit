# Environment: where the diagram goes

Decide this first; it changes the output, not the spec.

## Where files go

- Inside a repository: follow its convention (`docs/diagrams/`, `design/`, ...). With none, use `docs/diagrams/<slug>/` and keep the spec, brief and outputs together.
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
- **Codex**: look at previews with `view_image`. The PNG renderer needs no browser, so it works inside the sandbox. Skills live in `.agents/skills/` or `~/.agents/skills/`, or come from the plugin (installed under `$CODEX_HOME/plugins/cache/`). The one-time `npm ci` needs network and writes there, so request escalation for it; builds afterwards only write to the output folder.
- Both: run `npm ci` once per install and again after an update. The CLI prints the exact command when it is needed.

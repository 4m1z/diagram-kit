# Visual language

Quiet by default, in the spirit of Vercel, Linear and Railway: neutral greys, hairline borders, one accent, Geist type, a faint dot grid, small monospace for anything technical. The picture shows structure; words stay short.

## Minimalism rules

- Labels: one to three words, sentence case ("Order service", not "ORDER SERVICE MICROSERVICE").
- `sub`: at most one short technical line (technology, protocol). Leave it out when it adds nothing.
- Wire labels: a verb or protocol ("write", "gRPC", "PaymentCaptured"). Unlabelled when obvious.
- Icons: one per part, from Lucide, only when it helps recognition. Same role, same icon.
- Tones: none by default. Use `tone: accent` on the one or two parts the diagram is about; use a colour tone only for a real category (for example red for failure states).
- No legends, captions or paragraphs on the canvas. Explanations go in `about`, `details` and `facts`, which the page shows on click.
- Wire styles carry meaning, so keep them consistent: solid sync, dashed async, dotted data, dashed grey replies.

## Tokens

All colours, fonts and sizes are tokens (`assets/viewer/theme.mjs`): `bg`, `dot`, `surface`, `surface2`, `border`, `borderStrong`, `text`, `muted`, `faint`, `edge`, `edgeStrong`, `accent`, `accentText`, `accentSoft`, `group`, `groupBorder`, `shadow`, and the tones `blue`, `green`, `amber`, `red`, `violet`, `pink`, `cyan`, `slate`. Each exists for `light` and `dark`.

Override per diagram in the spec:

```yaml
theme:
  light: { accent: '#0070f3', bg: '#ffffff' }
  dark: { accent: '#3291ff' }
  fonts: { sans: 'Inter, system-ui, sans-serif' }
```

or per project with a tokens file: `build <spec> --tokens design/diagram-tokens.json` (same shape). In HTML and React output every token is a CSS variable (`--dk-accent`, `--dk-border-strong`, `--dk-sans`, ...), so a host stylesheet can restyle a finished diagram without a rebuild.

## Adopting a host style

When the project has a design system, map it instead of inventing one:

1. Find its tokens: CSS custom properties, a Tailwind theme, a tokens JSON, or the design docs.
2. Map background, surface, border, text, muted text and the accent onto the tokens above; keep the rest default.
3. Use the host's font in `theme.fonts.sans` / `mono`. Measure it so boxes fit the text: `diagram metrics path/to/Font-Medium.ttf --as sans-500 --out diagram-metrics.json` (repeat for `sans-400`, `sans-600`, `mono-400`), then build with `--metrics diagram-metrics.json`. Without metrics, layout uses Geist's widths.
4. Keep the minimalism rules even when the host is louder.

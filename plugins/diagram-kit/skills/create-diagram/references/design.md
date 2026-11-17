# Look: adapt first

The user's environment sets the look. Match their medium, colours, type, language and tone; never push ours into their project. The built-in look below is only a fallback for standalone pages and artifacts where no host style exists: quiet, in the spirit of Vercel, Linear and Railway (neutral greys, hairline borders, one accent, Geist type, a faint dot grid, small monospace for technical text).

## Minimalism rules

- Labels: one to three words, sentence case ("Order service", not "ORDER SERVICE MICROSERVICE").
- `sub`: at most one short technical line (technology, protocol). Leave it out when it adds nothing.
- Wire labels: a verb or protocol ("write", "gRPC", "PaymentCaptured"). Unlabelled when obvious.
- Icons: one per part, from Lucide, only when it helps recognition. Same role, same icon.
- Tones: none by default. Use `tone: accent` on the one or two parts the diagram is about; use a colour tone only for a real category (for example red for failure states).
- No legends, captions or paragraphs on the canvas. Explanations go in `about`, `details` and `facts`, which the page shows on click. Leave them out when the user wants less or another language and tone; write them in the user's language.
- Wire styles carry meaning, so keep them consistent: solid sync, dashed async, dotted data, dashed grey replies.

## Matching a host with tokens

Every colour, font and size in the built-in page is a token (`assets/viewer/theme.mjs`), so the page can take on a host's look when it is delivered as a page or artifact inside their world. Tokens are your tool for matching a host, not settings for users. Pass the host's values with `theme:` in the spec or `--tokens file.json` (shape: `{ light: {...}, dark: {...}, fonts: {...} }`); in HTML and React output they become CSS variables (`--dk-accent`, ...).

## Finding the host style

When the project has a design system or its own way of drawing, use it instead of inventing one:

1. Find its tokens: CSS custom properties, a Tailwind theme, a tokens JSON, or the design docs.
2. Map background, surface, border, text, muted text and the accent onto the tokens above; keep the rest default.
3. Use the host's font in `theme.fonts.sans` / `mono`. Measure it so boxes fit the text: `diagram metrics path/to/Font-Medium.ttf --as sans-500 --out diagram-metrics.json` (repeat for `sans-400`, `sans-600`, `mono-400`), then build with `--metrics diagram-metrics.json`. Without metrics, layout uses Geist's widths.
4. Take colours, type and shapes from the host; keep only the content rules above (short labels, an uncluttered canvas).

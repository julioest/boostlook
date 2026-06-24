# Boostlook v3 — Local Dev Workflow

How to develop `boostlook-v3.css` and preview it live against **real Boost docs of
every type** — Antora site guides, Antora library docs, and standalone AsciiDoctor —
with CSS hot-reload.

---

## TL;DR

```sh
# from the boostlook repo root
npm install        # once — installs browser-sync
npm run dev        # → http://localhost:3000/preview.html
```

Then edit any `src/css/*.css` module. The bundle rebuilds and the new styles
**hot-inject** into every open doc tab — no page refresh.

---

## The CSS you edit

`boostlook-v3.css` is **generated** — never edit it directly. The source of truth is
the modular files in `src/css/`, concatenated in numeric order by `build-css.sh`.

| File | Concern |
|------|---------|
| `00-header.css` | License, overview, conventions |
| `01-variables.css` | Root custom properties (spacing, type, icons) |
| `02-themes.css` | Light/dark theme variable mappings |
| `03-fonts.css` | `@font-face` declarations |
| `04-reset.css` | CSS reset |
| `05-global-typography.css` | Base container, headings, anchors |
| `06-global-links.css` | Paragraphs, links, footnotes |
| `07-global-code.css` | Code blocks, inline code, syntax highlighting |
| `08-global-components.css` | Quotes, pagination, admonitions, lists |
| `09-global-tables-images.css` | Tables, images |
| `10-scrollbars.css` | Scrollbars (Firefox + WebKit) |
| `11-template-layout.css` | Template scrolling, iframe, TOC common |
| `12-asciidoctor.css` | AsciiDoctor-specific styles |
| `13-antora.css` | Antora nav, toolbar, breadcrumbs, tabs, search |
| `14-quickbook.css` | Quickbook legacy wrapper |
| `15-readme.css` | Library README styles |
| `16-responsive-toc.css` | AsciiDoctor responsive TOC |

The edit loop:

1. Edit the right module in `src/css/`.
2. `sh build-css.sh` regenerates `boostlook-v3.css` (the dev server does this for you on save).
3. Commit **both** the `src/css/` change and the regenerated `boostlook-v3.css`.

> Note: `boostlook-v3.css` (v3) and `boostlook.css` (v1) are separate frameworks.
> v3 work happens entirely in `src/css/`.

---

## The dev server

```sh
npm run dev
```

Serves a landing page at **http://localhost:3000/preview.html** linking one sample of
each documentation type, all styled with your working `boostlook-v3.css`:

| Sample | Engine | Route |
|--------|--------|-------|
| User Guide | Antora (site) | `/user-guide/` |
| Contributor Guide | Antora (site) | `/contributor-guide/` |
| Formal Reviews | Antora (site) | `/formal-reviews/` |
| Capy | Antora (library) | `/lib/doc/capy/` |
| MSM | Antora (library) | `/lib/doc/msm/` |
| URL | Antora (library) | `/lib/doc/url/` |
| CharConv (`specimen.adoc`) | AsciiDoctor | `/specimen/` |

Edit any `src/css/*.css` → save → the styles update live across all open tabs.

### How it works

See `dev-server.js`. In short:

- **Serves pre-built docs.** It serves the already-rendered Antora output from
  `../website-v2-docs/build/` rather than rebuilding — fast startup, no Antora or `b2`
  toolchain required at dev time.
- **Injects your CSS via middleware.** Every built page links a single stylesheet,
  `/_/css/boostlook.css`. A middleware route intercepts that path and serves your
  working `boostlook-v3.css` **from an in-memory buffer**. Consequences:
  - `build/` is never modified.
  - A request can never observe a half-written bundle (the buffer only updates after a
    *complete* build).
- **Renders the AsciiDoctor specimen on boot** via `boostlook.rb` (which wraps output in
  `.boostlook`, the scope v3 selectors live under). Code is highlighted client-side with
  highlight.js, so the `rouge` gem is not required. Skipped gracefully if the
  `asciidoctor` CLI is missing.
- **Watches `src/css/**`.** On save it runs `build-css.sh` (debounced, non-overlapping so
  concurrent builds can't race the output file) and triggers a CSS-only injection.

### Why both this and Netlify?

- **Local dev server** = the *inner loop*: instant CSS feedback while you work.
- **[boostlook-v3.netlify.app](https://boostlook-v3.netlify.app/)** = the *outer loop*:
  a shareable, reviewable surface for stakeholders. Slower (push → build → deploy), so
  not for tight iteration.

They're complementary.

---

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `BOOSTLOOK_DOCS_BUILD` | `../website-v2-docs/build` | Path to the built Antora docs to serve |
| `PORT` | `3000` | Dev server port |

---

## Prerequisites

- **Node + npm** — for the dev server (browser-sync).
- **`asciidoctor` CLI** — for the standalone specimen only; optional.
- **A built `website-v2-docs/build/` directory** — the rendered Antora docs to serve.

### Refreshing doc content

The served docs are a static snapshot — fine for CSS work, but **content** can be stale.
To regenerate with current content, build in the `website-v2-docs` repo:

```sh
cd ../website-v2-docs
./dev.sh            # builds antora-ui + site guides + library docs into ./build
```

> macOS: the build scripts expect GNU `findutils`.
> `brew install findutils` and add it to your `PATH`.

To preview v3 *during* that full build (instead of v1), the antora-ui pipeline downloads
boostlook CSS from GitHub; pass `--skip-boostlook` and place your working CSS at
`website-v2-docs/antora-ui/src/css/boostlook.css` to use it locally. For day-to-day CSS
work this isn't needed — the dev server's middleware already swaps in your live copy.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Built docs not found at …` on startup | Build `website-v2-docs/build/` (see above) or set `BOOSTLOOK_DOCS_BUILD`. |
| Specimen page missing / `asciidoctor not available` | Install the `asciidoctor` CLI (`gem install asciidoctor`). |
| Styles don't update on save | Confirm you edited a file under `src/css/` (not `boostlook-v3.css` directly); check the terminal for a `build-css.sh failed` message. |
| Doc content looks outdated | Expected — refresh content via `./dev.sh` in `website-v2-docs`. |
| Code blocks unstyled in the specimen | highlight.js loads from CDN; needs network access. |

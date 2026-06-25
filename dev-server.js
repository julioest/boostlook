/*
 * Local dev server for boostlook-v3.css.
 *
 * Serves the already-built website-v2-docs multi-doc site (Antora site guides +
 * library docs) plus a standalone AsciiDoctor specimen (charconv), all styled
 * with your *working* boostlook-v3.css. Edits to src/css/** rebuild the bundle
 * and hot-inject the CSS into every open doc tab without a full page reload.
 *
 * The built site links a single stylesheet at /_/css/boostlook.css. Instead of
 * overwriting that file inside build/, we intercept that route with middleware
 * and serve our freshly-built boostlook-v3.css. build/ is never mutated.
 *
 * Usage:  npm run dev
 * Env:    BOOSTLOOK_DOCS_BUILD  override path to website-v2-docs/build
 *         PORT                  override port (default 3000)
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const browserSync = require('browser-sync')

const ROOT = __dirname
const V3_CSS = path.join(ROOT, 'boostlook-v3.css')
const SRC_GLOB = path.join(ROOT, 'src/css/**/*.css')
const DEV_DIR = path.join(ROOT, '.dev') // generated, gitignored
const SPECIMEN_OUT = path.join(DEV_DIR, 'specimen', 'index.html')
const LANDING_OUT = path.join(DEV_DIR, 'preview.html')

const BUILD = process.env.BOOSTLOOK_DOCS_BUILD ||
  path.resolve(ROOT, '../website-v2-docs/build')
const PORT = parseInt(process.env.PORT || '3000', 10)

function fail (msg) {
  console.error(`\n[boostlook-dev] ${msg}\n`)
  process.exit(1)
}

// --- prerequisites ---------------------------------------------------------
if (!fs.existsSync(BUILD)) {
  fail(
    `Built docs not found at:\n  ${BUILD}\n\n` +
    `Build them once in the website-v2-docs repo (e.g. \`./dev.sh\`), or point\n` +
    `BOOSTLOOK_DOCS_BUILD at an existing build/ directory.`
  )
}

// --- css build -------------------------------------------------------------
// The middleware serves from this buffer, refreshed only after a *complete*
// build, so a request can never observe a half-written bundle.
let cssBuffer = Buffer.alloc(0)

function buildCss () {
  execFileSync('sh', ['build-css.sh'], { cwd: ROOT, stdio: 'inherit' })
  cssBuffer = fs.readFileSync(V3_CSS)
}

// --- standalone AsciiDoctor specimen (charconv) ----------------------------
// Rendered with boostlook.rb (wraps <body> in .boostlook) and linked to our
// CSS route. Skipped gracefully if the asciidoctor CLI is unavailable.
function renderSpecimen () {
  fs.mkdirSync(path.dirname(SPECIMEN_OUT), { recursive: true })
  try {
    execFileSync('asciidoctor', [
      '-r', path.join(ROOT, 'boostlook-v3.rb'),
      '-a', 'linkcss',
      '-a', 'copycss!', // we serve the CSS via middleware; don't copy it out
      '-a', 'stylesdir=/_/css',
      '-a', 'stylesheet=boostlook.css',
      '-a', 'source-highlighter=highlightjs', // client-side; no rouge gem needed
      '-a', 'docinfodir=' + path.join(ROOT, 'doc'),
      path.join(ROOT, 'doc/specimen.adoc'),
      '-o', SPECIMEN_OUT,
    ], { cwd: ROOT, stdio: 'inherit' })
    return true
  } catch (e) {
    console.warn('[boostlook-dev] asciidoctor not available — skipping specimen sample.')
    return false
  }
}

// --- helpers ---------------------------------------------------------------
function esc (s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

// Recent commits to boostlook, shown as a live "what changed" panel — always
// current, unlike a hand-maintained changelog. Empty array if git is absent.
function getChangelog () {
  try {
    const raw = execFileSync('git',
      ['log', '-14', '--no-merges', '--pretty=format:%h\x1f%s\x1f%cr'],
      { cwd: ROOT }).toString()
    return raw.split('\n').filter(Boolean).map((line) => {
      const [hash, subject, when] = line.split('\x1f')
      const m = subject.match(/^([a-z]+)(?:\([^)]*\))?!?:\s*(.*)$/i)
      return {
        hash,
        type: m ? m[1].toLowerCase() : 'misc',
        text: m ? m[2] : subject,
        when,
      }
    })
  } catch (e) {
    return []
  }
}

// --- landing page ----------------------------------------------------------
function writeLanding (hasSpecimen) {
  const has = (route) =>
    fs.existsSync(path.join(BUILD, route.replace(/^\/|\/$/g, ''), 'index.html'))

  const groups = [
    {
      label: 'Site Documentation',
      hint: 'Versioned guides for the Boost website',
      items: [
        { name: 'User Guide', route: '/user-guide/', engine: 'Antora' },
        { name: 'Contributor Guide', route: '/contributor-guide/', engine: 'Antora' },
        { name: 'Formal Reviews', route: '/formal-reviews/', engine: 'Antora' },
      ],
    },
    {
      label: 'Library Documentation',
      hint: 'Per-library reference — one of each rendering engine',
      items: [
        { name: 'Boost.Capy', route: '/lib/doc/capy/', engine: 'Antora' },
        { name: 'Boost.MSM', route: '/lib/doc/msm/', engine: 'Antora' },
        { name: 'Boost.URL', route: '/lib/doc/url/', engine: 'Antora' },
        { name: 'Boost.CharConv', route: '/specimen/', engine: 'AsciiDoctor', note: 'specimen.adoc' },
      ],
    },
  ]

  for (const g of groups) {
    g.items = g.items.filter((it) =>
      it.route === '/specimen/' ? hasSpecimen : has(it.route))
  }
  const visible = groups.filter((g) => g.items.length)
  const total = visible.reduce((n, g) => n + g.items.length, 0)
  const engines = new Set()
  visible.forEach((g) => g.items.forEach((it) => engines.add(it.engine)))

  const arrow =
    '<svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M5 12h14M13 6l6 6-6 6"/></svg>'

  const sections = visible.map((g) => {
    const cards = g.items.map((it) => {
      const cls = it.engine.toLowerCase()
      const note = it.note ? `<span class="note">${esc(it.note)}</span>` : ''
      return `        <a class="card" href="${it.route}">
          <span class="card-top">
            <span class="name">${esc(it.name)}</span>
            <span class="pill ${cls}">${esc(it.engine)}</span>
          </span>
          <span class="card-bottom">
            <span class="route">${esc(it.route)}</span>${note}
          </span>
          ${arrow}
        </a>`
    }).join('\n')
    return `      <section class="group">
        <header class="group-head">
          <h2>${esc(g.label)}</h2>
          <p>${esc(g.hint)}</p>
        </header>
        <div class="grid">
${cards}
        </div>
      </section>`
  }).join('\n')

  const log = getChangelog()
  const chev =
    '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6 9l6 6 6-6"/></svg>'
  const changelogMenu = log.length ? `<div class="cl-menu">
        <button id="cl-btn" class="cl-btn" type="button" aria-expanded="false" aria-controls="cl-panel" title="Recent commits — from git log">
          <span>Recent changes</span><span class="cl-count">${log.length}</span>${chev}
        </button>
        <div id="cl-panel" class="cl-panel" role="region" aria-label="Recent changes" hidden>
          <ol class="cl-list">
${log.map((c) => `            <li class="cl-item">
              <span class="cl-tag t-${esc(c.type)}">${esc(c.type)}</span>
              <span class="cl-body"><span class="cl-text">${esc(c.text)}</span><span class="cl-meta">${esc(c.when)} · <code>${esc(c.hash)}</code></span></span>
            </li>`).join('\n')}
          </ol>
        </div>
      </div>` : ''

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boostlook 2.0 — Local Preview</title>
<script>
  (function () {
    var KEY = 'boostlook-dev-theme';
    var saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  })();
</script>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    color-scheme: light;
    --bg: #f6f7f9;
    --bg-grad: radial-gradient(1200px 520px at 80% -10%, #eef2ff 0%, transparent 60%);
    --panel: #ffffff;
    --panel-2: #fbfcfe;
    --border: #e6e8ed;
    --border-strong: #d7dae1;
    --text: #1a1d23;
    --muted: #6b7280;
    --faint: #9aa1ad;
    --accent: #3b6df6;
    --accent-weak: #eaf0ff;
    --pill: #eef1f6;
    --pill-text: #4b5563;
    --ad-pill: #fde7e1;
    --ad-text: #b4502f;
    --shadow: 0 1px 2px rgba(20,30,60,.05), 0 8px 24px rgba(20,30,60,.06);
    --ok: #1f9d57;
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #0b0d11;
    --bg-grad: radial-gradient(1100px 500px at 82% -12%, #16203a 0%, transparent 60%);
    --panel: #14171d;
    --panel-2: #11141a;
    --border: #232831;
    --border-strong: #2c333f;
    --text: #e9ebef;
    --muted: #99a1b0;
    --faint: #6a7382;
    --accent: #6f9bff;
    --accent-weak: #18233c;
    --pill: #232a36;
    --pill-text: #c3cbd9;
    --ad-pill: #3a2723;
    --ad-text: #f0b39e;
    --shadow: 0 1px 2px rgba(0,0,0,.3), 0 10px 30px rgba(0,0,0,.35);
    --ok: #46c886;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --bg: #0b0d11;
      --bg-grad: radial-gradient(1100px 500px at 82% -12%, #16203a 0%, transparent 60%);
      --panel: #14171d;
      --panel-2: #11141a;
      --border: #232831;
      --border-strong: #2c333f;
      --text: #e9ebef;
      --muted: #99a1b0;
      --faint: #6a7382;
      --accent: #6f9bff;
      --accent-weak: #18233c;
      --pill: #232a36;
      --pill-text: #c3cbd9;
      --ad-pill: #3a2723;
      --ad-text: #f0b39e;
      --shadow: 0 1px 2px rgba(0,0,0,.3), 0 10px 30px rgba(0,0,0,.35);
      --ok: #46c886;
    }
  }
  html, body { margin: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--text);
    background: var(--bg-grad), var(--bg);
    background-repeat: no-repeat;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1080px; margin: 0 auto; padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 4vw, 2rem) 4rem; }

  header.top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 2rem; }
  .brand { display: flex; align-items: center; gap: .8rem; min-width: 0; }
  .logo {
    width: 40px; height: 40px; border-radius: 11px; flex: none;
    background: linear-gradient(135deg, #6f9bff, #3b6df6 55%, #7c4dff);
    display: grid; place-items: center; color: #fff; font-weight: 800;
    font-size: .82rem; letter-spacing: .02em; box-shadow: var(--shadow);
  }
  .brand h1 { font-size: 1.15rem; margin: 0; font-weight: 700; letter-spacing: -.01em; }
  .brand .tag { margin: 0; font-size: .82rem; color: var(--muted); }
  .controls { display: flex; align-items: center; gap: .6rem; flex: none; }
  .toggle {
    width: 38px; height: 38px; border-radius: 10px; cursor: pointer;
    border: 1px solid var(--border); background: var(--panel); color: var(--text);
    font-size: 1.05rem; line-height: 1; display: grid; place-items: center; box-shadow: var(--shadow);
    transition: border-color .15s, transform .1s;
  }
  .toggle:hover { border-color: var(--border-strong); }
  .toggle:active { transform: translateY(1px); }

  .lede { margin: 0 0 .35rem; font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 750; letter-spacing: -.02em; }
  .sub { margin: 0 0 .4rem; color: var(--muted); max-width: 60ch; }
  .sub code, .meta code, .cl-meta code {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: .85em;
    background: var(--pill); padding: .08em .38em; border-radius: 5px; color: var(--text);
  }
  .meta { color: var(--faint); font-size: .82rem; margin: 0 0 2rem; }

  .samples { margin-top: .25rem; }
  .group { margin-bottom: 1.9rem; }
  .group-head h2 { font-size: .78rem; text-transform: uppercase; letter-spacing: .07em; color: var(--faint); margin: 0 0 .15rem; }
  .group-head p { margin: 0 0 .9rem; font-size: .85rem; color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: .9rem; }

  .card {
    position: relative; display: flex; flex-direction: column; gap: .55rem;
    padding: 1rem 1.05rem; border: 1px solid var(--border); border-radius: 13px;
    background: var(--panel); text-decoration: none; color: inherit; box-shadow: var(--shadow);
    transition: border-color .15s, transform .12s, box-shadow .15s;
  }
  .card:hover { border-color: var(--accent); transform: translateY(-2px); }
  .card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .card-top { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
  .name { font-weight: 650; font-size: 1rem; letter-spacing: -.01em; }
  .card-bottom { display: flex; align-items: center; gap: .55rem; }
  .route { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: .76rem; color: var(--muted); }
  .note { font-size: .72rem; color: var(--faint); }
  .pill { font-size: .66rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: .22rem .5rem; border-radius: 999px; background: var(--pill); color: var(--pill-text); white-space: nowrap; }
  .pill.asciidoctor { background: var(--ad-pill); color: var(--ad-text); }
  .arrow { position: absolute; right: .9rem; bottom: .9rem; color: var(--faint); opacity: 0; transform: translateX(-4px); transition: opacity .15s, transform .15s; }
  .card:hover .arrow { opacity: 1; transform: translateX(0); color: var(--accent); }

  .cl-menu { position: relative; }
  .cl-btn { display: inline-flex; align-items: center; gap: .45rem; height: 38px; padding: 0 .8rem; border: 1px solid var(--border); background: var(--panel); color: var(--text); border-radius: 10px; font: inherit; font-size: .82rem; font-weight: 600; cursor: pointer; box-shadow: var(--shadow); transition: border-color .15s; white-space: nowrap; }
  .cl-btn:hover { border-color: var(--border-strong); }
  .cl-count { font-size: .66rem; font-weight: 800; color: var(--pill-text); background: var(--pill); padding: .1rem .42rem; border-radius: 999px; }
  .chev { color: var(--faint); transition: transform .2s; flex: none; }
  .cl-btn[aria-expanded="true"] .chev { transform: rotate(180deg); }
  .cl-panel { position: absolute; right: 0; top: calc(100% + .55rem); width: min(400px, 88vw); max-height: min(64vh, 540px); overflow: auto; background: var(--panel); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 16px 44px rgba(20,30,60,.18); z-index: 50; }
  :root[data-theme="dark"] .cl-panel { box-shadow: 0 18px 52px rgba(0,0,0,.55); }
  .cl-panel[hidden] { display: none; }
  .cl-list { list-style: none; margin: 0; padding: .5rem; display: flex; flex-direction: column; }
  .cl-item { display: flex; gap: .6rem; padding: .5rem .55rem; border-radius: 9px; align-items: baseline; }
  .cl-item:hover { background: var(--accent-weak); }
  .cl-tag { flex: none; font-size: .62rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; padding: .18rem .42rem; border-radius: 6px; background: var(--pill); color: var(--pill-text); min-width: 3.7em; text-align: center; }
  .t-feat { background: rgba(31,157,87,.16); color: #1f9d57; }
  .t-fix { background: rgba(217,140,18,.16); color: #c67c0a; }
  .t-refactor { background: rgba(124,77,255,.16); color: #7c4dff; }
  .t-docs { background: rgba(59,109,246,.14); color: var(--accent); }
  :root[data-theme="dark"] .t-fix { color: #e7a23b; }
  :root[data-theme="dark"] .t-feat { color: #46c886; }
  .cl-body { display: flex; flex-direction: column; min-width: 0; }
  .cl-text { font-size: .86rem; }
  .cl-meta { font-size: .72rem; color: var(--faint); margin-top: .1rem; }

  footer { margin-top: 2.5rem; padding-top: 1.4rem; border-top: 1px solid var(--border); color: var(--faint); font-size: .8rem; display: flex; flex-wrap: wrap; gap: .35rem .9rem; }
  footer a { color: var(--muted); text-decoration: none; }
  footer a:hover { color: var(--accent); }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="brand">
      <div class="logo">2.0</div>
      <div>
        <h1>Boostlook</h1>
        <p class="tag">Local preview · ${total} samples · ${[...engines].join(' + ')}</p>
      </div>
    </div>
    <div class="controls">
      ${changelogMenu}
      <button id="theme-toggle" class="toggle" type="button" aria-label="Toggle theme">☾</button>
    </div>
  </header>

  <h2 class="lede">Preview Boostlook 2.0 across every doc type</h2>
  <p class="sub">One sample of each Boost documentation engine, styled with your working <code>boostlook-v3.css</code>. Edit any <code>src/css/*.css</code> module — the styles hot-reload in place, no refresh.</p>
  <p class="meta">Served from <code>${esc(BUILD)}</code> · CSS injected at <code>/_/css/boostlook.css</code></p>

  <main class="samples">
${sections}
  </main>

  <footer>
    <span>Boostlook 2.0 dev server</span>
    <a href="https://github.com/boostorg/boostlook" target="_blank" rel="noopener">boostorg/boostlook</a>
    <a href="https://boostlook-v3.netlify.app/" target="_blank" rel="noopener">Netlify preview ↗</a>
  </footer>
</div>

<script>
  (function () {
    var KEY = 'boostlook-dev-theme';
    var root = document.documentElement;
    var btn = document.getElementById('theme-toggle');
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    function effectiveDark () {
      var t = root.getAttribute('data-theme');
      if (t === 'dark') return true;
      if (t === 'light') return false;
      return mq.matches;
    }
    function render () { btn.textContent = effectiveDark() ? '☀' : '☾'; }
    btn.addEventListener('click', function () {
      var next = effectiveDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem(KEY, next);
      render();
    });
    mq.addEventListener('change', render);
    render();
  })();

  (function () {
    var btn = document.getElementById('cl-btn');
    var panel = document.getElementById('cl-panel');
    if (!btn || !panel) return;
    function setOpen (open) {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(panel.hidden);
    });
    document.addEventListener('click', function (e) {
      if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  })();
</script>
</body>
</html>
`
  fs.mkdirSync(DEV_DIR, { recursive: true })
  fs.writeFileSync(LANDING_OUT, html)
}

// --- boot ------------------------------------------------------------------
console.log('[boostlook-dev] building CSS…')
buildCss()
const hasSpecimen = renderSpecimen()
writeLanding(hasSpecimen)

const bs = browserSync.create()

bs.init({
  port: PORT,
  ui: false,
  notify: false,
  open: false,
  startPath: '/preview.html',
  server: {
    // .dev first so /preview.html and /specimen/ resolve to our generated files;
    // everything else (/_/, /user-guide/, /lib/, …) falls through to the build.
    baseDir: [DEV_DIR, BUILD],
  },
  // Intercept the stylesheet every page links and serve our working copy.
  // The site guides link /_/css/boostlook.css, but the Antora library build
  // emits its own UI assets under /lib/doc/_/, so library pages link
  // /lib/doc/_/css/boostlook.css. Match the file at *any* depth.
  middleware: [
    (req, res, next) => {
      const p = (req.url || '').split('?')[0]
      if (p.endsWith('/_/css/boostlook.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        return res.end(cssBuffer)
      }
      next()
    },
  ],
}, (err, inst) => {
  if (err) return fail('browser-sync failed to start: ' + err)
  const url = inst.options.getIn(['urls', 'local'])
  console.log(`\n[boostlook-dev] preview ready → ${url}\n`)
})

// Watch the modular CSS source. On change: rebuild the bundle, then inject.
// Debounced + guarded so rapid saves coalesce and builds never overlap (which
// would race on boostlook-v3.css).
let building = false
let pending = false
let debounce = null

function rebuild () {
  if (building) { pending = true; return }
  building = true
  try {
    buildCss()
    bs.reload('boostlook.css') // CSS-only injection, no full reload
  } catch (e) {
    console.error('[boostlook-dev] build-css.sh failed:', e.message)
  } finally {
    building = false
    if (pending) { pending = false; rebuild() }
  }
}

bs.watch(SRC_GLOB).on('change', (file) => {
  console.log(`[boostlook-dev] changed: ${path.relative(ROOT, file)} → rebuilding`)
  clearTimeout(debounce)
  debounce = setTimeout(rebuild, 120)
})

#!/bin/sh
#
# Build the Boostlook 2.0 multi-doc preview and (optionally) deploy to Netlify.
#
# Pipeline:
#   1. Build boostlook-v3.css from the src/css modules
#   2. Inject it into website-v2-docs/antora-ui and rebuild the UI bundle
#   3. Rebuild the site guides (local content) with the 2.0 UI bundle
#   4. Bake 2.0 CSS into the reused (prebuilt) library docs
#   5. Render the charconv AsciiDoctor specimen
#   6. Generate the preview landing (index.html)
#   7. Optionally deploy: --draft (preview URL) or --prod (publish)
#
# Usage:
#   ./build-preview.sh            # build only -> <docs>/build ready to upload
#   ./build-preview.sh --draft    # build + draft deploy (preview URL)
#   ./build-preview.sh --prod     # build + production deploy
#
# Env overrides:
#   BOOSTLOOK_DOCS   path to website-v2-docs (default: ../website-v2-docs)
#   NETLIFY_SITE_ID  Netlify site id (default: the boostlook-v3 site)
#
set -eu

DEPLOY=""
case "${1:-}" in
  --draft) DEPLOY=draft ;;
  --prod)  DEPLOY=prod ;;
  "") ;;
  *) echo "unknown argument: $1 (use --draft or --prod)"; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")" && pwd)"
DOCS_RAW="${BOOSTLOOK_DOCS:-$ROOT/../website-v2-docs}"
[ -d "$DOCS_RAW" ] || { echo "ERROR: website-v2-docs not found at $DOCS_RAW (set BOOSTLOOK_DOCS)"; exit 1; }
DOCS="$(cd "$DOCS_RAW" && pwd)"
[ -f "$DOCS/site.playbook.yml" ] || { echo "ERROR: $DOCS does not look like website-v2-docs (no site.playbook.yml)"; exit 1; }
BUILD="$DOCS/build"
SITE_ID="${NETLIFY_SITE_ID:-0874ef8e-22a3-4a78-ad4b-b11a9c056a12}"

echo "boostlook : $ROOT"
echo "docs      : $DOCS"
echo "build out : $BUILD"
echo

# 1. Build the CSS bundle from src/css modules
echo "==> [1/6] build boostlook-v3.css"
sh "$ROOT/build-css.sh"

# 2. Inject our working CSS into antora-ui and rebuild the UI bundle.
#    --skip-boostlook makes gulp use the injected file instead of downloading.
echo "==> [2/6] inject 2.0 CSS + rebuild antora-ui bundle"
cp "$ROOT/boostlook-v3.css" "$DOCS/antora-ui/src/css/boostlook.css"
( cd "$DOCS/antora-ui" && npx gulp build --skip-boostlook && npx gulp bundle:pack )

# 3. Rebuild the site guides from local content with the fresh UI bundle.
echo "==> [3/6] rebuild site guides (antora)"
CID="$(cd "$DOCS" && git rev-parse --short HEAD 2>/dev/null || echo 0000000)"
( cd "$DOCS" && npx antora --fetch \
    --attribute page-boost-branch=develop \
    --attribute page-commit-id="$CID" \
    --stacktrace site.playbook.yml )

# 4. Bake the same 2.0 bundle into the reused (prebuilt) library docs, whose
#    own UI assets live under lib/doc/_/ and aren't rebuilt here.
echo "==> [4/6] bake 2.0 CSS into library docs"
if [ -d "$BUILD/lib/doc/_/css" ]; then
  cp "$BUILD/_/css/boostlook.css" "$BUILD/lib/doc/_/css/boostlook.css"
  [ -f "$BUILD/lib/doc/_/css/boostlook-v3.css" ] && \
    cp "$BUILD/_/css/boostlook.css" "$BUILD/lib/doc/_/css/boostlook-v3.css" || true
  echo "    baked into lib/doc/_/css/boostlook.css"
else
  echo "    WARN: $BUILD/lib/doc not found — library samples will be omitted."
  echo "          Run 'cd $DOCS && ./dev.sh lib' once to generate them."
fi

# 5. Render the charconv AsciiDoctor specimen (boostlook.rb adds the .boostlook
#    wrapper; highlight.js avoids needing the rouge gem).
echo "==> [5/6] render charconv specimen"
if command -v asciidoctor >/dev/null 2>&1; then
  mkdir -p "$BUILD/specimen"
  asciidoctor -r "$ROOT/boostlook-v3.rb" \
    -a linkcss -a copycss! -a stylesdir=/_/css -a stylesheet=boostlook.css \
    -a source-highlighter=highlightjs -a docinfodir="$ROOT/doc" \
    "$ROOT/doc/specimen.adoc" -o "$BUILD/specimen/index.html"
  echo "    wrote specimen/index.html"
else
  echo "    WARN: asciidoctor not found — specimen omitted (gem install asciidoctor)."
fi

# 6. Generate the preview landing page.
echo "==> [6/6] generate preview landing (index.html)"
node "$ROOT/scripts/gen-landing.js" "$BUILD" "$ROOT"

echo
echo "Preview folder ready: $BUILD"

# 7. Optional deploy via netlify-cli (requires `netlify login` once).
if [ "$DEPLOY" = draft ]; then
  echo "==> deploying DRAFT to Netlify (site $SITE_ID)"
  npx netlify-cli deploy --site="$SITE_ID" --dir="$BUILD" --no-build
elif [ "$DEPLOY" = prod ]; then
  echo "==> deploying PRODUCTION to Netlify (site $SITE_ID)"
  npx netlify-cli deploy --site="$SITE_ID" --dir="$BUILD" --no-build --prod
else
  echo "Next: re-run with --draft (preview URL) or --prod (publish), or drag-drop the folder into Netlify."
fi

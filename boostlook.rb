Asciidoctor::Extensions.register do
  postprocessor do
    process do |doc, output|
      # Ensure source-highlighter is set to none
      puts "Postprocessor: Current source-highlighter: #{doc.attributes['source-highlighter']}" # Debug line
      doc.attributes['source-highlighter'] = "highlight.js"

      # Add boostlook div
      output = output.sub(/(<body[^>]*>)/, '\1<div class="boostlook">')
      output = output.sub('</body>', '</div></body>')

      # Add TOC toggle button
      output = output.sub(/(<body.*?<div[^>]*id="toc"[^>]*>)/m, '\1<button id="toggle-toc" title="Show Table of Contents" aria-expanded="false" aria-controls="toc">☰</button>')
      output = output.sub(/(<body.*?<div[^>]*id="footer"[^>]*>)/m, '</div>\1')

      # Read Highlight.js CSS and JS content
      highlight_css_content = File.read(File.join(__dir__, 'vendor', 'highlight.min.css'))
      highlight_js_content = File.read(File.join(__dir__, 'vendor', 'highlight.min.js'))

      # Inline Highlight.js CSS
      highlight_css = <<~HIGHLIGHT_CSS
        <style>
        #{highlight_css_content}
        </style>
      HIGHLIGHT_CSS

      # Inline Highlight.js JS
      highlight_js = <<~HIGHLIGHT_JS
        <script>
        #{highlight_js_content}
        hljs.highlightAll();
        </script>
      HIGHLIGHT_JS

      # Script to manage TOC visibility
      script_tag = <<~SCRIPT
        <script>
        (function() {
          const html = document.documentElement;
          const isPinned = localStorage.getItem('tocPinned') === 'true';

          html.classList.add('toc-hidden');
          if (isPinned) {
            html.classList.add('toc-pinned');
            html.classList.add('toc-visible');
            html.classList.remove('toc-hidden');
          }

          document.addEventListener("DOMContentLoaded", () => {
            const tocButton = document.getElementById("toggle-toc");
            const toc = document.getElementById("toc");

            if (!tocButton || !toc) return;

            let isPinned = localStorage.getItem('tocPinned') === 'true';

            function updateTocVisibility(visible) {
              html.classList.toggle("toc-visible", visible);
              html.classList.toggle("toc-hidden", !visible);
              tocButton.setAttribute("aria-expanded", visible);
              tocButton.textContent = visible ? "×" : "☰";
              tocButton.setAttribute("title", visible ? "Hide Table of Contents" : "Show Table of Contents");
            }

            tocButton.addEventListener("click", () => {
              isPinned = !isPinned;
              localStorage.setItem('tocPinned', isPinned);
              html.classList.toggle('toc-pinned', isPinned);
              updateTocVisibility(isPinned);
            });

            tocButton.addEventListener("mouseenter", () => {
              if (!isPinned) {
                updateTocVisibility(true);
              }
            });

            toc.addEventListener("mouseleave", () => {
              if (!isPinned) {
                updateTocVisibility(false);
              }
            });

            updateTocVisibility(isPinned);
          });
        })();
        </script>
      SCRIPT

      # Insert Highlight.js CSS into the <head> section
      output = output.sub('</head>', "#{highlight_css}\n</head>")

      # Insert Highlight.js JS and script tags before closing body tag
      output = output.sub('</body>', "#{highlight_js}\n#{script_tag}</body>")

      output
    end
  end
end

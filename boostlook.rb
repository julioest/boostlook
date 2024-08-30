Asciidoctor::Extensions.register do
  postprocessor do
    process do |doc, output|
      output = output.sub(/<body(.*?)>/, '<body\\1><div class="boostlook">')
      output = output.sub(/<\/body>/, "</div></body>")

      output = output.sub(/(<div id="toc".*?>)/, '<button id="toggle-toc" aria-expanded="true" aria-controls="toc">Toggle TOC</button>\\1')
      output = output.sub(/(<\/div>)\s*(<div id="footer")/, '\\1</div>\\2')

      script = <<~SCRIPT
        <script>
        document.addEventListener('DOMContentLoaded', (event) => {
          const tocButton = document.getElementById('toggle-toc');
          const toc = document.getElementById('toc');
          const boostlook = document.querySelector('.boostlook');
          
          if (tocButton && toc && boostlook) {
            const tocVisible = localStorage.getItem('tocVisible') !== 'false';
            updateTocVisibility(tocVisible);
            
            tocButton.addEventListener('click', () => {
              const newState = toc.style.display === 'none';
              updateTocVisibility(newState);
              localStorage.setItem('tocVisible', newState);
            });
          }
          
          function updateTocVisibility(visible) {
            toc.style.display = visible ? 'block' : 'none';
            tocButton.setAttribute('aria-expanded', visible);
            tocButton.textContent = visible ? 'Hide TOC' : 'Show TOC';
            boostlook.classList.toggle('toc-hidden', !visible);
          }
        });
        </script>
      SCRIPT

      output = output.sub(/<\/body>/, "#{script}</body>")

      output
    end
  end
end
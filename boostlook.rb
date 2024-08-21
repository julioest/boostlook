Asciidoctor::Extensions.register do
  postprocessor do
    process do |doc, output|
      output = output.sub(/<body (.*?)>/, '<body \\1><div class="boostlook">')
      output = output.sub(/<\/body>/, "</div></body>")
      #output = output.sub(/<\/body>/, "</body>")
    end
  end
end

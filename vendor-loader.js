/* Asistencia documental ligera y autocontenida para la V 2.0.
   La app no depende de servicios externos para funcionar. */
(function () {
  const decoder = new TextDecoder('latin1');

  function cleanLoosePdfText(raw) {
    return raw
      .replace(/\\r|\\n/g, ' ')
      .replace(/[\x00-\x08\x0E-\x1F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function extractTextFromFile(file) {
    if (!file) return '';
    if (file.type && file.type.startsWith('text/')) return file.text();
    if (file.name && file.name.toLowerCase().endsWith('.txt')) return file.text();
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) {
      try {
        const buffer = await file.arrayBuffer();
        const raw = decoder.decode(buffer);
        const parenthesized = [...raw.matchAll(/\(([^()]{4,220})\)/g)].map((m) => m[1]);
        const fragments = parenthesized.length ? parenthesized.join(' ') : raw;
        return cleanLoosePdfText(fragments);
      } catch (_error) {
        return '';
      }
    }
    return '';
  }

  async function extractTextFromFiles(files) {
    const chunks = [];
    for (const file of files || []) {
      const text = await extractTextFromFile(file);
      if (text) chunks.push(text);
    }
    return chunks.join('\n');
  }

  window.DocumentAssist = {
    extractTextFromFiles,
    supportsImageOcr: false,
    supportsPdfBestEffort: true
  };
})();

(() => {
  const isPostcode = input => input instanceof HTMLInputElement
    && input.type === 'text' && !input.readOnly && !input.disabled
    && /postcode|postal.?code/i.test([input.name, input.id, input.autocomplete].join(' '));
  function format(event) {
    const input = event.target;
    if (event.isComposing || !isPostcode(input)) return;
    input.autocapitalize = 'characters';
    let value = input.value.toUpperCase();
    if (event.type !== 'input') {
      value = value.trim();
      const compact = value.replace(/\s/g, '');
      if (/^(?:[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}|GIR0AA)$/.test(compact)) {
        value = compact.slice(0, -3) + ' ' + compact.slice(-3);
      }
    }
    if (value !== input.value) {
      const start = input.selectionStart, end = input.selectionEnd;
      input.value = value;
      if (event.type === 'input' && start !== null && end !== null) input.setSelectionRange(start, end);
    }
  }
  document.addEventListener('input', format, true);
  document.addEventListener('compositionend', format, true);
  document.addEventListener('blur', format, true);
  document.addEventListener('focusin', event => {
    if (isPostcode(event.target)) event.target.autocapitalize = 'characters';
  });
})();

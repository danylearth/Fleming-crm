(() => {
  const capitalise = value => value.replace(/(^|[\s'’\-])(\p{L})/gu, (_, separator, letter) => separator + letter.toLocaleUpperCase('en-GB'));
  const eligible = input => {
    if (!(input instanceof HTMLInputElement) || input.type !== 'text' || input.readOnly || input.disabled) return false;
    const description = [input.id, input.name, input.autocomplete, ...Array.from(input.labels || [], label => label.textContent), input.closest('.input-group')?.querySelector('label')?.textContent].join(' ');
    if (/email|phone|postcode|postal.?code|password|reference|account.?number|sort.?code|company.?number|insurance|\bdob\b|date|share.?code|url|website/i.test(description) || ['numeric', 'decimal'].includes(input.inputMode)) return false;
    return /name|address|city|town|employer|department|job.?title|occupation/i.test(description);
  };
  function format(event) {
    const input=event.target;if(event.isComposing || !eligible(input)) return;
    input.autocapitalize='words';const value=capitalise(input.value);
    if(value!==input.value){const start=input.selectionStart,end=input.selectionEnd;input.value=value;if(start!==null&&end!==null)input.setSelectionRange(start,end);}
  }
  document.addEventListener('input',format,true);
  document.addEventListener('compositionend',format,true);
  document.addEventListener('focusin',event=>{if(eligible(event.target))event.target.autocapitalize='words';});
})();

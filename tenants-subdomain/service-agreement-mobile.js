// The mobile steps reuse the desktop form, signature editor and signing request.
export function mobileSigning(form) {
  const $ = id => document.getElementById(id);
  const media = matchMedia('(max-width:820px)');
  const submit = $('submit'), footer = $('mobile-signing-footer');
  const anchor = document.createComment('Desktop signing button');
  submit.before(anchor);
  const fields = ['account_name', 'bank_name', 'sort_code', 'account_number'];
  const labels = ['Account Name', 'Bank Name', 'Sort Code', 'Account Number'];
  let step = 1, furthest = 1, loaded = false, editing = false;
  const validBank = () => fields.every(key => form.elements[key].checkValidity());
  function summary() {
    $('mobile-bank-summary').replaceChildren(...fields.map((key, i) => {
      const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = labels[i]; dd.textContent = form.elements[key].value || 'Not Entered';
      row.append(dt, dd); return row;
    }));
  }
  function draw() {
    document.body.classList.toggle('mobile-signing', media.matches && loaded);
    document.body.dataset.signingStep = String(step);
    document.body.classList.toggle('editing-bank', editing);
    for (const node of document.querySelectorAll('.mobile-signing-heading,.mobile-review-actions')) node.hidden = !media.matches || !loaded;
    footer.hidden = !media.matches || !loaded;
    if (media.matches && loaded) {
      submit.setAttribute('form', 'form'); footer.append(submit);
      submit.hidden = step !== 3;
    } else {
      anchor.after(submit); submit.hidden = false;
    }
    $('mobile-step-count').textContent = `Step ${step} of 3`;
    $('mobile-back').hidden = step === 1;
    $('mobile-next').hidden = step === 3;
    for (const button of document.querySelectorAll('button[data-signing-step]')) {
      const n = Number(button.dataset.signingStep);
      button.disabled = n > furthest;
      button.setAttribute('aria-current', n === step ? 'step' : 'false');
      button.classList.toggle('complete', n < step);
    }
  }
  function show(n) {
    if (n === 3 && (editing || !validBank() || !form.elements.bank_approved.checked)) n = 2;
    step = n; furthest = Math.max(furthest, n); draw();
    window.scrollTo({top: 0, behavior: 'instant'});
    $('mobile-step-count').setAttribute('tabindex', '-1');
    $('mobile-step-count').focus({preventScroll: true});
  }
  function confirmBank() {
    if (editing || !validBank()) {
      editing = true; draw();
      const invalid = fields.map(key => form.elements[key]).find(input => !input.checkValidity());
      if (invalid) invalid.reportValidity();
      else $('mobile-save-bank').focus();
      return false;
    }
    if (!form.elements.bank_approved.checked) {form.elements.bank_approved.reportValidity(); return false;}
    return true;
  }
  $('mobile-next').onclick = () => {if (step === 2 && !confirmBank()) return; show(step + 1);};
  $('mobile-back').onclick = () => show(Math.max(1, step - 1));
  for (const button of document.querySelectorAll('button[data-signing-step]')) button.onclick = () => show(Number(button.dataset.signingStep));
  $('mobile-edit-bank').onclick = () => {
    editing = true; furthest = 2; form.elements.bank_approved.checked = false;
    form.elements.bank_approved.dispatchEvent(new Event('input', {bubbles: true}));
    draw(); form.elements.account_name.focus();
  };
  $('mobile-save-bank').onclick = () => {
    const invalid = fields.map(key => form.elements[key]).find(input => !input.checkValidity());
    if (invalid) {invalid.reportValidity(); return;}
    editing = false; summary(); draw(); form.elements.bank_approved.focus();
  };
  form.addEventListener('keydown', event => {
    if (media.matches && loaded && step !== 3 && event.key === 'Enter' && event.target.tagName === 'INPUT') {
      event.preventDefault(); if (editing) $('mobile-save-bank').click(); else $('mobile-next').click();
    }
  });
  media.addEventListener('change', draw);
  return {
    ready() {loaded = true; editing = !validBank(); summary(); draw();},
    validate() {
      if (!media.matches) return true;
      if (step !== 3 || editing || !validBank() || !form.elements.bank_approved.checked) {show(2); confirmBank(); return false;}
      return true;
    },
  };
}

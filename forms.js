const forms = document.querySelectorAll('.page-form, #lead-form');

forms.forEach((form) => {
  const submitButton = form.querySelector('button[type="submit"]');
  const status = document.createElement('p');
  status.className = 'form-status';
  status.setAttribute('role', 'status');
  form.append(status);

  const isAudit = window.location.pathname.includes('free-audit');
  // GitHub Pages has no runtime environment-variable injection. The optional
  // global remains available for deployments that provide one at page load.
  const apiBaseUrl = window.__PROBKEY_API_BASE_URL || 'https://business-production-bc76.up.railway.app';
  const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/api/leads`;
  const requiredFields = ['name', 'business', 'email', 'message', ...(isAudit ? ['website'] : [])];
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const setStatus = (message, type) => {
    status.textContent = message;
    status.dataset.type = type;
  };

  const validate = (data) => {
    for (const field of requiredFields) {
      if (!String(data.get(field) || '').trim()) return `Please enter your ${field === 'message' ? 'message' : field}.`;
    }
    if (!emailPattern.test(String(data.get('email')).trim())) return 'Please enter a valid email address.';
    for (const field of ['website', ...(isAudit ? ['social'] : [])]) {
      const value = String(data.get(field) || '').trim();
      if (value && !/^https?:\/\/[^\s]+$/i.test(value)) return `Please enter a valid ${field === 'social' ? 'social profile' : 'website'} URL starting with https://.`;
    }
    return '';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.submitting === 'true') return;
    const data = new FormData(form);
    const error = validate(data);
    if (error) { setStatus(error, 'error'); return; }

    form.dataset.submitting = 'true';
    submitButton.disabled = true;
    submitButton.dataset.originalText = submitButton.textContent;
    submitButton.textContent = 'Sending...';
    setStatus('', '');

    const payload = Object.fromEntries(data.entries());
    payload.source = isAudit ? 'free_audit' : 'contact';
    payload.captcha_token = window.__PROBKEY_CAPTCHA_TOKEN || '';
    payload.website = String(payload.website || '').trim();
    payload.social_profile = String(payload.social || '').trim();
    delete payload.social;

    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Something went wrong. Please try again or contact us directly.');
      form.innerHTML = `<div class="form-success"><h2>${isAudit ? 'Your audit request has been received.' : "Thanks for reaching out. We'll be in touch soon."}</h2><p>${isAudit ? "We'll review your digital presence and contact you with the next steps." : 'Your message is safely with our team.'}</p><a class="button button-primary" href="../">Back to Home <span>↗</span></a></div>`;
    } catch (requestError) {
      setStatus(requestError.message, 'error');
      form.dataset.submitting = 'false';
      submitButton.disabled = false;
      submitButton.textContent = submitButton.dataset.originalText;
    }
  });
});

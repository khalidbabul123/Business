const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');

menuToggle?.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.main-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    mainNav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  });
});

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

const leadForm = document.querySelector('#lead-form');
const formStatus = document.querySelector('.form-status');
leadForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(leadForm);
  const inquiry = [
    `Name: ${formData.get('name')}`,
    `Email: ${formData.get('email')}`,
    `Phone: ${formData.get('phone') || 'Not provided'}`,
    `Business type: ${formData.get('business') || 'Not provided'}`,
    `Goals: ${formData.get('message')}`
  ].join('\n');
  window.open(`https://wa.me/923000000000?text=${encodeURIComponent(`Hi ProbKey, I would like to discuss my business growth.\n\n${inquiry}`)}`, '_blank', 'noopener');
  formStatus.textContent = 'Thanks. We will be in touch within 24 hours.';
  leadForm.reset();
});

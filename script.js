const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');

const routeMain = document.querySelector('.page-main');
if (routeMain && !document.querySelector('.site-header')) {
  const routeHeader = document.createElement('header');
  routeHeader.className = 'route-header';
  routeHeader.innerHTML = '<a class="brand" href="../../"><span class="brand-name">ProbKey<small>Business Solutions</small></span></a><a class="button button-ghost" href="../../contact/">Book a free strategy call <span>↗</span></a>';
  document.body.prepend(routeHeader);
  const routeFooter = document.createElement('footer');
  routeFooter.className = 'simple-footer';
  routeFooter.innerHTML = '© 2026 ProbKey Business Solutions · <a href="../../">probkey.com</a>';
  document.body.append(routeFooter);
}

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


document.querySelectorAll('.mega-menu').forEach((menu) => {
    menu.addEventListener('mouseenter', () => {
      menu.setAttribute('open', true);
    });
  
    menu.addEventListener('mouseleave', () => {
      menu.removeAttribute('open');
    });
  });
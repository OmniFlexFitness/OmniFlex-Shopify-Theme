function hideProductModal() {
  const productModal = document.querySelectorAll('product-modal[open]');
  productModal && productModal.forEach((modal) => modal.hide());
}

document.addEventListener('shopify:block:select', function (event) {
  hideProductModal();
  const blockSelectedIsSlide = event.target.classList.contains('slideshow__slide');
  if (!blockSelectedIsSlide) return;

  const parentSlideshowComponent = event.target.closest('slideshow-component');
  parentSlideshowComponent.pause();

  setTimeout(function () {
    parentSlideshowComponent.slider.scrollTo({
      left: event.target.offsetLeft,
    });
  }, 200);
});

document.addEventListener('shopify:block:deselect', function (event) {
  const blockDeselectedIsSlide = event.target.classList.contains('slideshow__slide');
  if (!blockDeselectedIsSlide) return;
  const parentSlideshowComponent = event.target.closest('slideshow-component');
  if (parentSlideshowComponent.autoplayButtonIsSetToPlay) parentSlideshowComponent.play();
});

document.addEventListener('shopify:section:load', () => {
  hideProductModal();
  const zoomOnHoverScript = document.querySelector('[id^=EnableZoomOnHover]');
  if (!zoomOnHoverScript) return;
  if (zoomOnHoverScript) {
    const newScriptTag = document.createElement('script');
    newScriptTag.src = zoomOnHoverScript.src;
    zoomOnHoverScript.parentNode.replaceChild(newScriptTag, zoomOnHoverScript);
  }
});

document.addEventListener('shopify:section:unload', (event) => {
  document.querySelectorAll(`[data-section="${event.detail.sectionId}"]`).forEach((element) => {
    element.remove();
    document.body.classList.remove('overflow-hidden');
  });
});

document.addEventListener('shopify:section:reorder', () => hideProductModal());

document.addEventListener('shopify:section:select', () => hideProductModal());

document.addEventListener('shopify:section:deselect', () => hideProductModal());

document.addEventListener('shopify:inspector:activate', () => hideProductModal());

document.addEventListener('shopify:inspector:deactivate', () => hideProductModal());

document.addEventListener('DOMContentLoaded', function () {
  const slider = document.querySelector('#Slider-{{ section.id }}');
  const slides = slider.querySelectorAll('.slideshow__slide');
  const totalSlides = slides.length;

  // Clone first and last slides for infinite scrolling
  const firstSlide = slides[0].cloneNode(true);
  const lastSlide = slides[totalSlides - 1].cloneNode(true);

  // Append and prepend cloned slides
  slider.appendChild(firstSlide);
  slider.insertBefore(lastSlide, slides[0]);

  let currentIndex = 1; // Start at the first real slide
  const slideWidth = slides[0].offsetWidth;

  // Set initial position
  slider.style.transform = `translateX(-${slideWidth}px)`;

  // Add event listeners for navigation buttons
  const prevButton = document.querySelector('.slider-button--prev');
  const nextButton = document.querySelector('.slider-button--next');

  prevButton.addEventListener('click', () => {
    moveSlide(-1);
  });

  nextButton.addEventListener('click', () => {
    moveSlide(1);
  });

  function moveSlide(direction) {
    currentIndex += direction;
    slider.style.transition = 'transform 0.5s ease-in-out';
    slider.style.transform = `translateX(-${currentIndex * slideWidth}px)`;

    // Handle infinite loop
    slider.addEventListener('transitionend', () => {
      if (currentIndex === 0) {
        slider.style.transition = 'none';
        currentIndex = totalSlides;
        slider.style.transform = `translateX(-${currentIndex * slideWidth}px)`;
      } else if (currentIndex === totalSlides + 1) {
        slider.style.transition = 'none';
        currentIndex = 1;
        slider.style.transform = `translateX(-${currentIndex * slideWidth}px)`;
      }
    });
  }
});

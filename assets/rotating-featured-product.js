class RotatingFeaturedProduct extends HTMLElement {
  constructor() {
    super();
    this.currentFrame = 0;
    this.images = [];
    this.imageCount = 0;
    this.mode = 'drag';
    this.isDragging = false;
    this.startX = 0;
    this.startFrame = 0;
    this.autoRotating = false;
    this.autoRotatePaused = false;
    this.autoRotateRafId = null;
    this.lastAutoRotateTime = 0;
    this.scrollRafId = null;
  }

  connectedCallback() {
    this.parseData();
    if (this.imageCount < 2) return;

    this.frameImage = this.querySelector('.rotating-product__frame');
    this.frameContainer = this.querySelector('.rotating-product__frame-container');
    this.counterEl = this.querySelector('.rotating-product__current-frame');
    this.dragHint = this.querySelector('.rotating-product__drag-hint');

    if (!this.frameImage || !this.frameContainer) return;

    this.preloadImages();

    if (this.mode === 'scroll') {
      this.setupScrollMode();
    } else {
      this.setupDragMode();
    }

    if (this.autoRotateEnabled) {
      this.startAutoRotate();
    }
  }

  disconnectedCallback() {
    if (this._onScroll) {
      window.removeEventListener('scroll', this._onScroll);
    }
    if (this._onPointerMove) {
      window.removeEventListener('pointermove', this._onPointerMove);
      window.removeEventListener('pointerup', this._onPointerUp);
    }
    if (this.autoRotateRafId) {
      cancelAnimationFrame(this.autoRotateRafId);
    }
    if (this.scrollRafId) {
      cancelAnimationFrame(this.scrollRafId);
    }
  }

  parseData() {
    const dataEl = this.querySelector('.rotating-product__data');
    if (!dataEl) return;

    try {
      const data = JSON.parse(dataEl.textContent);
      this.images = data.images || [];
      this.imageCount = data.imageCount || 0;
      this.mode = data.mode || 'drag';
      this.autoRotateEnabled = data.autoRotate || false;
      this.autoRotateSpeed = data.autoRotateSpeed || 3;
      this.autoRotateInterval = 1000 / this.autoRotateSpeed;
    } catch (e) {
      // Silent fail — section renders as static image
    }
  }

  preloadImages() {
    this.preloadedImages = this.images.map((imgData) => {
      const img = new Image();
      img.src = imgData.src;
      return img;
    });
  }

  // ---- Scroll mode ----

  setupScrollMode() {
    this.scrollContainer = this.querySelector('.rotating-product__scroll-container');
    if (!this.scrollContainer) return;

    this._onScroll = () => {
      if (this.scrollRafId) return;
      this.scrollRafId = requestAnimationFrame(() => {
        this.scrollRafId = null;
        this.onScroll();
      });
    };

    window.addEventListener('scroll', this._onScroll, { passive: true });
    // Draw initial frame based on current scroll position
    this.onScroll();
  }

  onScroll() {
    if (!this.scrollContainer) return;

    const containerTop = this.scrollContainer.getBoundingClientRect().top;
    const viewportHeight = window.innerHeight;
    const scrollableDistance = this.scrollContainer.offsetHeight - viewportHeight;

    if (scrollableDistance <= 0) return;

    const scrolled = -containerTop;
    const fraction = Math.max(0, Math.min(1, scrolled / scrollableDistance));
    const frameIndex = Math.min(
      Math.floor(fraction * this.imageCount),
      this.imageCount - 1
    );

    this.setFrameIndex(frameIndex);

    // Pause auto-rotate once user scrolls into the section
    if (fraction > 0 && fraction < 1 && this.autoRotating && !this.autoRotatePaused) {
      this.stopAutoRotate();
    }
  }

  // ---- Drag mode ----

  setupDragMode() {
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);

    this.frameContainer.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);

    // Prevent default drag behavior on images
    this.frameContainer.addEventListener('dragstart', (e) => e.preventDefault());
  }

  onPointerDown(e) {
    // Only respond to primary button (left click / single touch)
    if (e.button !== 0) return;

    this.isDragging = true;
    this.startX = e.clientX;
    this.startFrame = this.currentFrame;

    this.frameContainer.classList.add('is-dragging');
    this.frameContainer.setPointerCapture(e.pointerId);

    // Hide drag hint on first interaction
    if (this.dragHint && !this.dragHint.classList.contains('rotating-product__drag-hint--hidden')) {
      this.dragHint.classList.add('rotating-product__drag-hint--hidden');
    }

    // Pause auto-rotate on interaction
    if (this.autoRotating && !this.autoRotatePaused) {
      this.stopAutoRotate();
    }

    e.preventDefault();
  }

  onPointerMove(e) {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.startX;
    const containerWidth = this.frameContainer.offsetWidth;
    const pixelsPerFrame = Math.max(20, containerWidth / this.imageCount);
    const frameDelta = Math.round(deltaX / pixelsPerFrame);

    // Proper modulo for negative values
    const newFrame = ((this.startFrame + frameDelta) % this.imageCount + this.imageCount) % this.imageCount;
    this.setFrameIndex(newFrame);
  }

  onPointerUp(e) {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.frameContainer.classList.remove('is-dragging');
    this.frameContainer.releasePointerCapture(e.pointerId);
  }

  // ---- Frame display ----

  setFrameIndex(index) {
    if (index === this.currentFrame) return;
    if (index < 0 || index >= this.imageCount) return;

    const imageData = this.images[index];
    if (!imageData) return;

    this.frameImage.src = imageData.src;
    if (imageData.srcset) {
      this.frameImage.srcset = imageData.srcset;
    }
    this.frameImage.alt = imageData.alt;
    this.currentFrame = index;

    if (this.counterEl) {
      this.counterEl.textContent = index + 1;
    }
  }

  // ---- Auto-rotate ----

  startAutoRotate() {
    if (this.imageCount < 2) return;
    this.autoRotating = true;
    this.autoRotatePaused = false;
    this.lastAutoRotateTime = 0;
    this.autoRotateRafId = requestAnimationFrame(this.autoRotateTick.bind(this));
  }

  stopAutoRotate() {
    this.autoRotatePaused = true;
    this.autoRotating = false;
    if (this.autoRotateRafId) {
      cancelAnimationFrame(this.autoRotateRafId);
      this.autoRotateRafId = null;
    }
  }

  autoRotateTick(timestamp) {
    if (!this.autoRotating) return;

    if (this.lastAutoRotateTime === 0) {
      this.lastAutoRotateTime = timestamp;
    }

    const elapsed = timestamp - this.lastAutoRotateTime;

    if (elapsed >= this.autoRotateInterval) {
      this.lastAutoRotateTime = timestamp;
      const nextFrame = (this.currentFrame + 1) % this.imageCount;
      this.setFrameIndex(nextFrame);
    }

    this.autoRotateRafId = requestAnimationFrame(this.autoRotateTick.bind(this));
  }
}

if (!customElements.get('rotating-featured-product')) {
  customElements.define('rotating-featured-product', RotatingFeaturedProduct);
}

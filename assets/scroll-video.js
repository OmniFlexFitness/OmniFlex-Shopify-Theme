class ScrollVideoComponent extends HTMLElement {
  constructor() {
    super();
    this.canvas = null;
    this.ctx = null;
    this.video = null;
    this.loadingOverlay = null;
    this.loadingProgress = null;
    this.loadingText = null;
    this.isReady = false;
    this.animationFrameId = null;
    this.lastDrawnTime = -1;

    // Configuration from data attributes
    this.zoomFactor = (parseFloat(this.dataset.zoom) || 115) / 100;
    this.parallaxEnabled = this.dataset.parallax !== 'false';
    this.parallaxAmount = 20; // Max px shift
  }

  connectedCallback() {
    this.canvas = this.querySelector('.scroll-video__canvas');
    this.video = this.querySelector('.scroll-video__source');
    this.loadingOverlay = this.querySelector('.scroll-video__loading');
    this.loadingProgress = this.querySelector('.scroll-video__loading-progress');
    this.loadingText = this.querySelector('.scroll-video__loading-text');

    if (!this.canvas || !this.video) return;

    this.ctx = this.canvas.getContext('2d');

    // Bind event handlers
    this._onScroll = this.onScroll.bind(this);
    this._onResize = this.onResize.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);

    // Set up video loading
    this.setupVideoLoading();

    // Listen for resize
    window.addEventListener('resize', this._onResize);
  }

  disconnectedCallback() {
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('mousemove', this._onMouseMove);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  setupVideoLoading() {
    const video = this.video;

    // Track loading progress via buffered ranges
    const progressInterval = setInterval(() => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const percent = Math.min(Math.round((bufferedEnd / video.duration) * 100), 100);
        this.updateLoadingProgress(percent);

        if (percent >= 99) {
          clearInterval(progressInterval);
        }
      }
    }, 100);

    // When metadata is loaded, we know duration and can size canvas
    video.addEventListener('loadedmetadata', () => {
      this.initCanvas();
    });

    // When enough data is available to draw first frame
    video.addEventListener('loadeddata', () => {
      this.drawFrame();
      this.updateLoadingProgress(50);
    });

    // When video can play through without buffering
    video.addEventListener('canplaythrough', () => {
      clearInterval(progressInterval);
      this.onVideoReady();
    });

    // Fallback: if canplaythrough doesn't fire, start after loadeddata
    video.addEventListener('loadeddata', () => {
      setTimeout(() => {
        if (!this.isReady) {
          this.onVideoReady();
        }
      }, 2000);
    });

    // Error handling
    video.addEventListener('error', () => {
      clearInterval(progressInterval);
      this.hideLoading();
    });

    // Ensure video starts loading
    video.load();
  }

  updateLoadingProgress(percent) {
    if (this.loadingProgress) {
      this.loadingProgress.style.width = percent + '%';
    }
    if (this.loadingText) {
      this.loadingText.textContent = 'Loading... ' + percent + '%';
    }
  }

  onVideoReady() {
    if (this.isReady) return;
    this.isReady = true;

    this.updateLoadingProgress(100);
    this.initCanvas();
    this.drawFrame();

    // Small delay for the 100% to show before hiding
    setTimeout(() => {
      this.hideLoading();
    }, 300);

    // Start listening for scroll
    window.addEventListener('scroll', this._onScroll, { passive: true });

    // Start listening for mouse parallax
    if (this.parallaxEnabled && typeof gsap !== 'undefined') {
      window.addEventListener('mousemove', this._onMouseMove, { passive: true });
      // Apply initial scale for parallax edge hiding
      this.canvas.style.transform = 'scale(' + this.zoomFactor + ')';
    }
  }

  hideLoading() {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.add('scroll-video__loading--hidden');
    }
  }

  initCanvas() {
    if (!this.canvas) return;
    const sticky = this.querySelector('.scroll-video__sticky');
    if (!sticky) return;

    // Set canvas resolution to match display size for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = sticky.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);

    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;
  }

  onScroll() {
    if (this.animationFrameId) return;
    this.animationFrameId = requestAnimationFrame(() => {
      this.animationFrameId = null;
      this.updateVideoTime();
      this.drawFrame();
    });
  }

  updateVideoTime() {
    if (!this.video || !this.video.duration) return;

    const scrollContainer = this.querySelector('.scroll-video__scroll-container');
    if (!scrollContainer) return;

    const rect = scrollContainer.getBoundingClientRect();
    const containerTop = rect.top;
    const containerHeight = rect.height;
    const viewportHeight = window.innerHeight;

    // Calculate scroll fraction: 0 when container top is at viewport bottom,
    // 1 when container bottom is at viewport top
    const scrollableDistance = containerHeight - viewportHeight;
    if (scrollableDistance <= 0) return;

    // How far into the container we've scrolled
    const scrolled = -containerTop;
    const scrollFraction = Math.max(0, Math.min(1, scrolled / scrollableDistance));

    // Map scroll fraction to video time
    const targetTime = scrollFraction * this.video.duration;

    // Only seek if time has changed meaningfully (avoid redundant seeks)
    if (Math.abs(targetTime - this.lastDrawnTime) > 0.03) {
      this.video.currentTime = targetTime;
      this.lastDrawnTime = targetTime;
    }
  }

  drawFrame() {
    if (!this.ctx || !this.video || !this.video.videoWidth) return;

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const cw = this.canvasWidth;
    const ch = this.canvasHeight;

    if (!cw || !ch) return;

    // Clear canvas
    this.ctx.clearRect(0, 0, cw, ch);

    // Calculate object-fit: cover dimensions with zoom
    const videoAspect = vw / vh;
    const canvasAspect = cw / ch;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (videoAspect > canvasAspect) {
      // Video is wider than canvas - fit by height
      drawHeight = ch;
      drawWidth = ch * videoAspect;
    } else {
      // Video is taller than canvas - fit by width
      drawWidth = cw;
      drawHeight = cw / videoAspect;
    }

    // Center the frame
    offsetX = (cw - drawWidth) / 2;
    offsetY = (ch - drawHeight) / 2;

    this.ctx.drawImage(this.video, offsetX, offsetY, drawWidth, drawHeight);
  }

  onMouseMove(event) {
    if (!this.parallaxEnabled || typeof gsap === 'undefined') return;

    // Calculate normalized mouse position (-1 to 1) from center
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const normalizedX = (event.clientX - centerX) / centerX;
    const normalizedY = (event.clientY - centerY) / centerY;

    // Move canvas in opposite direction of mouse for depth illusion
    const moveX = -normalizedX * this.parallaxAmount;
    const moveY = -normalizedY * this.parallaxAmount;

    gsap.to(this.canvas, {
      x: moveX,
      y: moveY,
      duration: 0.6,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }

  onResize() {
    this.initCanvas();
    if (this.isReady) {
      this.drawFrame();
    }
  }
}

customElements.define('scroll-video-component', ScrollVideoComponent);

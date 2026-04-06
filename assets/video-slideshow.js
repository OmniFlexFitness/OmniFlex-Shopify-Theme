class VideoSlideshowComponent extends SlideshowComponent {
  constructor() {
    super();
    this.addEventListener('slideChanged', this.onSlideChanged.bind(this));
    // Initialize: only play the first slide's video
    if (this.slider) {
      this.initVideoPlayback();
    }
  }

  initVideoPlayback() {
    // Small delay to ensure DOM is ready and videos are parsed
    requestAnimationFrame(() => {
      this.pauseAllSlideVideos();
      this.playActiveSlideVideo();
    });
  }

  onSlideChanged() {
    this.pauseAllSlideVideos();
    this.playActiveSlideVideo();
  }

  pauseAllSlideVideos() {
    // Pause all native videos
    this.querySelectorAll('.slideshow__slide video').forEach((video) => {
      video.pause();
    });

    // Pause YouTube iframes
    this.querySelectorAll('.slideshow__slide iframe.js-youtube').forEach((iframe) => {
      try {
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }),
          '*'
        );
      } catch (e) {
        // Cross-origin errors are expected if iframe hasn't loaded
      }
    });

    // Pause Vimeo iframes
    this.querySelectorAll('.slideshow__slide iframe.js-vimeo').forEach((iframe) => {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ method: 'pause' }), '*');
      } catch (e) {
        // Cross-origin errors are expected if iframe hasn't loaded
      }
    });
  }

  playActiveSlideVideo() {
    if (!this.sliderItemsToShow || !this.sliderItemsToShow.length) return;

    const activeSlide = this.sliderItemsToShow[this.currentPage - 1];
    if (!activeSlide) return;

    // Play native video
    const video = activeSlide.querySelector('video');
    if (video) {
      video.play().catch(() => {
        // Autoplay may be blocked by browser policy; this is expected
      });
      return;
    }

    // Play YouTube iframe (if loaded via deferred-media)
    const ytIframe = activeSlide.querySelector('iframe.js-youtube');
    if (ytIframe) {
      try {
        ytIframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: '' }),
          '*'
        );
      } catch (e) {
        // Cross-origin errors are expected
      }
      return;
    }

    // Play Vimeo iframe (if loaded via deferred-media)
    const vimeoIframe = activeSlide.querySelector('iframe.js-vimeo');
    if (vimeoIframe) {
      try {
        vimeoIframe.contentWindow.postMessage(JSON.stringify({ method: 'play' }), '*');
      } catch (e) {
        // Cross-origin errors are expected
      }
    }
  }
}

if (!customElements.get('video-slideshow-component')) {
  customElements.define('video-slideshow-component', VideoSlideshowComponent);
}

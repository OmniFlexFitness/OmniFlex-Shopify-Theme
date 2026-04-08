if (!customElements.get('video-banner-component')) {
  class VideoBannerComponent extends HTMLElement {
    constructor() {
      super();
      this.paused = false;
      this.offscreen = false;
      this.playPauseButton = this.querySelector('.video-banner__play-pause');
      this.pauseIcon = this.querySelector('.video-banner__pause-icon');
      this.playIcon = this.querySelector('.video-banner__play-icon');

      if (this.playPauseButton) {
        this.playPauseButton.addEventListener('click', this.togglePlayback.bind(this));
      }

      if (this.dataset.pauseOffscreen === 'true') {
        this.setupIntersectionObserver();
      }
    }

    connectedCallback() {
      const video = this.querySelector('.banner__media video');
      if (video) {
        const attemptPlay = () => {
          if (!this.paused && !this.offscreen) {
            video.play().catch(() => {});
          }
        };
        if (video.readyState >= 2) {
          attemptPlay();
        } else {
          video.addEventListener('loadeddata', attemptPlay, { once: true });
        }
      }
    }

    setupIntersectionObserver() {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.offscreen = false;
              if (!this.paused) this.playMedia();
            } else {
              this.offscreen = true;
              this.pauseMedia();
            }
          });
        },
        { threshold: 0.25 }
      );
      observer.observe(this);
    }

    togglePlayback() {
      this.paused = !this.paused;
      if (this.paused) {
        this.pauseMedia();
      } else {
        this.playMedia();
      }
      this.updateUI();
    }

    playMedia() {
      const video = this.querySelector('.banner__media video');
      if (video) {
        video.play().catch(() => {});
        return;
      }

      const ytIframe = this.querySelector('.banner__media iframe.js-youtube');
      if (ytIframe) {
        try {
          ytIframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: '' }),
            '*'
          );
        } catch (e) {}
        return;
      }

      const vimeoIframe = this.querySelector('.banner__media iframe.js-vimeo');
      if (vimeoIframe) {
        try {
          vimeoIframe.contentWindow.postMessage(JSON.stringify({ method: 'play' }), '*');
        } catch (e) {}
      }
    }

    pauseMedia() {
      const video = this.querySelector('.banner__media video');
      if (video) {
        video.pause();
        return;
      }

      const ytIframe = this.querySelector('.banner__media iframe.js-youtube');
      if (ytIframe) {
        try {
          ytIframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }),
            '*'
          );
        } catch (e) {}
        return;
      }

      const vimeoIframe = this.querySelector('.banner__media iframe.js-vimeo');
      if (vimeoIframe) {
        try {
          vimeoIframe.contentWindow.postMessage(JSON.stringify({ method: 'pause' }), '*');
        } catch (e) {}
      }
    }

    updateUI() {
      if (!this.playPauseButton) return;
      if (this.paused) {
        this.pauseIcon.hidden = true;
        this.playIcon.hidden = false;
        this.playPauseButton.setAttribute('aria-label', 'Play video');
      } else {
        this.pauseIcon.hidden = false;
        this.playIcon.hidden = true;
        this.playPauseButton.setAttribute('aria-label', 'Pause video');
      }
    }
  }

  customElements.define('video-banner-component', VideoBannerComponent);
}

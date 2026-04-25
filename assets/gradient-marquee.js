class GradientMarquee extends HTMLElement {
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    this.rows = Array.from(this.querySelectorAll('.gradient-marquee__row'));
    if (!this.rows.length) return;

    this.baseSpeed = parseFloat(this.dataset.baseSpeed || '0.4');
    this.scrollFactor = parseFloat(this.dataset.scrollFactor || '6');
    this.skewAmount = parseFloat(this.dataset.skewAmount || '7');

    this.offsets = this.rows.map(() => 0);
    this.lastScroll = window.scrollY;
    this.scrollVelocity = 0;
    this.lastTime = performance.now();

    this._onScroll = this.onScroll.bind(this);
    window.addEventListener('scroll', this._onScroll, { passive: true });

    this.duplicateContent();
    this.animate();
  }

  disconnectedCallback() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('scroll', this._onScroll);
  }

  duplicateContent() {
    this.rows.forEach((row) => {
      const original = row.innerHTML;
      row.innerHTML = original + original + original;
    });
  }

  onScroll() {
    const now = window.scrollY;
    this.scrollVelocity = now - this.lastScroll;
    this.lastScroll = now;
  }

  animate() {
    const loop = (t) => {
      const dt = Math.min(0.05, (t - this.lastTime) / 1000);
      this.lastTime = t;

      this.scrollVelocity *= 0.92;

      this.rows.forEach((row, i) => {
        const dir = row.classList.contains('gradient-marquee__row--reverse') ? -1 : 1;
        const speed = this.baseSpeed * dir + (this.scrollVelocity * this.scrollFactor * dir * 0.01);
        this.offsets[i] -= speed * 60 * dt;

        const totalWidth = row.scrollWidth / 3;
        if (totalWidth > 0) {
          if (this.offsets[i] <= -totalWidth) this.offsets[i] += totalWidth;
          if (this.offsets[i] > 0) this.offsets[i] -= totalWidth;
        }

        const skew = Math.max(-12, Math.min(12, this.scrollVelocity * 0.6)) * dir;
        row.style.transform = `translate3d(${this.offsets[i]}px, 0, 0) skewY(${skew}deg)`;
      });

      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
}

if (!customElements.get('gradient-marquee')) {
  customElements.define('gradient-marquee', GradientMarquee);
}

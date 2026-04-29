class GradientMarquee extends HTMLElement {
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.rows = Array.from(this.querySelectorAll('.gradient-marquee__row'));
    this.canvas = this.querySelector('.gradient-marquee__particles');
    this.tickerEl = this.querySelector('.gradient-marquee__ticker-value');

    this.baseSpeed = parseFloat(this.dataset.baseSpeed || '0.4');
    this.scrollFactor = parseFloat(this.dataset.scrollFactor || '6');

    this.offsets = this.rows.map(() => 0);
    this.lastScroll = window.scrollY;
    this.scrollVelocity = 0;
    this.lastTime = performance.now();
    this.tickerCounter = 0;
    this.tickerLast = performance.now();

    this.pointer = { x: -9999, y: -9999 };
    this.particles = [];

    this.duplicateContent();
    this.bindEvents();

    if (this.canvas && !this.reduced) {
      this.initParticles();
    }

    this.animate();
  }

  disconnectedCallback() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('pointermove', this._onPointerMove);
    this._ro?.disconnect();
  }

  duplicateContent() {
    this.rows.forEach((row) => {
      const original = row.innerHTML;
      row.innerHTML = original + original + original;
    });
  }

  bindEvents() {
    this._onScroll = this.onScroll.bind(this);
    this._onResize = this.onResize.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });

    if (typeof ResizeObserver !== 'undefined' && this.canvas) {
      this._ro = new ResizeObserver(() => this.onResize());
      this._ro.observe(this);
    }
  }

  onScroll() {
    const now = window.scrollY;
    this.scrollVelocity = now - this.lastScroll;
    this.lastScroll = now;
  }

  onResize() {
    if (this.canvas) this.sizeCanvas();
  }

  onPointerMove(e) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = e.clientX - rect.left;
    this.pointer.y = e.clientY - rect.top;
  }

  sizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.dpr = dpr;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
  }

  initParticles() {
    this.ctx = this.canvas.getContext('2d');
    this.sizeCanvas();
    const count = Math.min(180, Math.floor((this.cssWidth * this.cssHeight) / 9000));
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.cssWidth,
        y: Math.random() * this.cssHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 0.6 + Math.random() * 1.6,
        seed: Math.random() * Math.PI * 2,
        hue: Math.random() < 0.5 ? '#0aeaed' : '#fa0dfd',
      });
    }
  }

  drawParticles(time) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const px = this.pointer.x;
    const py = this.pointer.y;
    const interactive = px > 0 && py > 0;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy + Math.sin(time * 0.001 + p.seed) * 0.05;

      if (interactive) {
        const dx = p.x - px;
        const dy = p.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < 22500) {
          const f = (1 - d2 / 22500) * 1.6;
          const d = Math.sqrt(d2) || 1;
          p.x += (dx / d) * f;
          p.y += (dy / d) * f;
        }
      }

      if (p.x < -10) p.x = this.cssWidth + 10;
      if (p.x > this.cssWidth + 10) p.x = -10;
      if (p.y < -10) p.y = this.cssHeight + 10;
      if (p.y > this.cssHeight + 10) p.y = -10;

      ctx.beginPath();
      ctx.fillStyle = p.hue;
      ctx.shadowColor = p.hue;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = 0.8;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < this.particles.length; i++) {
      const a = this.particles[i];
      for (let j = i + 1; j < this.particles.length; j++) {
        const b = this.particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 8100) {
          const alpha = (1 - d2 / 8100) * 0.35;
          ctx.strokeStyle = `rgba(10, 234, 237, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    if (interactive) {
      const grad = ctx.createRadialGradient(px, py, 0, px, py, 120);
      grad.addColorStop(0, 'rgba(10, 234, 237, 0.35)');
      grad.addColorStop(1, 'rgba(10, 234, 237, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(px - 120, py - 120, 240, 240);
    }
  }

  updateRows(t, dt) {
    if (this.reduced) return;
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
  }

  updateTicker(t) {
    if (!this.tickerEl) return;
    if (t - this.tickerLast > 80) {
      this.tickerLast = t;
      this.tickerCounter = (this.tickerCounter + 1) % 1000000;
      this.tickerEl.textContent = String(this.tickerCounter).padStart(6, '0');
    }
  }

  animate() {
    const loop = (t) => {
      const dt = Math.min(0.05, (t - this.lastTime) / 1000);
      this.lastTime = t;

      this.updateRows(t, dt);
      this.updateTicker(t);
      if (this.canvas && !this.reduced) this.drawParticles(t);

      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
}

if (!customElements.get('gradient-marquee')) {
  customElements.define('gradient-marquee', GradientMarquee);
}

import * as THREE from 'three';

class Scroll3dShowcase extends HTMLElement {
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.canvas = this.querySelector('.scroll3d__canvas');
    this.track = this.querySelector('.scroll3d__track');
    if (!this.canvas || !this.track) return;

    const dataNode = this.querySelector('.scroll3d__data');
    this.opts = dataNode ? JSON.parse(dataNode.textContent) : {};
    this.shape = this.opts.shape || 'knot';
    this.colorA = new THREE.Color(this.opts.colorA || '#0aeaed');
    this.colorB = new THREE.Color(this.opts.colorB || '#fa0dfd');
    this.wireframe = !!this.opts.wireframe;

    this.chapters = Array.from(this.querySelectorAll('.scroll3d__chapter'));
    this.dots = Array.from(this.querySelectorAll('.scroll3d__progress-dot'));
    this.tcEl = this.querySelector('.scroll3d__tc');
    this.tcBar = this.querySelector('.scroll3d__timecode-bar');
    this.pctEl = this.querySelector('.scroll3d__progress-pct');
    this.activeChapterEl = this.querySelector('.scroll3d__active-chapter');
    this.progress = 0;
    this.targetProgress = 0;

    this.pointer = new THREE.Vector2(0, 0);
    this.targetPointer = new THREE.Vector2(0, 0);

    this.initScene();
    this.initMesh();
    this.bindEvents();
    this.onScroll();
    this.animate();
  }

  disconnectedCallback() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('pointermove', this._onPointerMove);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
    }
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }

  initScene() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x07041f, 0.04);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 10);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x07041f, 1);

    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(this.colorA, 1.6);
    keyLight.position.set(-4, 4, 6);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(this.colorB, 1.4);
    rimLight.position.set(5, -2, -5);
    this.scene.add(rimLight);

    this.pointLight = new THREE.PointLight(0xffffff, 0.8, 30);
    this.pointLight.position.set(0, 0, 6);
    this.scene.add(this.pointLight);
  }

  buildGeometry() {
    switch (this.shape) {
      case 'icosa':
        return new THREE.IcosahedronGeometry(2.4, this.wireframe ? 1 : 3);
      case 'torus':
        return new THREE.TorusGeometry(2.2, 0.7, 32, 128);
      case 'octa':
        return new THREE.OctahedronGeometry(2.6, this.wireframe ? 1 : 3);
      case 'sphere':
        return new THREE.SphereGeometry(2.4, 64, 64);
      case 'knot':
      default:
        return new THREE.TorusKnotGeometry(1.8, 0.55, 220, 32, 2, 3);
    }
  }

  initMesh() {
    const geo = this.buildGeometry();

    if (this.wireframe) {
      const mat = new THREE.MeshBasicMaterial({
        color: this.colorA,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
        toneMapped: false,
      });
      this.mesh = new THREE.Mesh(geo, mat);
    } else {
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.6,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        iridescence: 0.6,
        iridescenceIOR: 1.4,
        transmission: 0.0,
        envMapIntensity: 1.2,
      });
      this.mesh = new THREE.Mesh(geo, mat);
    }

    this.scene.add(this.mesh);
  }

  bindEvents() {
    this._onScroll = this.onScroll.bind(this);
    this._onResize = this.onResize.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
  }

  onResize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  onPointerMove(e) {
    const rect = this.getBoundingClientRect();
    this.targetPointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    );
  }

  onScroll() {
    const rect = this.track.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    const scrolled = -rect.top;
    this.targetProgress = Math.max(0, Math.min(1, scrolled / Math.max(1, scrollable)));
  }

  updateChapters() {
    if (!this.chapters.length) return;
    const segments = this.chapters.length;
    const idx = Math.min(segments - 1, Math.floor(this.progress * segments));
    this.chapters.forEach((ch, i) => ch.dataset.active = String(i === idx));
    this.dots.forEach((d, i) => d.dataset.active = String(i === idx));

    const pct = Math.round(this.progress * 100);
    if (this.pctEl) this.pctEl.textContent = pct + '%';
    if (this.activeChapterEl) {
      this.activeChapterEl.textContent = String(idx + 1).padStart(2, '0');
    }
    if (this.tcBar) this.tcBar.style.setProperty('--scroll3d-progress', pct + '%');
    if (this.tcEl) {
      const total = 90;
      const seconds = Math.floor(this.progress * total);
      const frames = Math.floor(((this.progress * total) % 1) * 24);
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      const f = String(frames).padStart(2, '0');
      this.tcEl.textContent = `${m}:${s}:${f}`;
    }
  }

  animate() {
    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      this.progress += (this.targetProgress - this.progress) * 0.08;
      this.pointer.lerp(this.targetPointer, 0.06);

      if (this.mesh) {
        this.mesh.rotation.y = this.progress * Math.PI * 4 + this.pointer.x * 0.3;
        this.mesh.rotation.x = this.progress * Math.PI * 2 + this.pointer.y * 0.2;
        const scale = 1 - this.progress * 0.15;
        this.mesh.scale.setScalar(scale);
        this.mesh.position.z = -this.progress * 2;
      }

      if (this.pointLight) {
        this.pointLight.position.x = this.pointer.x * 4;
        this.pointLight.position.y = this.pointer.y * 4;
      }

      this.updateChapters();
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
}

if (!customElements.get('scroll-3d-showcase')) {
  customElements.define('scroll-3d-showcase', Scroll3dShowcase);
}

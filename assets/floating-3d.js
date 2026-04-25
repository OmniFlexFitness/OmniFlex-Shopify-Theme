import * as THREE from 'three';

const SHAPE_BUILDERS = {
  icosa: () => new THREE.IcosahedronGeometry(0.9, 1),
  octa: () => new THREE.OctahedronGeometry(1, 0),
  torus: () => new THREE.TorusGeometry(0.7, 0.22, 16, 64),
  knot: () => new THREE.TorusKnotGeometry(0.55, 0.18, 96, 16),
  dodeca: () => new THREE.DodecahedronGeometry(0.85, 0),
  tetra: () => new THREE.TetrahedronGeometry(1, 0),
};

class Floating3d extends HTMLElement {
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.canvas = this.querySelector('.floating3d__canvas');
    if (!this.canvas) return;

    const data = this.querySelector('.floating3d__data');
    this.opts = data ? JSON.parse(data.textContent) : {};
    this.colorA = new THREE.Color(this.opts.colorA || '#0aeaed');
    this.colorB = new THREE.Color(this.opts.colorB || '#fa0dfd');
    this.shapeCount = this.opts.shapeCount ?? 14;
    this.parallaxStrength = this.opts.parallaxStrength ?? 1.5;

    this.pointer = new THREE.Vector2(0, 0);
    this.targetPointer = new THREE.Vector2(0, 0);
    this.scrollOffset = 0;

    this.initScene();
    this.spawnObjects();
    this.bindEvents();
    this.animate();
  }

  disconnectedCallback() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('scroll', this._onScroll);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
    }
    this.shapes?.forEach(s => {
      s.mesh.geometry.dispose();
      if (Array.isArray(s.mesh.material)) s.mesh.material.forEach(m => m.dispose());
      else s.mesh.material.dispose();
    });
  }

  initScene() {
    const w = this.clientWidth || window.innerWidth;
    const h = this.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x07041f, 0.06);

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 9);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x07041f, 1);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(this.colorA, 1.4);
    key.position.set(-5, 5, 5);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(this.colorB, 1.1);
    rim.position.set(5, -3, -3);
    this.scene.add(rim);
  }

  spawnObjects() {
    this.shapes = [];
    const keys = Object.keys(SHAPE_BUILDERS);

    for (let i = 0; i < this.shapeCount; i++) {
      const shapeKey = keys[i % keys.length];
      const geo = SHAPE_BUILDERS[shapeKey]();
      const t = i / Math.max(1, this.shapeCount - 1);
      const color = new THREE.Color().lerpColors(this.colorA, this.colorB, t);

      const mat = i % 3 === 0
        ? new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.7, toneMapped: false })
        : new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.65,
            roughness: 0.2,
            clearcoat: 1,
            clearcoatRoughness: 0.18,
            iridescence: 0.7,
            iridescenceIOR: 1.4,
            envMapIntensity: 1.0,
          });

      const mesh = new THREE.Mesh(geo, mat);

      const r = 4 + Math.random() * 3.5;
      const angle = Math.random() * Math.PI * 2;
      mesh.position.set(
        Math.cos(angle) * r,
        (Math.random() - 0.5) * 6,
        -2 - Math.random() * 6
      );
      const scale = 0.5 + Math.random() * 1.1;
      mesh.scale.setScalar(scale);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      this.scene.add(mesh);
      this.shapes.push({
        mesh,
        baseY: mesh.position.y,
        baseX: mesh.position.x,
        baseZ: mesh.position.z,
        speed: 0.2 + Math.random() * 0.5,
        rotSpeed: (Math.random() - 0.5) * 0.6,
        floatRange: 0.4 + Math.random() * 0.6,
        depth: 0.4 + Math.random() * 1.2,
      });
    }
  }

  bindEvents() {
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onResize = this.onResize.bind(this);
    this._onScroll = this.onScroll.bind(this);
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('scroll', this._onScroll, { passive: true });
  }

  onResize() {
    const w = this.clientWidth || window.innerWidth;
    const h = this.clientHeight || window.innerHeight;
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
    const rect = this.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const wH = window.innerHeight;
    this.scrollOffset = Math.max(-1, Math.min(1, (wH / 2 - center) / wH));
  }

  animate() {
    let last = performance.now();
    const loop = (t) => {
      const now = t / 1000;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;

      this.pointer.lerp(this.targetPointer, 0.08);

      this.camera.position.x = this.pointer.x * this.parallaxStrength;
      this.camera.position.y = this.pointer.y * this.parallaxStrength + this.scrollOffset * 0.8;
      this.camera.lookAt(0, 0, 0);

      this.shapes.forEach((s, idx) => {
        const m = s.mesh;
        m.rotation.x += s.rotSpeed * dt;
        m.rotation.y += s.rotSpeed * dt * 0.8;
        m.position.y = s.baseY + Math.sin(now * s.speed + idx) * s.floatRange;
        m.position.x = s.baseX + this.pointer.x * s.depth * 0.6;
        m.position.z = s.baseZ + this.pointer.y * s.depth * 0.4;
      });

      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
}

if (!customElements.get('floating-3d')) {
  customElements.define('floating-3d', Floating3d);
}

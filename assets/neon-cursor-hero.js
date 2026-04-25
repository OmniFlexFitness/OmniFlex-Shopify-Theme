import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

class NeonCursorHero extends HTMLElement {
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.canvas = this.querySelector('.neon-hero__canvas');
    if (!this.canvas) return;

    const data = this.querySelector('.neon-hero__data');
    this.opts = data ? JSON.parse(data.textContent) : {};

    this.colorA = new THREE.Color(this.opts.colorA || '#0aeaed');
    this.colorB = new THREE.Color(this.opts.colorB || '#fa0dfd');
    this.bloomStrength = this.opts.bloomStrength ?? 1.4;
    this.tubeCount = this.opts.tubeCount ?? 5;
    this.trailLength = this.opts.trailLength ?? 80;

    this.pointer = new THREE.Vector2(0, 0);
    this.targetPointer = new THREE.Vector2(0, 0);
    this.time = 0;

    this.initScene();
    this.initTubes();
    this.bindEvents();

    if (reduced) {
      this.renderOnce();
    } else {
      this.animate();
    }
  }

  disconnectedCallback() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('pointermove', this._onPointerMove);
    if (this.composer) this.composer.dispose?.();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
    }
    this.tubes?.forEach(t => {
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
    });
  }

  initScene() {
    const w = this.clientWidth || window.innerWidth;
    const h = this.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x07041f, 0.045);

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x07041f, 1);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), this.bloomStrength, 0.85, 0.1);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  initTubes() {
    this.tubes = [];
    for (let i = 0; i < this.tubeCount; i++) {
      const points = new Array(this.trailLength).fill(0).map(() => new THREE.Vector3(0, 0, 0));
      const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.4);
      const radius = 0.06 + i * 0.012;
      const geometry = new THREE.TubeGeometry(curve, this.trailLength * 2, radius, 12, false);

      const color = new THREE.Color().lerpColors(this.colorA, this.colorB, i / Math.max(1, this.tubeCount - 1));
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95 - i * 0.08,
        toneMapped: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      this.scene.add(mesh);

      this.tubes.push({
        mesh,
        curve,
        points,
        offset: i * 0.18,
        radius,
        segments: this.trailLength * 2,
      });
    }
  }

  bindEvents() {
    this._onResize = this.onResize.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
  }

  onResize() {
    const w = this.clientWidth || window.innerWidth;
    const h = this.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }

  onPointerMove(e) {
    const rect = this.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    this.targetPointer.set(x, y);
  }

  worldFromPointer(p) {
    const vec = new THREE.Vector3(p.x, p.y, 0.5).unproject(this.camera);
    const dir = vec.sub(this.camera.position).normalize();
    const dist = -this.camera.position.z / dir.z;
    return this.camera.position.clone().add(dir.multiplyScalar(dist));
  }

  step(dt) {
    this.time += dt;
    this.pointer.lerp(this.targetPointer, 0.12);

    const targetWorld = this.worldFromPointer(this.pointer);

    this.tubes.forEach((tube, idx) => {
      const wobble = new THREE.Vector3(
        Math.sin(this.time * 1.4 + tube.offset) * 0.5,
        Math.cos(this.time * 1.7 + tube.offset) * 0.4,
        Math.sin(this.time * 0.9 + tube.offset) * 0.3
      );
      const head = targetWorld.clone().add(wobble.multiplyScalar(0.6 + idx * 0.18));

      tube.points.shift();
      tube.points.push(head);

      tube.curve.points = tube.points;
      const newGeo = new THREE.TubeGeometry(tube.curve, tube.segments, tube.radius, 12, false);
      tube.mesh.geometry.dispose();
      tube.mesh.geometry = newGeo;
    });
  }

  animate() {
    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      this.step(dt);
      this.composer.render();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  renderOnce() {
    this.step(0);
    this.composer.render();
  }
}

if (!customElements.get('neon-cursor-hero')) {
  customElements.define('neon-cursor-hero', NeonCursorHero);
}

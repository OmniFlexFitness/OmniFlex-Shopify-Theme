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
    this.cursorEl = this.querySelector('.neon-hero__cursor');
    if (!this.canvas) return;

    const data = this.querySelector('.neon-hero__data');
    this.opts = data ? JSON.parse(data.textContent) : {};

    this.colorA = new THREE.Color(this.opts.colorA || '#0aeaed');
    this.colorB = new THREE.Color(this.opts.colorB || '#fa0dfd');
    this.bloomStrength = this.opts.bloomStrength ?? 1.4;
    this.tubeCount = this.opts.tubeCount ?? 5;
    this.trailLength = this.opts.trailLength ?? 80;
    this.starCount = this.opts.starCount ?? 1500;
    this.showGrid = this.opts.showGrid !== false;
    this.cursorLight = Object.assign({
      enabled: true,
      outerColor: '#0aeaed',
      innerColor: '#fa0dfd',
      radius: 1.0,
      intensity: 1.0,
      pulseSpeed: 4,
      ringWidth: 0.07,
    }, this.opts.cursorLight || {});

    this.pointer = new THREE.Vector2(0, 0);
    this.targetPointer = new THREE.Vector2(0, 0);
    this.cursorScreen = { x: 0, y: 0 };
    this.cursorScreenT = { x: 0, y: 0 };
    this.cursorActive = false;
    this.time = 0;

    this.initScene();
    if (this.starCount > 0) this.initStarfield();
    if (this.showGrid) this.initGrid();
    if (this.cursorLight.enabled) this.initRing();
    if (this.tubeCount > 0) this.initTubes();
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
    this.removeEventListener('pointerenter', this._onEnter);
    this.removeEventListener('pointerleave', this._onLeave);
    this._ro?.disconnect();
    if (this.composer) this.composer.dispose?.();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
    }
    this.tubes?.forEach(t => {
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
    });
    if (this.starfield) {
      this.starfield.geometry.dispose();
      this.starfield.material.dispose();
    }
    if (this.grid) {
      this.grid.geometry.dispose();
      this.grid.material.dispose();
    }
    if (this.ring) {
      this.ring.geometry.dispose();
      this.ring.material.dispose();
    }
  }

  initScene() {
    const w = this.clientWidth || window.innerWidth;
    const h = this.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x07041f, 0.04);

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
    this.camera.position.set(0, 0.5, 8);
    this.camera.lookAt(0, 0, 0);

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

  initStarfield() {
    const count = this.starCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const home = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const r = 8 + Math.pow(Math.random(), 0.6) * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.9;
      const x = Math.cos(theta) * Math.cos(phi) * r;
      const y = Math.sin(phi) * r * 0.6;
      const z = Math.sin(theta) * Math.cos(phi) * r - 4;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      home[i * 3] = x;
      home[i * 3 + 1] = y;
      home[i * 3 + 2] = z;

      const t = Math.random();
      const c = new THREE.Color().lerpColors(this.colorA, this.colorB, t);
      const dim = 0.5 + Math.random() * 0.5;
      colors[i * 3] = c.r * dim;
      colors[i * 3 + 1] = c.g * dim;
      colors[i * 3 + 2] = c.b * dim;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.userData.home = home;

    const mat = new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.starfield = new THREE.Points(geo, mat);
    this.scene.add(this.starfield);
  }

  initGrid() {
    const grid = new THREE.GridHelper(80, 40, this.colorA, 0x331144);
    grid.position.y = -3.2;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    grid.material.toneMapped = false;
    grid.material.depthWrite = false;
    this.grid = grid;
    this.scene.add(grid);
  }

  initRing() {
    const r = this.cursorLight.radius;
    const w = this.cursorLight.ringWidth;
    const outerR = 0.55 * r;
    const outerR2 = outerR + w;
    const geo = new THREE.RingGeometry(outerR, outerR2, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.cursorLight.outerColor),
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(geo, mat);
    this.scene.add(this.ring);

    const innerR = 0.18 * r;
    const innerR2 = innerR + Math.max(0.02, w * 0.7);
    const innerGeo = new THREE.RingGeometry(innerR, innerR2, 32);
    const innerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.cursorLight.innerColor),
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.ringInner = new THREE.Mesh(innerGeo, innerMat);
    this.scene.add(this.ringInner);
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
    this._onEnter = () => { this.cursorActive = true; if (this.cursorEl) this.cursorEl.dataset.active = 'true'; };
    this._onLeave = () => { this.cursorActive = false; if (this.cursorEl) this.cursorEl.dataset.active = 'false'; };
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    this.addEventListener('pointerenter', this._onEnter);
    this.addEventListener('pointerleave', this._onLeave);

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.onResize());
      this._ro.observe(this);
    }
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
    this.cursorScreenT = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (inside !== this.cursorActive) {
      this.cursorActive = inside;
      if (this.cursorEl) this.cursorEl.dataset.active = String(inside);
    }
  }

  worldFromPointer(p) {
    const vec = new THREE.Vector3(p.x, p.y, 0.5).unproject(this.camera);
    const dir = vec.sub(this.camera.position).normalize();
    const dist = -this.camera.position.z / dir.z;
    return this.camera.position.clone().add(dir.multiplyScalar(dist));
  }

  updateStarfield(dt, targetWorld) {
    if (!this.starfield) return;
    const pos = this.starfield.geometry.attributes.position;
    const home = this.starfield.geometry.userData.home;
    const arr = pos.array;
    const px = targetWorld.x;
    const py = targetWorld.y;
    const repulse = 1.4;
    const radius2 = 9;

    for (let i = 0; i < arr.length; i += 3) {
      const hx = home[i];
      const hy = home[i + 1];
      const hz = home[i + 2];
      const dx = hx - px;
      const dy = hy - py;
      const d2 = dx * dx + dy * dy;
      let push = 0;
      if (d2 < radius2) {
        const d = Math.sqrt(d2) || 1;
        push = (1 - d2 / radius2) * repulse;
        arr[i] = hx + (dx / d) * push;
        arr[i + 1] = hy + (dy / d) * push;
      } else {
        arr[i] += (hx - arr[i]) * 0.06;
        arr[i + 1] += (hy - arr[i + 1]) * 0.06;
      }
      arr[i + 2] = hz + Math.sin(this.time * 0.8 + i * 0.001) * 0.15;
    }
    pos.needsUpdate = true;

    this.starfield.rotation.y = this.pointer.x * 0.12;
    this.starfield.rotation.x = -this.pointer.y * 0.06;
  }

  updateGrid(dt) {
    if (!this.grid) return;
    this.grid.position.z = ((this.grid.position.z + dt * 2.5) % 4) - 2;
    this.grid.material.opacity = 0.25 + (this.cursorActive ? 0.2 : 0) * (0.5 + 0.5 * Math.sin(this.time * 3));
  }

  updateRing(targetWorld) {
    if (!this.ring) return;
    const intensity = this.cursorLight.intensity;
    const pulse = this.cursorLight.pulseSpeed > 0
      ? 0.9 + Math.sin(this.time * this.cursorLight.pulseSpeed) * 0.1
      : 1.0;

    this.ring.position.copy(targetWorld);
    this.ring.position.z = 0.05;
    this.ring.rotation.z = this.time * 1.2;
    this.ring.scale.setScalar(pulse);
    this.ring.material.opacity = (this.cursorActive ? 0.85 : 0.3) * intensity;

    this.ringInner.position.copy(this.ring.position);
    this.ringInner.rotation.z = -this.time * 1.6;
    this.ringInner.material.opacity = (this.cursorActive ? 0.9 : 0.4) * intensity;
  }

  updateCursorEl() {
    if (!this.cursorEl) return;
    const k = 0.22;
    this.cursorScreen.x += (this.cursorScreenT.x - this.cursorScreen.x) * k;
    this.cursorScreen.y += (this.cursorScreenT.y - this.cursorScreen.y) * k;
    this.cursorEl.style.transform = `translate3d(${this.cursorScreen.x}px, ${this.cursorScreen.y}px, 0) translate(-50%, -50%)`;
  }

  step(dt) {
    this.time += dt;
    this.pointer.lerp(this.targetPointer, 0.12);

    const targetWorld = this.worldFromPointer(this.pointer);

    (this.tubes || []).forEach((tube, idx) => {
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

    this.updateStarfield(dt, targetWorld);
    this.updateGrid(dt);
    this.updateRing(targetWorld);
    this.updateCursorEl();
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

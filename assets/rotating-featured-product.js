class RotatingFeaturedProduct extends HTMLElement {
  constructor() {
    super();

    // Shared state
    this.mode = 'drag';
    this.autoRotateEnabled = false;
    this.autoRotateSpeed = 3;

    // 3D model state
    this.modelUrl = '';
    this.THREE = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.model = null;
    this.animationId = null;

    // Image sequence state (fallback)
    this.currentFrame = 0;
    this.images = [];
    this.imageCount = 0;
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

    if (this.modelUrl) {
      this.initModelViewer();
    } else if (this.imageCount >= 2) {
      this.initImageRotation();
    }
  }

  disconnectedCallback() {
    // 3D cleanup
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
    }

    // Image cleanup
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

      // Shared
      this.mode = data.mode || 'drag';
      this.autoRotateEnabled = data.autoRotate || false;
      this.autoRotateSpeed = data.autoRotateSpeed || 3;

      // 3D model config
      this.modelUrl = data.modelUrl || '';
      this.modelScale = data.modelScale || 100;
      this.ambientColor = data.ambientColor || '#ffffff';
      this.ambientIntensity = data.ambientIntensity || 60;
      this.directionalColor = data.directionalColor || '#ffffff';
      this.directionalIntensity = data.directionalIntensity || 80;
      this.lightAngle = data.lightAngle || 45;
      this.lightHeight = data.lightHeight || 60;
      this.enableShadows = data.enableShadows !== false;
      this.bgTransparent = data.backgroundTransparent !== false;

      // Image fallback config
      this.images = data.images || [];
      this.imageCount = data.imageCount || 0;
      this.autoRotateInterval = 1000 / this.autoRotateSpeed;
    } catch (e) {
      // Silent fail — section renders as static
    }
  }

  // ================================================
  // 3D Model Viewer
  // ================================================

  async initModelViewer() {
    const canvas = this.querySelector('.rotating-product__canvas');
    const container = this.querySelector('.rotating-product__viewer');
    if (!canvas || !container) return;

    this.showLoading();

    try {
      const THREE = await import('three');
      const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');

      this.THREE = THREE;
      this.viewerContainer = container;

      // Scene
      this.scene = new THREE.Scene();

      // Camera
      const width = container.clientWidth;
      const height = container.clientHeight || width;
      this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      this.camera.position.set(0, 1, 3);

      // Renderer
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: this.bgTransparent,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(width, height);
      this.renderer.shadowMap.enabled = this.enableShadows;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;

      // Lights
      this.setupLights(THREE);

      // Load model
      await this.loadModel(THREE, FBXLoader);

      // Hide the poster image once the model is ready
      const poster = this.querySelector('.rotating-product__poster');
      if (poster) poster.style.display = 'none';

      // Interaction mode
      if (this.mode === 'drag') {
        this.setupOrbitControls(THREE, OrbitControls);
      } else {
        this.setupScrollModelRotation();
      }

      // Resize
      this._onResize = this.onModelResize.bind(this);
      window.addEventListener('resize', this._onResize);

      // Start render loop
      this.animate();
      this.hideLoading();
    } catch (error) {
      console.error('Failed to initialize 3D viewer:', error);
      this.hideLoading();
      this.showError();
    }
  }

  setupLights(THREE) {
    // Ambient light: intensity 0-100 maps to Three.js 0-2
    const ambientI = (this.ambientIntensity / 100) * 2;
    this.ambientLight = new THREE.AmbientLight(
      new THREE.Color(this.ambientColor),
      ambientI
    );
    this.scene.add(this.ambientLight);

    // Directional light: intensity 0-100 maps to Three.js 0-3
    const dirI = (this.directionalIntensity / 100) * 3;
    this.directionalLight = new THREE.DirectionalLight(
      new THREE.Color(this.directionalColor),
      dirI
    );

    // Position computed from angle (horizontal) and height (vertical)
    const angleRad = (this.lightAngle * Math.PI) / 180;
    const heightY = (this.lightHeight / 100) * 10;
    const radius = 5;
    this.directionalLight.position.set(
      Math.cos(angleRad) * radius,
      Math.max(0.5, heightY),
      Math.sin(angleRad) * radius
    );

    if (this.enableShadows) {
      this.directionalLight.castShadow = true;
      this.directionalLight.shadow.mapSize.width = 1024;
      this.directionalLight.shadow.mapSize.height = 1024;
      const d = 5;
      this.directionalLight.shadow.camera.left = -d;
      this.directionalLight.shadow.camera.right = d;
      this.directionalLight.shadow.camera.top = d;
      this.directionalLight.shadow.camera.bottom = -d;
      this.directionalLight.shadow.camera.near = 0.5;
      this.directionalLight.shadow.camera.far = 50;
    }

    this.scene.add(this.directionalLight);

    // Hemisphere light for subtle ground fill
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);
  }

  loadModel(THREE, FBXLoader) {
    return new Promise((resolve, reject) => {
      const loader = new FBXLoader();

      loader.load(
        this.modelUrl,
        (fbx) => {
          // Auto-center and normalize scale
          const box = new THREE.Box3().setFromObject(fbx);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          if (maxDim > 0) {
            const scale = (2 / maxDim) * (this.modelScale / 100);
            fbx.scale.multiplyScalar(scale);
            center.multiplyScalar(scale);
            fbx.position.sub(center);
          }

          // Enable shadows on meshes
          fbx.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = this.enableShadows;
              child.receiveShadow = this.enableShadows;
            }
          });

          this.model = fbx;
          this.scene.add(this.model);
          this.fitCameraToModel(THREE);
          resolve();
        },
        (progress) => {
          if (progress.total > 0) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            this.updateLoadingProgress(percent);
          }
        },
        (error) => reject(error)
      );
    });
  }

  fitCameraToModel(THREE) {
    if (!this.model) return;

    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let distance = maxDim / (2 * Math.tan(fov / 2));
    distance *= 1.6; // Padding

    this.camera.position.set(center.x, center.y, center.z + distance);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();

    if (this.controls) {
      this.controls.target.copy(center);
      this.controls.update();
    }
  }

  setupOrbitControls(THREE, OrbitControls) {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 20;
    this.controls.autoRotate = this.autoRotateEnabled;
    this.controls.autoRotateSpeed = this.autoRotateSpeed;

    // Prevent page scroll while interacting with viewer
    this.renderer.domElement.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  }

  setupScrollModelRotation() {
    this.scrollContainer = this.querySelector('.rotating-product__scroll-container');
    if (!this.scrollContainer) return;

    this._onScroll = () => {
      if (this.scrollRafId) return;
      this.scrollRafId = requestAnimationFrame(() => {
        this.scrollRafId = null;
        this.onModelScroll();
      });
    };

    window.addEventListener('scroll', this._onScroll, { passive: true });
    this.onModelScroll();
  }

  onModelScroll() {
    if (!this.scrollContainer || !this.model) return;

    const containerTop = this.scrollContainer.getBoundingClientRect().top;
    const viewportHeight = window.innerHeight;
    const scrollableDistance = this.scrollContainer.offsetHeight - viewportHeight;
    if (scrollableDistance <= 0) return;

    const scrolled = -containerTop;
    const fraction = Math.max(0, Math.min(1, scrolled / scrollableDistance));
    // Full 360-degree rotation mapped to scroll progress
    this.model.rotation.y = fraction * Math.PI * 2;
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  onModelResize() {
    if (!this.viewerContainer || !this.camera || !this.renderer) return;
    const w = this.viewerContainer.clientWidth;
    const h = this.viewerContainer.clientHeight || w;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ================================================
  // Loading / Error UI
  // ================================================

  showLoading() {
    const el = this.querySelector('.rotating-product__loading');
    if (el) el.style.display = '';
  }

  hideLoading() {
    const el = this.querySelector('.rotating-product__loading');
    if (el) el.classList.add('rotating-product__loading--hidden');
  }

  updateLoadingProgress(percent) {
    const bar = this.querySelector('.rotating-product__loading-progress');
    const text = this.querySelector('.rotating-product__loading-text');
    if (bar) bar.style.width = percent + '%';
    if (text) text.textContent = 'Loading model... ' + percent + '%';
  }

  showError() {
    const el = this.querySelector('.rotating-product__error');
    if (el) el.style.display = '';
  }

  // ================================================
  // Image Sequence Fallback (when no model URL)
  // ================================================

  initImageRotation() {
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

  preloadImages() {
    this.preloadedImages = this.images.map((imgData) => {
      const img = new Image();
      img.src = imgData.src;
      return img;
    });
  }

  // ---- Image scroll mode ----

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

    if (fraction > 0 && fraction < 1 && this.autoRotating && !this.autoRotatePaused) {
      this.stopAutoRotate();
    }
  }

  // ---- Image drag mode ----

  setupDragMode() {
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);

    this.frameContainer.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    this.frameContainer.addEventListener('dragstart', (e) => e.preventDefault());
  }

  onPointerDown(e) {
    if (e.button !== 0) return;

    this.isDragging = true;
    this.startX = e.clientX;
    this.startFrame = this.currentFrame;

    this.frameContainer.classList.add('is-dragging');
    this.frameContainer.setPointerCapture(e.pointerId);

    if (this.dragHint && !this.dragHint.classList.contains('rotating-product__drag-hint--hidden')) {
      this.dragHint.classList.add('rotating-product__drag-hint--hidden');
    }

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
    const newFrame = ((this.startFrame + frameDelta) % this.imageCount + this.imageCount) % this.imageCount;
    this.setFrameIndex(newFrame);
  }

  onPointerUp(e) {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.frameContainer.classList.remove('is-dragging');
    this.frameContainer.releasePointerCapture(e.pointerId);
  }

  // ---- Image frame display ----

  setFrameIndex(index) {
    if (index === this.currentFrame) return;
    if (index < 0 || index >= this.imageCount) return;

    const imageData = this.images[index];
    if (!imageData) return;

    this.frameImage.src = imageData.src;
    if (imageData.srcset) this.frameImage.srcset = imageData.srcset;
    this.frameImage.alt = imageData.alt;
    this.currentFrame = index;

    if (this.counterEl) this.counterEl.textContent = index + 1;
  }

  // ---- Image auto-rotate ----

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

    if (this.lastAutoRotateTime === 0) this.lastAutoRotateTime = timestamp;
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

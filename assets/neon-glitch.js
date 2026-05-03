/**
 * OmniFlex Neon & Glitch Effects — runtime
 * Vanilla JS port of OmniTask's text-scrambler + glitch-fx orchestrator.
 * No external dependencies. Self-initializes on DOMContentLoaded.
 *
 * Behaviors:
 *   - Elements with [data-scramble] play a one-shot character-decode
 *     animation the first time the cursor enters them. Subsequent
 *     hovers do nothing — matches OmniTask's "decode on first reveal"
 *     feel.
 *   - The decode runs inside a sibling .scramble-overlay so the
 *     element's real text node stays untouched (Liquid-rendered text
 *     keeps its content; the original color/text-shadow are restored
 *     after the animation).
 *   - Bound elements get a data-scramble-bound sentinel so a
 *     MutationObserver re-scan never double-binds.
 *   - Skipped entirely under prefers-reduced-motion: reduce.
 *
 * Pure CSS handles the chromatic-aberration glitch on
 * [data-fx-glitch]/[data-fx-glitch-box] — no JS needed for those.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var DEFAULT_GLITCH_CHARS = '▓▒░█▄▀■□◆◇▲▼►◄!@#$%^&*()_+={}[]|\\:;"<>?,./`~';
  var GLITCH_CHARSETS = {
    mixed:   '▓▒░█▄▀■□◆◇▲▼►◄!@#$%^&*()_+={}[]|\\:;"<>?,./`~',
    blocks:  '▓▒░█▄▀■□◆◇▲▼►◄',
    symbols: '!@#$%^&*()_+={}[]|\\:;"<>?,./`~',
    binary:  '01',
    hex:     '0123456789ABCDEF',
    katakana: 'アァカサタナハマヤラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨロヲゴゾドボポヴッン',
  };

  // Pulls live from the OmniFlex neon palette so merchant overrides in
  // theme settings flow through to the scramble flicker colors too.
  var ROTATE_COLORS = [
    'var(--ofx-cyan)',
    'var(--ofx-pink)',
    'var(--ofx-purple)',
    'var(--ofx-magenta)',
  ];
  var COLOR_VARS = {
    cyan:    'var(--ofx-cyan)',
    purple:  'var(--ofx-purple)',
    magenta: 'var(--ofx-magenta)',
    pink:    'var(--ofx-pink)',
    green:   'var(--ofx-green)',
    blue:    'var(--ofx-blue)',
  };

  function getScrambleConfig(el) {
    // Walk up the DOM looking for the data attributes — they live on
    // the bound element (the one with [data-scramble]), but the
    // scrambler itself runs on the inner overlay. Default to the
    // global config from theme.liquid.
    var ds = el.dataset;
    var globalCfg = (window.OmniFlexNeonConfig && window.OmniFlexNeonConfig.decode) || {};

    var charsetName = ds.scrambleCharset || globalCfg.charset || 'mixed';
    var charset = GLITCH_CHARSETS[charsetName] || DEFAULT_GLITCH_CHARS;

    var colorMode = ds.scrambleColor || globalCfg.color || 'rotate';

    var duration = parseInt(ds.scrambleDuration || globalCfg.duration, 10);
    if (isNaN(duration) || duration <= 0) duration = 400;
    // Internal "frame budget" scales with duration. Defaults are
    // tuned for ~400ms; larger durations spread the scramble over
    // proportionally more frames.
    var frameScale = duration / 400;

    return {
      charset: charset,
      colorMode: colorMode,
      frameScale: frameScale,
    };
  }

  function pickGlitchChar(cfg) {
    return cfg.charset.charAt(Math.floor(Math.random() * cfg.charset.length));
  }

  function pickGlitchColor(cfg, el) {
    var mode = cfg.colorMode;
    if (mode === 'rotate' || !mode) {
      return ROTATE_COLORS[Math.floor(Math.random() * ROTATE_COLORS.length)];
    }
    if (mode === 'match') {
      // Use the scrambling element's own rendered color.
      return window.getComputedStyle(el).color;
    }
    if (COLOR_VARS[mode]) return COLOR_VARS[mode];
    return mode; // raw CSS color string
  }

  function TextScrambler(element, hostElement) {
    this.el = element;
    // hostElement is the [data-scramble]-tagged element where
    // configuration lives — the overlay is a child of it.
    this.host = hostElement || element;
    this.queue = [];
    this.frame = 0;
    this.frameRequest = null;
    this.resolve = null;
  }

  TextScrambler.prototype.setText = function (newText) {
    var self = this;
    var oldText = this.el.textContent;
    var length = Math.max(oldText.length, newText.length);
    this.cfg = getScrambleConfig(this.host);
    var fs = this.cfg.frameScale;
    var promise = new Promise(function (resolve) {
      self.resolve = resolve;
    });
    this.queue = [];

    for (var i = 0; i < length; i++) {
      var from = oldText[i] || '';
      var to = newText[i] || '';
      var start = Math.floor(Math.random() * 8 * fs);
      var end = start + Math.floor(Math.random() * 8 * fs) + Math.round(4 * fs);
      this.queue.push({ from: from, to: to, start: start, end: end });
    }

    if (this.frameRequest !== null) {
      cancelAnimationFrame(this.frameRequest);
    }
    this.frame = 0;
    this.update();
    return promise;
  };

  TextScrambler.prototype.update = function () {
    var complete = 0;
    var self = this;
    // Build the next frame as a DocumentFragment composed of text nodes
    // (for settled / unstarted glyphs) and color-tinted <span> elements
    // (for actively scrambling glyphs). createTextNode escapes HTML by
    // construction, so source characters like `<` or `&` cannot break
    // out into markup — closes the XSS hole that the previous innerHTML
    // path opened.
    var fragment = document.createDocumentFragment();

    for (var i = 0, n = this.queue.length; i < n; i++) {
      var entry = this.queue[i];
      var ch = entry.char;

      if (this.frame >= entry.end) {
        complete++;
        fragment.appendChild(document.createTextNode(entry.to));
      } else if (this.frame >= entry.start) {
        if (!ch || Math.random() < 0.28) {
          ch = pickGlitchChar(this.cfg);
          entry.char = ch;
        }
        var span = document.createElement('span');
        span.style.color = pickGlitchColor(this.cfg, this.host);
        span.appendChild(document.createTextNode(ch));
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(entry.from));
      }
    }

    // Atomic replace: textContent='' clears children, then attach the
    // fragment so the browser only paints once per animation frame.
    this.el.textContent = '';
    this.el.appendChild(fragment);

    if (complete === this.queue.length) {
      if (this.resolve) this.resolve();
      this.frameRequest = null;
    } else {
      this.frameRequest = requestAnimationFrame(function () {
        self.update();
      });
      this.frame++;
    }
  };

  /**
   * Read the element's text while ignoring the dedicated overlay,
   * so the scrambler doesn't pick up the half-mutated overlay text
   * as the next "from" state.
   */
  function textExcludingOverlay(el, overlay) {
    var text = '';
    el.childNodes.forEach(function (node) {
      if (node === overlay) return;
      text += node.textContent || '';
    });
    return text;
  }

  function bindScramble(el) {
    if (el.dataset.scrambleBound === 'true') return;
    el.dataset.scrambleBound = 'true';

    var overlay = document.createElement('span');
    overlay.className = 'scramble-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    el.appendChild(overlay);

    var scrambler = new TextScrambler(overlay, el);
    var animating = false;

    // Replay mode: 'once' (default — fires the first hover then
    // unbinds) or 'always' (re-fires every time the cursor enters).
    // Per-element data-scramble-replay overrides the global setting.
    function getReplayMode() {
      if (el.dataset.scrambleReplay === 'always') return 'always';
      if (el.dataset.scrambleReplay === 'once') return 'once';
      var cfg = (window.OmniFlexNeonConfig && window.OmniFlexNeonConfig.decode) || {};
      return cfg.replay === true || cfg.replay === 'always' ? 'always' : 'once';
    }

    function onEnter() {
      if (animating) return;
      animating = true;
      var replayMode = getReplayMode();
      if (replayMode === 'once') {
        el.removeEventListener('mouseenter', onEnter);
      }

      var finalText = textExcludingOverlay(el, overlay);

      var rect = el.getBoundingClientRect();
      var originalMinWidth = el.style.minWidth;
      var originalDisplay = el.style.display;
      var computed = window.getComputedStyle(el);
      if (computed.display === 'inline') {
        el.style.display = 'inline-block';
      }
      el.style.minWidth = Math.ceil(rect.width) + 'px';

      overlay.style.color = computed.color;
      overlay.style.textShadow = computed.textShadow;
      overlay.textContent = finalText;

      el.classList.add('is-scrambling');

      scrambler.setText(finalText).then(function () {
        overlay.textContent = '';
        overlay.style.color = '';
        overlay.style.textShadow = '';
        el.classList.remove('is-scrambling');
        el.style.minWidth = originalMinWidth;
        el.style.display = originalDisplay;
        animating = false;
      });
    }

    el.addEventListener('mouseenter', onEnter);
  }

  /* ------- Observer-driven scanner ------- */

  var observer = null;
  var scanScheduled = false;

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(function () {
      scanScheduled = false;
      scan();
    });
  }

  /**
   * Apply data attributes to elements matching merchant-supplied
   * selectors (configured in Theme settings → Neon & glitch effects).
   * Quietly skips invalid selectors so a typo can't kill the runtime
   * for the rest of the page.
   */
  function applySelectorOptIns() {
    var cfg = window.OmniFlexNeonConfig || {};

    function tagAll(selector, attr) {
      if (!selector) return;
      try {
        var matches = document.querySelectorAll(selector);
        for (var i = 0; i < matches.length; i++) {
          if (!matches[i].hasAttribute(attr)) {
            matches[i].setAttribute(attr, '');
          }
        }
      } catch (err) {
        if (window.console && console.warn) {
          console.warn('[OmniFlexNeon] Invalid selector "' + selector + '":', err);
        }
      }
    }

    // Comma-split so a merchant can list several selectors. Each is
    // tried independently — one bad selector can't disable the rest.
    var glitchSelectors = (cfg.glitchSelector || '').split(',');
    for (var g = 0; g < glitchSelectors.length; g++) {
      tagAll(glitchSelectors[g].trim(), 'data-fx-glitch');
    }
    var decodeSelectors = (cfg.decodeSelector || '').split(',');
    for (var d = 0; d < decodeSelectors.length; d++) {
      tagAll(decodeSelectors[d].trim(), 'data-scramble');
    }

    // Heading sweep — restricted to <main> so navigation / footer
    // headings don't get the effect. Avoid clobbering elements that
    // already carry an explicit data-scramble in markup.
    if (cfg.decodeHeadings) {
      var main = document.getElementById('MainContent') || document.querySelector('main');
      if (main) {
        var headings = main.querySelectorAll('h1, h2');
        for (var h = 0; h < headings.length; h++) {
          if (!headings[h].hasAttribute('data-scramble')) {
            headings[h].setAttribute('data-scramble', '');
          }
        }
      }
    }

    if (cfg.decodeButtons) {
      var buttons = document.querySelectorAll('.button, .ofx-neon-button, .ofx-neon-button-fill');
      for (var b = 0; b < buttons.length; b++) {
        if (!buttons[b].hasAttribute('data-scramble')) {
          buttons[b].setAttribute('data-scramble', '');
        }
      }
    }
  }

  /* ------- PowerGlitch port (vanilla JS) -------
   *
   * Reproduces the slice-and-displace look of OmniTask's powerglitch
   * library (npm: powerglitch). On hover, the button is wrapped and N
   * absolute-positioned clones are stacked on top. Each clone is
   * clipped to a thin horizontal band via clip-path and translated
   * horizontally by a random amount. Re-randomized in steps over the
   * animation duration so the bands appear to "slip" across the
   * button. Skips elements where prefers-reduced-motion is set.
   *
   * Configurable via window.OmniFlexNeonConfig.glitch (theme settings)
   * and per-element data attributes:
   *
   *   data-fx-glitch-duration  ms (number)
   *   data-fx-glitch-slices    1-8
   *   data-fx-glitch-velocity  px (max horizontal offset)
   *   data-fx-glitch-shake     "true" / "false"
   *   data-fx-glitch-color     match | chromatic | cyan | purple |
   *                            magenta | pink | green | blue
   */

  // Hue-rotation angles applied via CSS filter. Approximate — the
  // exact rendered tint depends on the button's source colors, but
  // the relative shift is enough to push slices toward the chosen
  // accent.
  var HUE_ROTATIONS = {
    cyan:    180,
    blue:    220,
    purple:  280,
    magenta: 300,
    pink:    320,
    green:   100,
  };

  function getGlitchConfig(el) {
    var ds = el.dataset;
    var globalCfg = (window.OmniFlexNeonConfig && window.OmniFlexNeonConfig.glitch) || {};

    function pickInt(dsKey, globalKey, fallback) {
      var raw = ds[dsKey];
      if (raw != null && raw !== '') {
        var n = parseInt(raw, 10);
        if (!isNaN(n) && n > 0) return n;
      }
      var g = parseInt(globalCfg[globalKey], 10);
      if (!isNaN(g) && g > 0) return g;
      return fallback;
    }

    function pickBool(dsKey, globalKey, fallback) {
      if (ds[dsKey] === 'true') return true;
      if (ds[dsKey] === 'false') return false;
      if (globalCfg[globalKey] === true) return true;
      if (globalCfg[globalKey] === false) return false;
      return fallback;
    }

    // Resolve the glitch type. Per-element data-fx-glitch-type wins,
    // then global config, then a sensible default based on the
    // element kind: buttons get the slice (PowerGlitch), everything
    // else gets the chromatic-text variant.
    var type = ds.fxGlitchType || globalCfg.type;
    if (!type) {
      var isButton =
        el.classList.contains('button') ||
        el.classList.contains('ofx-neon-button') ||
        el.classList.contains('ofx-neon-button-fill');
      type = isButton ? 'slice' : 'chromatic-text';
    }

    return {
      type:       type,
      sliceCount: pickInt('fxGlitchSlices', 'sliceCount', 3),
      duration:   pickInt('fxGlitchDuration', 'duration', 400),
      velocity:   pickInt('fxGlitchVelocity', 'velocity', 18),
      minHeight:  0.05,
      maxHeight:  0.15,
      shake:      pickBool('fxGlitchShake', 'shake', false),
      color:      ds.fxGlitchColor || globalCfg.color || 'match',
      glitchEnd:  0.6,
      stepCount:  12,
    };
  }

  /**
   * Front door for the glitch system — resolves the type and either
   * binds the JS PowerGlitch slice runtime (for type === 'slice') or
   * just stamps the type + duration on the element so the CSS rules
   * take over. Idempotent via data-gl-bound.
   */
  function bindGlitch(el) {
    if (el.dataset.glBound === 'true') return;
    el.dataset.glBound = 'true';

    var cfg = getGlitchConfig(el);

    // Reflect the resolved type onto the element so the CSS
    // [data-fx-glitch-type="..."] selectors fire the right keyframe.
    if (!el.dataset.fxGlitchType) {
      el.dataset.fxGlitchType = cfg.type;
    }
    el.style.setProperty('--ofx-glitch-duration', cfg.duration + 'ms');

    if (cfg.type === 'slice') {
      bindPowerGlitch(el, cfg);
    }
    // All other types are pure CSS — the [data-fx-glitch-type=...]
    // selectors in neon-glitch.css handle :hover / :active.
  }

  function bindPowerGlitch(el, cfgArg) {
    if (el.dataset.pgBound === 'true') return;
    el.dataset.pgBound = 'true';

    var animating = false;

    el.addEventListener('mouseenter', function () {
      if (animating) return;
      animating = true;
      var cfg = cfgArg || getGlitchConfig(el);
      runPowerGlitch(el, cfg, function () {
        animating = false;
      });
    });
  }

  function applySliceColor(slice, mode, idx) {
    if (!mode || mode === 'match') return;
    if (mode === 'chromatic') {
      // Alternating cyan / magenta hue shifts — classic RGB
      // chromatic-aberration look.
      slice.style.filter = idx % 2 === 0 ? 'hue-rotate(90deg)' : 'hue-rotate(-90deg)';
      slice.style.mixBlendMode = 'screen';
      return;
    }
    var rotation = HUE_ROTATIONS[mode];
    if (typeof rotation === 'number') {
      slice.style.filter = 'hue-rotate(' + rotation + 'deg) saturate(1.4)';
    }
  }

  function runPowerGlitch(el, cfg, onComplete) {
    var computed = window.getComputedStyle(el);
    var originalPosition = el.style.position;
    var originalTransform = el.style.transform;
    if (computed.position === 'static') {
      el.style.position = 'relative';
    }

    // Build slice clones inside the original element.
    // Each clone is the full button laid on top, then clipped to a
    // band — so the slice color is whatever the button renders as
    // (background + border + label all included). When color !=
    // 'match' a CSS filter is applied to tint the slice.
    var slices = [];
    for (var i = 0; i < cfg.sliceCount; i++) {
      var clone = el.cloneNode(true);
      // Strip attributes that would cause re-binding or duplicate
      // accessibility nodes.
      clone.removeAttribute('id');
      clone.removeAttribute('data-fx-glitch');
      clone.removeAttribute('data-fx-glitch-hover');
      clone.removeAttribute('data-fx-glitch-click');
      clone.removeAttribute('data-fx-glitch-box');
      clone.removeAttribute('data-scramble');
      clone.removeAttribute('data-scramble-bound');
      clone.removeAttribute('data-pg-bound');
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      clone.style.position = 'absolute';
      clone.style.top = '0';
      clone.style.left = '0';
      clone.style.right = '0';
      clone.style.bottom = '0';
      clone.style.width = '100%';
      clone.style.height = '100%';
      clone.style.margin = '0';
      clone.style.pointerEvents = 'none';
      clone.style.userSelect = 'none';
      clone.style.zIndex = '1';
      clone.style.clipPath = 'inset(100%)';
      clone.style.transform = 'translateX(0)';
      clone.style.willChange = 'clip-path, transform, filter';
      applySliceColor(clone, cfg.color, i);
      el.appendChild(clone);
      slices.push(clone);
    }

    var startTime = performance.now();
    var stepDuration = cfg.duration / cfg.stepCount;
    var lastStep = -1;

    function tick(now) {
      var elapsed = now - startTime;
      var progress = elapsed / cfg.duration;

      if (progress >= 1) {
        for (var s = 0; s < slices.length; s++) {
          if (slices[s].parentNode === el) el.removeChild(slices[s]);
        }
        el.style.position = originalPosition;
        el.style.transform = originalTransform;
        if (onComplete) onComplete();
        return;
      }

      var step = Math.floor(elapsed / stepDuration);
      if (step !== lastStep) {
        lastStep = step;
        var inGlitchPhase = progress < cfg.glitchEnd;
        for (var i = 0; i < slices.length; i++) {
          if (!inGlitchPhase || Math.random() < 0.18) {
            // Hide this slice for this step — gives the stuttery feel
            slices[i].style.clipPath = 'inset(100%)';
            slices[i].style.transform = 'translateX(0)';
          } else {
            var top = Math.random();
            var height = cfg.minHeight + Math.random() * (cfg.maxHeight - cfg.minHeight);
            var offsetX = (Math.random() - 0.5) * 2 * cfg.velocity;
            var insetTop = (top * 100).toFixed(2);
            var insetBottom = Math.max(0, (1 - top - height) * 100).toFixed(2);
            slices[i].style.clipPath = 'inset(' + insetTop + '% 0 ' + insetBottom + '% 0)';
            slices[i].style.transform = 'translateX(' + offsetX.toFixed(2) + 'px)';
          }
        }

        // Whole-element shake — matches OmniTask's optional
        // shake: { velocity, ... } config. Velocity here is reused
        // as the shake amplitude.
        if (cfg.shake && inGlitchPhase) {
          var sx = (Math.random() - 0.5) * 2 * (cfg.velocity * 0.4);
          var sy = (Math.random() - 0.5) * 2 * (cfg.velocity * 0.25);
          el.style.transform = 'translate(' + sx.toFixed(2) + 'px,' + sy.toFixed(2) + 'px)';
        }
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function scan() {
    applySelectorOptIns();

    // Decode/scramble targets
    var scrambleTargets = document.querySelectorAll(
      '[data-scramble]:not([data-scramble-bound])'
    );
    for (var i = 0; i < scrambleTargets.length; i++) {
      bindScramble(scrambleTargets[i]);
    }

    // Glitch targets — bindGlitch dispatches by type. For type
    // 'slice' it kicks off the JS PowerGlitch port; for the other
    // types it just stamps data-fx-glitch-type and the CSS keyframe
    // selectors do the work.
    var glitchTargets = document.querySelectorAll(
      '[data-fx-glitch]:not([data-gl-bound])'
    );
    for (var g = 0; g < glitchTargets.length; g++) {
      bindGlitch(glitchTargets[g]);
    }
  }

  function init() {
    if (observer) return;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    scan();

    observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes.length > 0) {
          scheduleScan();
          return;
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Expose for debugging / theme editor re-init */
  window.OmniFlexNeon = {
    bindScramble: bindScramble,
    bindGlitch: bindGlitch,
    bindPowerGlitch: bindPowerGlitch,
    scan: scan,
  };
})();

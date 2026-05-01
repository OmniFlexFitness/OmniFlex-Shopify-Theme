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

  var GLITCH_CHARS = '▓▒░█▄▀■□◆◇▲▼►◄!@#$%^&*()_+={}[]|\\:;"<>?,./`~';
  // Pulls live from the OmniFlex neon palette so merchant overrides in
  // theme settings flow through to the scramble flicker colors too.
  var GLITCH_COLORS = [
    'var(--ofx-cyan)',
    'var(--ofx-pink)',
    'var(--ofx-purple)',
    'var(--ofx-magenta)',
  ];

  function randomChar() {
    return GLITCH_CHARS.charAt(Math.floor(Math.random() * GLITCH_CHARS.length));
  }

  function randomColor() {
    return GLITCH_COLORS[Math.floor(Math.random() * GLITCH_COLORS.length)];
  }

  function TextScrambler(element) {
    this.el = element;
    this.queue = [];
    this.frame = 0;
    this.frameRequest = null;
    this.resolve = null;
  }

  TextScrambler.prototype.setText = function (newText) {
    var self = this;
    var oldText = this.el.textContent;
    var length = Math.max(oldText.length, newText.length);
    var promise = new Promise(function (resolve) {
      self.resolve = resolve;
    });
    this.queue = [];

    for (var i = 0; i < length; i++) {
      var from = oldText[i] || '';
      var to = newText[i] || '';
      var start = Math.floor(Math.random() * 8);
      var end = start + Math.floor(Math.random() * 8) + 4;
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
          ch = randomChar();
          entry.char = ch;
        }
        var span = document.createElement('span');
        span.style.color = randomColor();
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

    var scrambler = new TextScrambler(overlay);

    function onEnter() {
      el.removeEventListener('mouseenter', onEnter);

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
   * Differences from the full library:
   *   - Slice-only (no shake / hue-rotate); matches OmniTask's
   *     POWERGLITCH_CONFIG which sets shake: false, hueRotate: false.
   *   - Steps every ~33ms rather than per-frame so the slip reads as
   *     a digital glitch, not a smooth motion.
   *   - Skips a portion of frames during the last 40% of the
   *     animation (matches glitchTimeSpan: { start: 0, end: 0.6 }).
   */
  var POWERGLITCH = {
    sliceCount: 3,
    duration: 400,
    velocity: 18,
    minHeight: 0.05,
    maxHeight: 0.15,
    glitchEnd: 0.6,
    stepCount: 12,
  };

  function bindPowerGlitch(el) {
    if (el.dataset.pgBound === 'true') return;
    el.dataset.pgBound = 'true';

    var animating = false;

    el.addEventListener('mouseenter', function () {
      if (animating) return;
      animating = true;
      runPowerGlitch(el, function () {
        animating = false;
      });
    });
  }

  function runPowerGlitch(el, onComplete) {
    var cfg = POWERGLITCH;
    var computed = window.getComputedStyle(el);
    var originalPosition = el.style.position;
    if (computed.position === 'static') {
      el.style.position = 'relative';
    }

    // Build slice clones inside the original element.
    // Each clone is the full button laid on top, then clipped to a
    // band — so the slice color is whatever the button renders as
    // (background + border + label all included).
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
      clone.style.willChange = 'clip-path, transform';
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

    // PowerGlitch buttons — JS slice port. Match anything that's a
    // theme button or one of our standalone neon buttons carrying
    // the glitch attribute. Non-button elements still get the
    // CSS-only chromatic-aberration via the [data-fx-glitch]:hover
    // keyframes in neon-glitch.css.
    var glitchTargets = document.querySelectorAll(
      '.button[data-fx-glitch]:not([data-pg-bound]),' +
        '.ofx-neon-button[data-fx-glitch]:not([data-pg-bound]),' +
        '.ofx-neon-button-fill[data-fx-glitch]:not([data-pg-bound])'
    );
    for (var g = 0; g < glitchTargets.length; g++) {
      bindPowerGlitch(glitchTargets[g]);
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
    bindPowerGlitch: bindPowerGlitch,
    scan: scan,
  };
})();

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
  var GLITCH_COLORS = ['#00d9ff', '#ff006e', '#b026ff', '#00fff5'];

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
    var oldText = this.el.innerText;
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
    var output = '';
    var complete = 0;
    var self = this;

    for (var i = 0, n = this.queue.length; i < n; i++) {
      var entry = this.queue[i];
      var from = entry.from;
      var to = entry.to;
      var start = entry.start;
      var end = entry.end;
      var ch = entry.char;

      if (this.frame >= end) {
        complete++;
        output += to;
      } else if (this.frame >= start) {
        if (!ch || Math.random() < 0.28) {
          ch = randomChar();
          entry.char = ch;
        }
        output += '<span style="color:' + randomColor() + '">' + ch + '</span>';
      } else {
        output += from;
      }
    }

    this.el.innerHTML = output;

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

  function scan() {
    var targets = document.querySelectorAll('[data-scramble]:not([data-scramble-bound])');
    for (var i = 0; i < targets.length; i++) {
      bindScramble(targets[i]);
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
    scan: scan,
  };
})();

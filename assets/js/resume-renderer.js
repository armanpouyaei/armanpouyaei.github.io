/* resume-renderer.js — "Download résumé" button handler.
 *
 * On click it fetches resume/resume.tex, compiles it to PDF entirely in the
 * browser (via assets/js/resume-worker.js, which runs the GlyphTeX/Tectonic
 * WebAssembly engine off the main thread), and shows the PDF in a new tab.
 *
 * The new tab opens resume/viewer.html (a real https URL — this matters on
 * iOS, which refuses to navigate to blob: URLs with "address is invalid").
 * The compiled PDF bytes are handed to the viewer tab through localStorage;
 * the viewer renders them with PDF.js, so no blob: navigation is needed
 * anywhere. Without JavaScript the link degrades to downloading resume.tex.
 */
(function () {
  'use strict';

  var TEX_URL = 'resume/resume.tex';
  var VIEWER_URL = 'resume/viewer.html';
  var WORKER_URL = 'assets/js/resume-worker.js';

  var btn = document.getElementById('resume-download');
  if (!btn) return;

  var originalHTML = btn.innerHTML;
  var worker = null;
  var busy = false;

  function setHTML(html) { btn.innerHTML = html; }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function storageOK() {
    try {
      localStorage.setItem('__resume_probe', '1');
      localStorage.removeItem('__resume_probe');
      return true;
    } catch (e) {
      return false;
    }
  }

  function bytesToB64(bytes) {
    var bin = '';
    var CHUNK = 8192;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function getWorker() {
    if (!worker) {
      worker = new Worker(WORKER_URL, { type: 'module' });
    }
    return worker;
  }

  // Warm up the engine after the page settles so the first click feels instant.
  function warm() {
    try {
      getWorker().postMessage({ type: 'warm' });
    } catch (e) {
      worker = null;
    }
  }
  if (window.requestIdleCallback) {
    window.requestIdleCallback(warm, { timeout: 12000 });
  } else {
    window.setTimeout(warm, 6000);
  }

  btn.addEventListener('click', function (ev) {
    ev.preventDefault();
    if (busy) return;
    busy = true;

    var useViewer = storageOK();
    var id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var key = 'resume-pdf-' + id;

    // Open the tab synchronously inside the click handler: popup blockers
    // cannot intercept it. The viewer URL is a real https address, which is
    // required on iOS (blob: URLs are rejected there as invalid addresses).
    var tab = null;
    try {
      tab = window.open(useViewer ? VIEWER_URL + '#' + id : '', '_blank');
    } catch (e) {
      tab = null;
    }
    if (!tab) {
      busy = false;
      setHTML('Popup blocked — allow popups and retry');
      window.setTimeout(function () { setHTML(originalHTML); }, 3500);
      return;
    }

    setHTML('Compiling résumé… <span class="arrow" aria-hidden="true">…</span>');

    var w;
    try {
      w = getWorker();
    } catch (e) {
      finishFail('Web Workers are not available in this browser.');
      return;
    }

    function finishFail(message) {
      busy = false;
      if (w) w.removeEventListener('message', onMessage);
      if (useViewer) {
        try { localStorage.setItem(key + ':error', message); } catch (e) { /* ignore */ }
      } else {
        try { tab.close(); } catch (e) { /* ignore */ }
      }
      if (window.console) console.error('[resume] ' + message);
      setHTML('Render failed — try again');
      window.setTimeout(function () { setHTML(originalHTML); }, 3500);
    }

    function finishOk(pdfBytes) {
      busy = false;
      w.removeEventListener('message', onMessage);
      if (useViewer) {
        // Hand the bytes to the viewer tab via localStorage; it renders them
        // with PDF.js. No blob: navigation involved, so this works on iOS.
        try {
          localStorage.setItem(key, bytesToB64(pdfBytes));
        } catch (e) {
          finishFail('Could not hand the PDF to the viewer tab: ' + e.message);
          return;
        }
        setHTML('Opened in new tab <span class="arrow" aria-hidden="true">↗</span>');
      } else {
        // Fallback for browsers without localStorage (desktop): classic blob URL.
        var blob = new Blob([pdfBytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var opened = false;
        try { tab.location.href = url; opened = true; } catch (e) { /* fall through */ }
        if (!opened) {
          try { opened = !!window.open(url, '_blank'); } catch (e) { opened = false; }
        }
        if (!opened) { try { tab.close(); } catch (e) { /* ignore */ } }
        setHTML(opened
          ? 'Opened in new tab <span class="arrow" aria-hidden="true">↗</span>'
          : 'Render failed — try again');
      }
      window.setTimeout(function () { setHTML(originalHTML); }, 3000);
    }

    function onMessage(e) {
      var m = e.data || {};
      if (m.type === 'progress' && m.label) {
        setHTML(esc(m.label) + ' <span class="arrow" aria-hidden="true">…</span>');
      } else if (m.type === 'done' && m.pdf) {
        finishOk(m.pdf);
      } else if (m.type === 'error') {
        finishFail(m.message || 'unknown error');
      }
    }
    w.addEventListener('message', onMessage);

    fetch(TEX_URL, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('could not fetch ' + TEX_URL + ' (HTTP ' + r.status + ')');
        return r.text();
      })
      .then(function (tex) {
        w.postMessage({ type: 'compile', tex: tex });
      })
      .catch(function (err) {
        onMessage({ data: { type: 'error', message: String((err && err.message) || err) } });
      });
  });
})();

/* resume-renderer.js — "Download résumé" button handler.
 *
 * On click it fetches resume/resume.tex, compiles it to PDF entirely in the
 * browser (via assets/js/resume-worker.js, which runs the GlyphTeX/Tectonic
 * WebAssembly engine off the main thread), and opens the resulting PDF in a
 * new tab. Without JavaScript the link degrades to downloading resume.tex.
 */
(function () {
  'use strict';

  var TEX_URL = 'resume/resume.tex';
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

  function loadingPage() {
    return '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Compiling résumé…</title>' +
      '<style>html,body{height:100%}body{background:#050b0d;color:#9bb2ad;' +
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;display:flex;' +
      'align-items:center;justify-content:center;margin:0;text-align:center}' +
      'b{display:block;color:#62e6e1;font-size:15px;letter-spacing:.08em;margin-bottom:10px}' +
      'span{font-size:12px}</style></head><body><div>' +
      '<b>COMPILING RÉSUMÉ</b><span>Rendering resume.tex → PDF in your browser…</span>' +
      '</div></body></html>';
  }

  btn.addEventListener('click', function (ev) {
    ev.preventDefault();
    if (busy) return;
    busy = true;

    // Open the tab synchronously inside the click handler: popup blockers
    // cannot intercept it, and we navigate it to the PDF when ready.
    var tab = null;
    try { tab = window.open('', '_blank'); } catch (e) { tab = null; }
    if (tab) {
      try { tab.document.write(loadingPage()); tab.document.close(); } catch (e) { /* ignore */ }
    }

    setHTML('Compiling résumé… <span class="arrow" aria-hidden="true">…</span>');

    var w;
    try {
      w = getWorker();
    } catch (e) {
      finishFail(tab, 'Web Workers are not available in this browser.');
      return;
    }

    function finishFail(tabRef, message) {
      busy = false;
      if (w) w.removeEventListener('message', onMessage);
      if (tabRef) { try { tabRef.close(); } catch (e) { /* ignore */ } }
      if (window.console) console.error('[resume] ' + message);
      setHTML('Render failed — try again');
      window.setTimeout(function () { setHTML(originalHTML); }, 3500);
    }

    function finishOk(pdfBytes) {
      busy = false;
      w.removeEventListener('message', onMessage);
      var blob = new Blob([pdfBytes], { type: 'application/pdf' });
      var url = URL.createObjectURL(blob);
      var opened = false;
      if (tab) {
        try { tab.location.href = url; opened = true; } catch (e) { /* fall through */ }
      }
      if (!opened) {
        try { opened = !!window.open(url, '_blank'); } catch (e) { opened = false; }
      }
      if (!opened && tab) { try { tab.close(); } catch (e) { /* ignore */ } }
      if (opened) {
        setHTML('Opened in new tab <span class="arrow" aria-hidden="true">↗</span>');
      } else {
        // Last resort: trigger a download instead of losing the PDF.
        var a = document.createElement('a');
        a.href = url;
        a.download = 'Arman_Pouyaei_Resume.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setHTML('Downloaded instead <span class="arrow" aria-hidden="true">↓</span>');
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
        finishFail(tab, m.message || 'unknown error');
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

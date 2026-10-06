/* resume-worker.js — Web Worker (module) that compiles resume.tex to PDF with the
 * GlyphTeX engine (Tectonic compiled to WebAssembly, MIT licensed, served from
 * the pinned jsDelivr URLs below). Runs off the main thread so the page stays
 * responsive while the engine downloads and compiles.
 *
 * Protocol:
 *   main -> worker : { type: 'warm' }                 // preload engine/bundle
 *   main -> worker : { type: 'compile', tex: string }  // compile, reply below
 *   worker -> main : { type: 'progress', stage, label }
 *   worker -> main : { type: 'done', pdf: ArrayBuffer }      // transferable
 *   worker -> main : { type: 'error', message }
 */

import {
  TexEngine,
  EnginePoisonedError,
  parsePackIndex,
  resolveMissing,
} from 'https://cdn.jsdelivr.net/npm/glyphtex-engine@0.1.0/+esm';

const CDN = 'https://cdn.jsdelivr.net/npm/glyphtex-engine@0.1.0';
const CACHE_NAME = 'resume-tex-v1';
const MAX_PACK_ROUNDS = 3;

let enginePromise = null; // Promise<TexEngine> | null
let packsIndex = null; // PackIndex | null
const installedPacks = []; // Array<{id, hash}>

function post(type, data, transfer) {
  self.postMessage(Object.assign({ type }, data), transfer || []);
}

function progress(stage, label) {
  post('progress', { stage, label });
}

/* ---------- minimal tar parser (regular files; handles pax 'x' path overrides) ---------- */

function parseTar(buffer) {
  const bytes = new Uint8Array(buffer);
  const dec = new TextDecoder();
  const files = {};
  let offset = 0;
  let paxPath = null;

  const readStr = (a, b) => dec.decode(bytes.subarray(offset + a, offset + b)).replace(/\0.*$/, '');

  while (offset + 512 <= bytes.length) {
    let allZero = true;
    for (let i = 0; i < 512; i++) {
      if (bytes[offset + i] !== 0) { allZero = false; break; }
    }
    if (allZero) break;

    let name = readStr(0, 100);
    const size = parseInt(readStr(124, 136).trim(), 8) || 0;
    const typeflag = String.fromCharCode(bytes[offset + 156]);
    const dataStart = offset + 512;
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (typeflag === 'x' || typeflag === 'g') {
      // pax extended header: look for a path= record for the next entry
      const text = dec.decode(bytes.subarray(dataStart, dataStart + size));
      const m = /(?:^|\n)\d+ path=([^\n]+)/.exec(text);
      if (m) paxPath = m[1].trim();
      continue;
    }
    if (typeflag === '5' || name.endsWith('/')) { paxPath = null; continue; } // directory
    if (typeflag !== '0' && typeflag !== '\0') { paxPath = null; continue; } // skip special

    if (paxPath) { name = paxPath; paxPath = null; }
    if (name.startsWith('./')) name = name.slice(2);
    if (!name) continue;
    files[name] = bytes.slice(dataStart, dataStart + size);
  }
  return files;
}

/* ---------- fetching (with Cache API so repeat visits are fast) ---------- */

async function openCache() {
  try {
    return await caches.open(CACHE_NAME);
  } catch (e) {
    return null; // Cache API unavailable (e.g. some test harnesses)
  }
}

async function fetchCached(url) {
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) return hit;
    } catch (e) { /* fall through to network */ }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('download failed (' + res.status + '): ' + url);
  if (cache) {
    try { await cache.put(url, res.clone()); } catch (e) { /* non-fatal */ }
  }
  return res;
}

async function fetchTarball(url, label) {
  progress('bundle', label);
  const res = await fetchCached(url);
  const gz = await res.arrayBuffer();
  const out = new DecompressionStream('gzip');
  const stream = new Blob([gz]).stream().pipeThrough(out);
  const raw = await new Response(stream).arrayBuffer();
  return parseTar(raw);
}

/* ---------- engine lifecycle ---------- */

async function ensureEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    progress('engine', 'Loading TeX engine…');
    const wasmRes = await fetchCached(CDN + '/wasm/tectonic_wasm.wasm');
    const wasmBuf = await wasmRes.arrayBuffer();
    const engine = await TexEngine.load(wasmBuf);
    const files = await fetchTarball(
      CDN + '/wasm/tectonic-bundle.tar.gz',
      'Loading TeX Live bundle…'
    );
    engine.addFiles(files);
    progress('ready', 'Engine ready');
    return engine;
  })();
  // A failed warm-up must not poison later clicks: allow a retry.
  enginePromise.catch(() => { enginePromise = null; });
  return enginePromise;
}

async function loadPacksIndex() {
  if (!packsIndex) {
    const res = await fetchCached(CDN + '/wasm/packs/packs-index.json');
    packsIndex = parsePackIndex(await res.json());
  }
  return packsIndex;
}

// Install packs (dependency order) via their tarballs.
async function installPacks(engine, packs) {
  const index = await loadPacksIndex();
  const byId = {};
  for (const p of index.packs) byId[p.id] = p;
  const ordered = [];
  const seen = new Set(installedPacks.map((p) => p.id));
  const visit = (pack) => {
    if (seen.has(pack.id)) return;
    seen.add(pack.id);
    for (const req of pack.requires || []) {
      if (byId[req]) visit(byId[req]);
    }
    ordered.push(pack);
  };
  for (const p of packs) visit(p);

  for (const pack of ordered) {
    const files = await fetchTarball(
      CDN + '/wasm/packs/pack-' + pack.id + '.tar.gz',
      'Loading ' + pack.label + '…'
    );
    engine.addFiles(files);
    installedPacks.push({ id: pack.id, hash: pack.hash });
  }
}

function failLogTail(engine) {
  try {
    const log = engine.log() || '';
    return log.trim().split('\n').slice(-12).join('\n');
  } catch (e) {
    return '';
  }
}

async function compile(tex, poisonRetries) {
  const engine = await ensureEngine();
  progress('compile', 'Compiling résumé…');
  engine.addFile('resume.tex', tex);

  for (let round = 0; round <= MAX_PACK_ROUNDS; round++) {
    let result;
    try {
      result = engine.compile({ entry: 'resume.tex' });
    } catch (e) {
      // A trapped compile poisons the wasm session; rebuild once and retry.
      // The wrapper reports this as EnginePoisonedError, but a trap in the
      // driver phase can surface as a raw WebAssembly.RuntimeError instead.
      const poisoned =
        (e && e.name === 'EnginePoisonedError') ||
        (e && e.name === 'RuntimeError' && /unreachable/i.test(String(e.message)));
      if (poisoned && (poisonRetries || 0) < 1) {
        enginePromise = null;
        return compile(tex, (poisonRetries || 0) + 1);
      }
      throw e;
    }

    // Tectonic reports kpathsea *probes* as missing even on success, so a
    // non-empty missingFiles list alone is not failure. Success = the engine
    // did not fail AND a PDF came out.
    if (result.status !== 'failed') {
      const pdf = engine.pdf();
      if (pdf && pdf.length) return pdf;
    }

    // Missing or failed: see if any of the missing files map to installable
    // TeX Live packs, and fetch those before recompiling.
    const missing = result.missingFiles || [];
    const resolved = resolveMissing(await loadPacksIndex(), missing, installedPacks);
    if (resolved.unsupported.length) {
      throw new Error('TeX files not available in the web bundle: ' + resolved.unsupported.join(', '));
    }
    if (!resolved.packs.length) {
      const pdf = engine.pdf();
      if (pdf && pdf.length) return pdf;
      const tail = failLogTail(engine);
      throw new Error(
        'LaTeX compile failed (' + result.status + ')' + (tail ? '\n' + tail : '') +
        (result.message ? '\n' + result.message : '')
      );
    }
    progress('packs', 'Fetching TeX packages…');
    await installPacks(engine, resolved.packs);
  }
  throw new Error('could not resolve all TeX packages');
}

/* ---------- message queue: one job at a time, in order ---------- */

let chain = Promise.resolve();

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'warm') {
    chain = chain.then(() => ensureEngine()).catch((err) => {
      post('error', { message: 'warm-up failed: ' + (err && err.message || err) });
    });
  } else if (msg.type === 'compile') {
    chain = chain
      .then(() => compile(String(msg.tex || ''), 0))
      .then((pdf) => {
        const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);
        post('done', { pdf: buf }, [buf]);
      })
      .catch((err) => {
        post('error', { message: String((err && err.message) || err) });
      });
  }
};

/* api.js — REST client */
const API = (() => {
  const BASE = window.API_BASE || "http://localhost:5000";

  async function req(method, path, body=null, isForm=false) {
    const opts = { method, headers:{} };
    if (body) {
      if (isForm) { opts.body = body; }
      else { opts.headers["Content-Type"]="application/json"; opts.body=JSON.stringify(body); }
    }
    const r = await fetch(`${BASE}${path}`, opts);
    if (!r.ok) {
      let msg=`HTTP ${r.status}`;
      try { msg=(await r.json()).error||msg; } catch{}
      throw new Error(msg);
    }
    return r.json();
  }

  async function checkHealth() {
    try { return (await req("GET","/api/health")).status==="healthy"; }
    catch { return false; }
  }

  async function getInfo()           { return req("GET","/api/info"); }
  async function getStats()          { return req("GET","/api/stats"); }
  async function getClasses(s="")    { return req("GET",`/api/classes${s?`?search=${encodeURIComponent(s)}`:""}`); }

  async function detectImage(file, opts={}) {
    const fd = new FormData();
    fd.append("image", file);
    fd.append("confidence", opts.confidence ?? 0.25);
    fd.append("iou",        opts.iou        ?? 0.45);
    (opts.classes||[]).forEach(c=>fd.append("classes",c));
    return req("POST","/api/detect/image", fd, true);
  }

  async function detectFrame(frameB64, opts={}) {
    return req("POST","/api/detect/frame",{
      frame:      frameB64,
      confidence: opts.confidence ?? 0.25,
      iou:        opts.iou        ?? 0.45,
      classes:    opts.classes    || [],
      include_frame: opts.includeFrame ?? false,
    });
  }

  async function detectBatch(files, opts={}) {
    const fd = new FormData();
    files.forEach(f=>fd.append("images",f));
    fd.append("confidence", opts.confidence ?? 0.25);
    fd.append("iou",        opts.iou        ?? 0.45);
    return req("POST","/api/detect/batch", fd, true);
  }

  function resUrl(rel) {
    if (!rel) return null;
    return rel.startsWith("http") ? rel : `${BASE}${rel}`;
  }

  return { checkHealth, getInfo, getStats, getClasses, detectImage, detectFrame, detectBatch, resUrl, BASE };
})();

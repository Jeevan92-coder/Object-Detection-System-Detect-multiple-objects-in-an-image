/**
 * camera.js — Live Webcam Object Detection
 * ═══════════════════════════════════════════
 * Architecture:
 *  1. getUserMedia → <video> element
 *  2. requestAnimationFrame loop captures frames to offscreen canvas
 *  3. Sends base64 JPEG to /api/detect/frame every (1000/fps) ms
 *  4. Receives annotated frame + detections JSON
 *  5. Draws annotated frame to visible <canvas> on top of video
 *     (or draws bounding boxes directly in browser for lower latency)
 * ═══════════════════════════════════════════
 */

document.addEventListener("DOMContentLoaded", async () => {

  // ── Element refs ────────────────────────────────────────────
  const video        = document.getElementById("camVideo");
  const canvas       = document.getElementById("camCanvas");
  const ctx          = canvas.getContext("2d");
  const overlay      = document.getElementById("camOverlay");
  const recIndicator = document.getElementById("recIndicator");
  const fpsDisplay   = document.getElementById("fpsDisplay");
  const startBtn     = document.getElementById("startBtn");
  const stopBtn      = document.getElementById("stopBtn");
  const snapBtn      = document.getElementById("snapBtn");
  const camSelect    = document.getElementById("camSelect");
  const snapFlash    = document.getElementById("snapFlash");
  const errBar       = document.getElementById("errBar");
  const errMsg       = document.getElementById("errMsg");

  const camConf      = document.getElementById("camConf");
  const camConfV     = document.getElementById("camConfV");
  const camIou       = document.getElementById("camIou");
  const camIouV      = document.getElementById("camIouV");
  const fpsSelect    = document.getElementById("fpsSelect");
  const camClsFilter = document.getElementById("camClsFilter");

  const lsStatus     = document.getElementById("lsStatus");
  const lsFPS        = document.getElementById("lsFPS");
  const lsObjects    = document.getElementById("lsObjects");
  const lsLatency    = document.getElementById("lsLatency");
  const lsFrames     = document.getElementById("lsFrames");
  const lsModel      = document.getElementById("lsModel");
  const liveDets     = document.getElementById("liveDets");
  const miniChart    = document.getElementById("miniChart");
  const snapsStrip   = document.getElementById("snapsStrip");

  // ── State ───────────────────────────────────────────────────
  let stream         = null;
  let running        = false;
  let frameTimer     = null;
  let fpsTimer       = null;
  let detecting      = false;     // prevent overlapping requests
  let totalFrames    = 0;
  let fpsCount       = 0;
  let lastFpsTime    = Date.now();
  let latestDets     = [];
  let classCounts    = {};        // cumulative class count for this session
  const MAX_CAPTURE_WIDTH = 640;  // lower upload payload for smoother live detection

  // Offscreen canvas for frame capture
  const offCanvas    = document.createElement("canvas");
  const offCtx       = offCanvas.getContext("2d");

  // ── Init ────────────────────────────────────────────────────
  const healthy = await API.checkHealth();
  UI.setStatus(healthy);
  if (!healthy) UI.toast("⚠️ API offline — start Flask on port 5000","err",6000);

  try {
    const info = await API.getInfo();
    lsModel.textContent = info.model.replace(".pt","");
  } catch {}

  // Slider sync
  camConf.addEventListener("input", ()=>camConfV.textContent=camConf.value);
  camIou.addEventListener("input",  ()=>camIouV.textContent=camIou.value);

  // ── Enumerate cameras ────────────────────────────────────────
  async function listCameras() {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const cams  = devs.filter(d=>d.kind==="videoinput");
      camSelect.innerHTML = '<option value="">Default Camera</option>' +
        cams.map((c,i)=>`<option value="${c.deviceId}">${c.label||`Camera ${i+1}`}</option>`).join("");
    } catch {}
  }
  await listCameras();

  // ── Start camera ─────────────────────────────────────────────
  startBtn.addEventListener("click", startCamera);
  async function startCamera() {
    try {
      if (running) stopCamera(true);
      startBtn.disabled = true;
      const deviceId = camSelect.value;
      const constraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width:    { ideal: 1280 },
          height:   { ideal: 720 },
          frameRate:{ ideal: 30 },
        }
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      await video.play();

      // Enumerate cameras again now that we have permission
      await listCameras();

      // Wait for video metadata only if not already available
      if (video.readyState < 1) {
        await new Promise((res, rej) => {
          const timeout = setTimeout(() => rej(new Error("Camera metadata timeout")), 6000);
          video.addEventListener("loadedmetadata", () => {
            clearTimeout(timeout);
            res();
          }, { once: true });
        });
      }

      running = true;
      overlay.style.display = "none";
      recIndicator.style.display = "flex";
      startBtn.disabled = false;
      stopBtn.disabled  = false;
      snapBtn.disabled  = false;
      startBtn.textContent = "🔄 Restart";

      setStatus("ACTIVE");
      UI.toast("📷 Camera started — detecting objects…","ok");

      startDetectionLoop();

    } catch (err) {
      startBtn.disabled = false;
      showError(`Camera error: ${err.message}`);
      UI.toast(`❌ Camera: ${err.message}`,"err",5000);
    }
  }

  // ── Stop camera ───────────────────────────────────────────────
  stopBtn.addEventListener("click", stopCamera);
  function stopCamera(silent = false) {
    running = false;
    clearInterval(frameTimer);
    clearInterval(fpsTimer);
    frameTimer = null;
    fpsTimer = null;
    if (stream) { stream.getTracks().forEach(t=>t.stop()); stream=null; }
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    overlay.style.display     = "flex";
    recIndicator.style.display = "none";
    stopBtn.disabled = true;
    snapBtn.disabled = true;
    startBtn.disabled = false;
    startBtn.textContent = "📷 Start Camera";
    setStatus("IDLE");
    lsFPS.textContent     = "—";
    lsLatency.textContent = "—";
    fpsDisplay.textContent = "";
    if (!silent) UI.toast("⏹ Camera stopped","inf");
  }

  // ── Detection loop ────────────────────────────────────────────
  function startDetectionLoop() {
    clearInterval(frameTimer);
    const fps      = parseInt(fpsSelect.value) || 10;
    const interval = Math.round(1000 / fps);

    frameTimer = setInterval(async ()=>{
      if (!running || detecting) return;
      await captureAndDetect();
    }, interval);

    // FPS counter
    clearInterval(fpsTimer);
    fpsTimer = setInterval(()=>{
      if (!running) return;
      const now   = Date.now();
      const secs  = (now - lastFpsTime) / 1000;
      const fps   = Math.round(fpsCount / secs);
      lsFPS.textContent      = fps;
      fpsDisplay.textContent = `${fps} FPS · ${totalFrames} frames`;
      fpsCount   = 0;
      lastFpsTime = now;
    }, 1000);
  }

  // ── Capture frame + send to API ───────────────────────────────
  async function captureAndDetect() {
    if (!video.readyState || video.readyState < 2) return;
    detecting = true;

    try {
      // Sync canvas size to video
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) { detecting=false; return; }

      // Only reset canvas size when it actually changes (prevents clearing canvas every frame)
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width  = vw;
        canvas.height = vh;
      }
      const scale = Math.min(1, MAX_CAPTURE_WIDTH / vw);
      const captureW = Math.max(1, Math.round(vw * scale));
      const captureH = Math.max(1, Math.round(vh * scale));
      if (offCanvas.width !== captureW || offCanvas.height !== captureH) {
        offCanvas.width  = captureW;
        offCanvas.height = captureH;
      }

      // Capture frame
      offCtx.drawImage(video, 0, 0, captureW, captureH);

      // Encode as base64 JPEG (lower quality to reduce network/CPU overhead)
      const frameB64 = offCanvas.toDataURL("image/jpeg", 0.5);

      // Get filter classes
      const classes = camClsFilter.value.trim().split(",").map(s=>s.trim()).filter(Boolean);

      const t0  = Date.now();
      const res = await API.detectFrame(frameB64, {
        confidence: parseFloat(camConf.value),
        iou:        parseFloat(camIou.value),
        classes,
        includeFrame: false,
      });
      const latency = Date.now() - t0;

      totalFrames++;
      fpsCount++;

      if (res.success && res.data) {
        const d = res.data;
        latestDets = d.detections || [];

        // Always draw boxes in browser for lower latency.
        drawBoxesBrowser(
          d.detections,
          vw,
          vh,
          d.image_size?.width || captureW,
          d.image_size?.height || captureH
        );

        // Update stats panel
        lsObjects.textContent = d.total_objects;
        lsLatency.textContent = `${latency}ms`;
        lsFrames.textContent  = totalFrames;

        // Update class counts
        Object.entries(d.class_summary||{}).forEach(([k,v])=>{
          classCounts[k] = (classCounts[k]||0) + v;
        });

        updateDetList(d.detections);
        updateMiniChart(d.class_summary);
      }

    } catch (err) {
      // Silent fail for frame errors — connection may be slow
      console.warn("Frame detection error:", err.message);
    } finally {
      detecting = false;
    }
  }

  // ── Draw server-annotated frame ────────────────────────────────
  function drawAnnotatedFrame(b64, vw, vh) {
    const img = new Image();
    img.onload = ()=>{
      ctx.clearRect(0, 0, vw, vh);   // pehle clear karo ghost frames se bachne ke liye
      ctx.drawImage(img, 0, 0, vw, vh);
    };
    img.src    = "data:image/jpeg;base64," + b64;
  }

  // ── Browser-side box drawing (low-latency path) ────────────────
  function drawBoxesBrowser(dets, vw, vh, srcW=vw, srcH=vh) {
    ctx.clearRect(0, 0, vw, vh);
    const sx = vw / srcW;
    const sy = vh / srcH;
    const PALETTE = [
      "#ff3838","#ff9d97","#ff701f","#ffb21d","#cfd231","#48f90a","#92cc17","#3ddb86",
      "#1a9334","#00d4c5","#2c99a8","#00c2ff","#344593","#6473ff","#0018ec","#8438ff",
      "#520085","#cb38ff","#ff95c8","#ff37c7",
    ];
    dets.forEach(det=>{
      const x1 = Math.round(det.bbox.x1 * sx);
      const y1 = Math.round(det.bbox.y1 * sy);
      const x2 = Math.round(det.bbox.x2 * sx);
      const y2 = Math.round(det.bbox.y2 * sy);
      const col = PALETTE[det.class_id % PALETTE.length];
      const w   = x2-x1, h=y2-y1;

      // Box fill (semi-transparent)
      ctx.fillStyle = col + "1A";
      ctx.fillRect(x1,y1,w,h);

      // Border
      ctx.strokeStyle = col;
      ctx.lineWidth   = 2;
      ctx.strokeRect(x1,y1,w,h);

      // Corner marks
      const m=12;
      ctx.lineWidth=3;
      [[x1,y1,m,0,0,m],[x2,y1,-m,0,0,m],[x1,y2,m,0,0,-m],[x2,y2,-m,0,0,-m]].forEach(([cx,cy,dx,_,__,dy])=>{
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+dx,cy); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy+dy); ctx.stroke();
      });

      // Label background
      const label  = `${det.class_name} ${(det.confidence*100).toFixed(0)}%`;
      ctx.font     = "bold 12px JetBrains Mono, monospace";
      const tw     = ctx.measureText(label).width;
      const lh     = 18;
      const ly     = Math.max(y1-2, lh);
      ctx.fillStyle= col;
      ctx.fillRect(x1, ly-lh, tw+10, lh+2);
      ctx.fillStyle="#000";
      ctx.fillText(label, x1+5, ly-3);
    });

    // HUD top bar
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0,0,vw,28);
    ctx.fillStyle = "#00e5ff";
    ctx.font      = "11px JetBrains Mono, monospace";
    ctx.fillText(`YOLOv8  |  ${dets.length} objects  |  COCO-80`, 10, 19);
  }

  // ── Update live detection list ──────────────────────────────────
  function updateDetList(dets) {
    if (dets.length === 0) {
      liveDets.innerHTML='<div style="font-size:12px;color:var(--text3);font-family:var(--mono)">No objects in frame…</div>';
      return;
    }
    const PALETTE = ["#ff3838","#ff9d97","#ff701f","#ffb21d","#cfd231","#48f90a","#92cc17","#3ddb86","#1a9334","#00d4c5"];
    liveDets.innerHTML = dets.map(d=>{
      const col=PALETTE[d.class_id%PALETTE.length];
      return `<div class="live-det-item" style="border-left-color:${col}">
        <div class="ldi-name" style="color:${col}">${d.class_name}</div>
        <div class="ldi-conf">${(d.confidence*100).toFixed(1)}%</div>
      </div>`;
    }).join("");
  }

  // ── Mini chart (current frame) ──────────────────────────────────
  function updateMiniChart(summary) {
    const rows=Object.entries(summary).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const max=rows[0]?.[1]||1;
    const PALETTE=["#ff3838","#48f90a","#00c2ff","#ffb21d","#cb38ff"];
    miniChart.innerHTML=rows.map(([n,c],i)=>{
      const pct=(c/max*100).toFixed(0);
      return `<div class="mc-row">
        <span class="mc-name">${n}</span>
        <div class="mc-track"><div class="mc-fill" style="width:${pct}%;background:${PALETTE[i%PALETTE.length]}"></div></div>
        <span class="mc-cnt">${c}</span>
      </div>`;
    }).join("");
  }

  // ── Snapshot ────────────────────────────────────────────────────
  snapBtn.addEventListener("click", takeSnapshot);
  function takeSnapshot() {
    if (!running) return;

    // Flash effect
    snapFlash.classList.add("flash");
    setTimeout(()=>snapFlash.classList.remove("flash"), 200);

    // ── FIX: Composite snapshot = video frame + detection overlay ──
    // canvas sirf transparent overlay hai, video uske neeche hai.
    // Direct canvas.toDataURL() karne se black image aati thi.
    // Ab ek composite canvas banate hain jisme video + annotations dono honge.
    const snapCanvas = document.createElement("canvas");
    snapCanvas.width  = video.videoWidth  || canvas.width;
    snapCanvas.height = video.videoHeight || canvas.height;
    const snapCtx = snapCanvas.getContext("2d");

    // Step 1: Draw the live video frame as background
    snapCtx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);

    // Step 2: Draw detection overlay on top (canvas has bounding boxes)
    if (canvas.width > 0 && canvas.height > 0) {
      snapCtx.drawImage(canvas, 0, 0, snapCanvas.width, snapCanvas.height);
    }

    const snap = snapCanvas.toDataURL("image/jpeg", 0.92);

    // Remove placeholder text
    const noSnaps=snapsStrip.querySelector(".no-snaps");
    if (noSnaps) noSnaps.remove();

    // Add thumbnail
    const thumb = document.createElement("img");
    thumb.className = "snap-thumb";
    thumb.src       = snap;
    thumb.title     = `Snapshot ${new Date().toLocaleTimeString()}`;
    thumb.addEventListener("click", ()=>{
      UI.dlUrl(snap, `snapshot_${Date.now()}.jpg`);
    });
    snapsStrip.insertBefore(thumb, snapsStrip.firstChild);

    // Keep max 10 snapshots
    const thumbs = snapsStrip.querySelectorAll(".snap-thumb");
    if (thumbs.length > 10) thumbs[thumbs.length-1].remove();

    UI.toast("📸 Snapshot saved — click thumbnail to download","ok");
  }

  // ── FPS select change ────────────────────────────────────────────
  fpsSelect.addEventListener("change", ()=>{
    if (running) { clearInterval(frameTimer); startDetectionLoop(); }
  });

  // ── Status helper ────────────────────────────────────────────────
  function setStatus(st) {
    lsStatus.textContent = st;
    lsStatus.style.color = st==="ACTIVE"?"var(--acc2)":st==="IDLE"?"var(--text3)":"var(--danger)";
  }

  function showError(msg) {
    errMsg.textContent = msg;
    errBar.classList.remove("hidden");
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────
  document.addEventListener("keydown", e=>{
    if (e.code==="Space" && running) { e.preventDefault(); takeSnapshot(); }
    if (e.code==="KeyS"  && !running) startCamera();
    if (e.code==="KeyX"  &&  running) stopCamera();
  });

});

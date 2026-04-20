/* main.js — Image Detection Page */
document.addEventListener("DOMContentLoaded", async () => {
  const dz=document.getElementById("dz"),
        dzIdle=document.getElementById("dzIdle"),
        dzPreview=document.getElementById("dzPreview"),
        prevImg=document.getElementById("prevImg"),
        fileIn=document.getElementById("fileIn"),
        dzBrowse=document.getElementById("dzBrowse"),
        clearBtn=document.getElementById("clearBtn"),
        confS=document.getElementById("confS"), confV=document.getElementById("confV"),
        iouS=document.getElementById("iouS"),   iouV=document.getElementById("iouV"),
        clsFilter=document.getElementById("clsFilter"),
        runBtn=document.getElementById("runBtn"), ring=document.getElementById("ring"),
        runLabel=document.getElementById("runLabel"),
        emptyState=document.getElementById("emptyState"),
        resultWrap=document.getElementById("resultWrap"),
        resImg=document.getElementById("resImg"),
        imgHud=document.getElementById("imgHud"),
        metrics=document.getElementById("metrics"),
        classPills=document.getElementById("classPills"),
        tbody=document.getElementById("tbody"),
        chart=document.getElementById("chart"),
        actions=document.getElementById("actions"),
        dlBtn=document.getElementById("dlBtn"),
        jsonBtn=document.getElementById("jsonBtn"),
        jsonModal=document.getElementById("jsonModal"),
        jsonPre=document.getElementById("jsonPre"),
        mClose=document.getElementById("mClose"),
        copyJson=document.getElementById("copyJson");

  let file=null, lastData=null;

  // Health check
  const ok = await API.checkHealth();
  UI.setStatus(ok);
  if (!ok) UI.toast("⚠️ API offline — start Flask on port 5000","err",6000);

  try { const i=await API.getInfo(); document.getElementById("cChip").textContent=i.total_classes; } catch{}

  // Sliders
  UI.syncSlider("confS","confV"); UI.syncSlider("iouS","iouV");

  // Drop zone
  dzBrowse.onclick = e => { e.stopPropagation(); fileIn.click(); };
  dz.onclick = () => { if (!file) fileIn.click(); };
  fileIn.onchange = e => setFile(e.target.files[0]);
  clearBtn.onclick = clear;

  dz.addEventListener("dragover",  e=>{ e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", ()=>dz.classList.remove("drag"));
  dz.addEventListener("drop", e=>{ e.preventDefault(); dz.classList.remove("drag"); setFile(e.dataTransfer.files[0]); });

  // Paste
  document.addEventListener("paste", e=>{
    const it=[...e.clipboardData.items].find(i=>i.type.startsWith("image/"));
    if (it) setFile(it.getAsFile());
  });

  function setFile(f) {
    if (!f||!f.type.startsWith("image/")) { UI.toast("Image file select karo","err"); return; }
    file = f;
    const rd=new FileReader();
    rd.onload = e=>{ prevImg.src=e.target.result; dzIdle.classList.add("hidden"); dzPreview.classList.remove("hidden"); };
    rd.readAsDataURL(f);
    runBtn.disabled = false;
  }

  function clear() {
    file=null; fileIn.value=""; prevImg.src="";
    dzIdle.classList.remove("hidden"); dzPreview.classList.add("hidden");
    runBtn.disabled=true; showEmpty();
  }

  function showEmpty() {
    emptyState.classList.remove("hidden"); resultWrap.classList.add("hidden");
    actions.classList.add("hidden"); lastData=null;
  }

  // Detect
  runBtn.onclick = run;
  async function run() {
    if (!file) return;
    runBtn.disabled=true; ring.classList.remove("hidden"); runLabel.textContent="Detecting…";

    try {
      const cls = clsFilter.value.trim().split(",").map(s=>s.trim()).filter(Boolean);
      const res = await API.detectImage(file,{confidence:+confS.value,iou:+iouS.value,classes:cls});
      lastData   = res.data;
      render(lastData);
      UI.toast(`✅ ${lastData.total_objects} objects · ${lastData.inference_time_ms}ms`,"ok");
    } catch(e) {
      UI.toast(`❌ ${e.message}`,"err",5000);
    } finally {
      runBtn.disabled=false; ring.classList.add("hidden"); runLabel.textContent="Run Detection";
    }
  }

  function render(d) {
    emptyState.classList.add("hidden"); resultWrap.classList.remove("hidden"); actions.classList.remove("hidden");
    // Image
    const url=API.resUrl(d.result_image_url);
    resImg.src = url||prevImg.src;
    imgHud.textContent = `⚡ ${d.inference_time_ms}ms${d.mock_mode?" · DEMO":""}`;
    // Metrics
    metrics.innerHTML = [
      UI.metric(d.total_objects,"Objects"),
      UI.metric(Object.keys(d.class_summary).length,"Classes"),
      UI.metric(`${d.inference_time_ms}ms`,"Time"),
      UI.metric(`${d.image_size.width}×${d.image_size.height}`,"Size"),
    ].join("");
    // Pills
    classPills.innerHTML = Object.entries(d.class_summary).map(([n],i)=>UI.badge(n,i)).join("");
    // Table
    tbody.innerHTML = d.detections.length
      ? d.detections.map((det,i)=>UI.row(det,i)).join("")
      : `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">No objects at threshold ${d.conf_threshold}</td></tr>`;
    // Chart
    const entries=Object.entries(d.class_summary).sort((a,b)=>b[1]-a[1]);
    const max=entries[0]?.[1]||1;
    chart.innerHTML = entries.map(([n,c],i)=>{
      const col=UI.color(i); const pct=(c/max*100).toFixed(1);
      return `<div class="ch-row">
        <span class="ch-lbl">${n}</span>
        <div class="ch-track"><div class="ch-fill" style="width:${pct}%;background:${col}"></div></div>
        <span class="ch-cnt">${c}</span>
      </div>`;
    }).join("");
  }

  // Download
  dlBtn.onclick = ()=>{
    if (!lastData?.result_image_url) { UI.toast("No result image","err"); return; }
    UI.dlUrl(API.resUrl(lastData.result_image_url),"detection.jpg");
  };

  // JSON Modal
  jsonBtn.onclick  = ()=>{ jsonPre.textContent=JSON.stringify(lastData,null,2); jsonModal.classList.remove("hidden"); };
  mClose.onclick   = ()=>jsonModal.classList.add("hidden");
  jsonModal.onclick= e=>{ if(e.target===jsonModal) jsonModal.classList.add("hidden"); };
  copyJson.onclick = ()=>{ navigator.clipboard.writeText(jsonPre.textContent); UI.toast("Copied!","ok"); };

  // Pick up class filter from sessionStorage
  const stored = sessionStorage.getItem("ods_class_filter");
  if (stored) { clsFilter.value=stored; sessionStorage.removeItem("ods_class_filter"); }
});

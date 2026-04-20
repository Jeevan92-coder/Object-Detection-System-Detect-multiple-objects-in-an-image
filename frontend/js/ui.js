/* ui.js — shared UI utilities */
const UI = (() => {
  const PAL = [
    "#ff3838","#ff9d97","#ff701f","#ffb21d","#cfd231","#48f90a","#92cc17","#3ddb86",
    "#1a9334","#00d4c5","#2c99a8","#00c2ff","#344593","#6473ff","#0018ec","#8438ff",
    "#520085","#cb38ff","#ff95c8","#ff37c7",
  ];
  const color  = id => PAL[id % PAL.length];
  let toastTmr = null;

  function setStatus(online) {
    const dot=document.getElementById("sdot"), txt=document.getElementById("stxt");
    if (!dot||!txt) return;
    dot.className = "sdot "+(online?"on":"off");
    txt.textContent = online?"API Online":"API Offline";
  }

  function toast(msg, type="inf", ms=3400) {
    const el=document.getElementById("toast"); if(!el) return;
    el.textContent=msg; el.className=`toast ${type} show`; el.style.display="block";
    clearTimeout(toastTmr);
    toastTmr=setTimeout(()=>{ el.classList.remove("show"); setTimeout(()=>el.style.display="none",300); }, ms);
  }

  function metric(val, lbl) {
    return `<div class="mc"><div class="mc-val">${val}</div><div class="mc-lbl">${lbl}</div></div>`;
  }

  function badge(name, cid) {
    const c=color(cid);
    return `<span class="cpill" style="background:${c}22;border:1px solid ${c}55;color:${c}">${name}</span>`;
  }

  function confBar(v) {
    const pct=(v*100).toFixed(1);
    const c = v>.7?"var(--acc2)":v>.4?"var(--acc)":"var(--acc3)";
    return `<div class="conf-row">
      <div class="cbar" style="width:${Math.round(v*70)}px;background:${c}"></div>
      <span style="font-family:var(--mono);font-size:11px;color:${c}">${pct}%</span>
    </div>`;
  }

  function chart(containerId, summary) {
    const el=document.getElementById(containerId); if(!el) return;
    const rows=Object.entries(summary).sort((a,b)=>b[1]-a[1]);
    const max=rows[0]?.[1]||1;
    el.innerHTML=rows.map(([n,c],i)=>{
      const pct=(c/max*100).toFixed(1); const col=PAL[i%PAL.length];
      return `<div class="ch-row">
        <span class="ch-lbl">${n}</span>
        <div class="ch-track"><div class="ch-fill" style="width:${pct}%;background:${col}"></div></div>
        <span class="ch-cnt">${c}</span>
      </div>`;
    }).join("");
  }

  function row(det, i) {
    const b=det.bbox; const c=color(det.class_id);
    return `<tr style="animation-delay:${i*.04}s">
      <td class="mono12">${i+1}</td>
      <td>${badge(det.class_name, det.class_id)}</td>
      <td>${confBar(det.confidence)}</td>
      <td class="mono12">${b.x1},${b.y1} → ${b.x2},${b.y2}</td>
      <td class="mono12">${det.area_px.toLocaleString()}px²</td>
    </tr>`;
  }

  function syncSlider(sid, vid) {
    const s=document.getElementById(sid), v=document.getElementById(vid);
    if (s&&v) s.addEventListener("input",()=>v.textContent=s.value);
  }

  function fmtSize(b) {
    if (b<1024) return `${b}B`;
    if (b<1048576) return `${(b/1024).toFixed(1)}KB`;
    return `${(b/1048576).toFixed(1)}MB`;
  }

  function dlUrl(url, fn) {
    const a=Object.assign(document.createElement("a"),{href:url,download:fn});
    document.body.appendChild(a); a.click(); a.remove();
  }

  return { color, setStatus, toast, metric, badge, confBar, chart, row, syncSlider, fmtSize, dlUrl };
})();

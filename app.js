/* number-plate-reader — preprocess + Tesseract OCR + plate extraction */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const LS='plates-history-v1';
let worker=null;
function esc(s){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function setStatus(t,err){$('status').textContent=t;$('status').classList.toggle('err',!!err)}

/* ---------- preprocessing: grayscale → contrast stretch → unsharp-ish → upscale ---------- */
function preprocess(srcCanvas){
  const minW=1200;
  const scale=Math.max(1,minW/srcCanvas.width);
  const w=Math.round(srcCanvas.width*scale),h=Math.round(srcCanvas.height*scale);
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d');
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(srcCanvas,0,0,w,h);
  const img=ctx.getImageData(0,0,w,h),d=img.data;
  const gray=new Float32Array(w*h);
  let mn=255,mx=0;
  for(let i=0;i<w*h;i++){
    const g=0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2];
    gray[i]=g;if(g<mn)mn=g;if(g>mx)mx=g;
  }
  const range=Math.max(20,mx-mn);
  for(let i=0;i<w*h;i++){
    let v=(gray[i]-mn)*255/range;
    // mild threshold toward bimodal
    v=v>150?Math.min(255,v*1.15):v*0.85;
    const b=Math.max(0,Math.min(255,v));
    d[i*4]=d[i*4+1]=d[i*4+2]=b;d[i*4+3]=255;
  }
  ctx.putImageData(img,0,0);
  return c;
}

/* ---------- plate candidate extraction ---------- */
function extractPlate(rawText){
  const cleaned=rawText.toUpperCase().replace(/[^A-Z0-9\s\-]/g,' ');
  const tokens=cleaned.split(/[\s\-]+/).filter(t=>t.length>=2);
  const joined=cleaned.replace(/[^A-Z0-9]/g,'');
  const cands=[];
  const push=(t,bonus)=>{
    if(t.length<4||t.length>12)return;
    const letters=(t.match(/[A-Z]/g)||[]).length,digits=(t.match(/[0-9]/g)||[]).length;
    if(!letters||!digits)return;
    // common OCR confusions in digit-dense stretches
    let score=t.length*2+bonus;
    if(/^[A-Z]{1,3}[0-9]/.test(t))score+=4;            // starts letters→digits (IN/EU style)
    if(/[0-9][A-Z]{1,3}[0-9]/.test(t))score+=4;        // sandwiched letters (IN style)
    if(/^[0-9]/.test(t)&&/[A-Z]$/.test(t))score+=1;
    cands.push({t,score});
  };
  tokens.forEach(t=>push(t,0));
  // also try adjacent token joins (plates often OCR with spaces)
  for(let i=0;i<tokens.length-1;i++)push(tokens[i]+tokens[i+1],3);
  if(joined.length>=5&&joined.length<=12)push(joined,2);
  if(!cands.length)return null;
  cands.sort((a,b)=>b.score-a.score);
  return cands[0].t;
}

/* ---------- OCR ---------- */
async function ensureWorker(onProgress){
  if(worker)return worker;
  worker=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.status&&onProgress)onProgress(m)}});
  await worker.setParameters({tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',tessedit_pageseg_mode:'6'});
  return worker;
}
async function readPlate(canvas,onProgress){
  const w=await ensureWorker(onProgress);
  const res=await w.recognize(canvas);
  const raw=res.data.text||'';
  const conf=res.data.confidence||0;
  const plate=extractPlate(raw);
  return{raw,conf,plate};
}

/* ---------- UI ---------- */
async function handleFile(file){
  if(!file)return;
  setStatus('Loading image…');
  $('result').classList.add('hidden');
  const bmp=await createImageBitmap(file).catch(()=>null);
  if(!bmp){setStatus('Could not read that image.',1);return}
  const co=$('c-orig');co.width=bmp.width;co.height=bmp.height;
  co.getContext('2d').drawImage(bmp,0,0);
  const cp=preprocess(co);
  const pc=$('c-proc');pc.width=cp.width;pc.height=cp.height;
  pc.getContext('2d').drawImage(cp,0,0);
  $('stages').classList.remove('hidden');
  setStatus('Preparing OCR engine…');
  try{
    const {raw,conf,plate}=await readPlate(cp,m=>{
      if(m.status==='recognizing text')setStatus('Reading… '+Math.round(m.progress*100)+'%');
      else if(m.status)setStatus(m.status.replace(/\b\w/g,c=>c.toUpperCase())+'…');
    });
    $('raw-text').textContent=raw.trim()||'(empty)';
    $('conf-bar').style.width=Math.max(2,conf)+'%';
    $('conf-num').textContent=Math.round(conf)+'%';
    if(plate){
      $('plate-text').textContent=plate;
      setStatus('Done.');
      addHistory(plate,conf);
    }else{
      $('plate-text').textContent='—';
      setStatus('No plate-like text found. Try a closer, straighter shot.',1);
    }
    $('result').classList.remove('hidden');
    $('result').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(e){
    setStatus('OCR failed: '+(e.message||e),1);
  }
}
function addHistory(plate,conf){
  let h=[];try{h=JSON.parse(localStorage.getItem(LS)||'[]')}catch(e){}
  h.unshift({plate,conf:Math.round(conf),at:Date.now()});
  h=h.slice(0,10);localStorage.setItem(LS,JSON.stringify(h));renderHistory();
}
function renderHistory(){
  let h=[];try{h=JSON.parse(localStorage.getItem(LS)||'[]')}catch(e){}
  $('hist-list').innerHTML=h.length?h.map(x=>`<div class="hist-row"><span class="mono">${esc(x.plate)}</span><span class="hint">${x.conf}% · ${new Date(x.at).toLocaleString()}</span></div>`).join(''):'<p class="hint">Nothing read yet.</p>';
  $('clear-hist').classList.toggle('hidden',!h.length);
}
document.addEventListener('DOMContentLoaded',()=>{
  const drop=$('drop');
  drop.onclick=()=>$('file').click();
  drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')$('file').click()};
  $('file').onchange=e=>handleFile(e.target.files[0]);
  ['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over')}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over')}));
  drop.addEventListener('drop',e=>handleFile(e.dataTransfer.files[0]));
  $('copy').onclick=()=>{navigator.clipboard.writeText($('plate-text').textContent).then(()=>pkToast('Copied'))};
  $('retry').onclick=()=>{$('file').click()};
  $('clear-hist').onclick=()=>{localStorage.setItem(LS,'[]');renderHistory()};
  renderHistory();
  // test hook: run the full pipeline on a data-URL image
  window.__plateTest=async(dataURL)=>{
    const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=dataURL});
    const co=$('c-orig');co.width=img.width;co.height=img.height;
    co.getContext('2d').drawImage(img,0,0);
    const cp=preprocess(co);
    return readPlate(cp,()=>{});
  };
});
})();

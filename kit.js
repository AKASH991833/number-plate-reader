/* ProKit shared runtime: theme, PWA, toasts, tabs */
(function(){
  const root=document.documentElement;
  const saved=localStorage.getItem('pk-theme');
  if(saved){root.dataset.theme=saved}
  else if(matchMedia('(prefers-color-scheme: dark)').matches){root.dataset.theme='dark'}
  else{root.dataset.theme='light'}
  window.pkToggleTheme=function(){
    const t=root.dataset.theme==='dark'?'light':'dark';
    root.dataset.theme=t;localStorage.setItem('pk-theme',t);
  };
  window.pkToast=function(msg,ms){
    let box=document.querySelector('.toast-box');
    if(!box){box=document.createElement('div');box.className='toast-box';document.body.appendChild(box)}
    const t=document.createElement('div');t.className='toast';t.textContent=msg;box.appendChild(t);
    setTimeout(()=>{t.style.transition='.3s';t.style.opacity='0';setTimeout(()=>t.remove(),320)},ms||2600);
  };
  window.pkTabs=function(scope){
    (scope||document).querySelectorAll('.tabs').forEach(bar=>{
      bar.addEventListener('click',e=>{
        const b=e.target.closest('button[data-tab]');if(!b)return;
        bar.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
        const host=bar.parentElement;
        host.querySelectorAll('[data-tab-panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.tabPanel!==b.dataset.tab));
      });
    });
  };
  // PWA install
  let deferred=null;
  addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;const b=document.getElementById('pwa-install');if(b)b.classList.remove('hidden')});
  window.pkInstall=async function(){if(deferred){deferred.prompt();deferred=null}};
  if('serviceWorker' in navigator && location.protocol.startsWith('http')){
    addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
  }
  // file drop helper: pkDrop(el, {onText, onFiles})
  window.pkDrop=function(el,opts){
    el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('over')});
    el.addEventListener('dragleave',()=>el.classList.remove('over'));
    el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('over');if(opts.onFiles)opts.onFiles(e.dataTransfer.files)});
    el.addEventListener('click',()=>{if(el.dataset.noclick)return;const i=document.createElement('input');i.type='file';if(opts.accept)i.accept=opts.accept;if(opts.multiple)i.multiple=true;i.onchange=()=>opts.onFiles&&opts.onFiles(i.files);i.click()});
  };
  window.pkDownload=function(name,content,type){
    const blob=content instanceof Blob?content:new Blob([content],{type:type||'text/plain'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  };
  window.pkCopy=function(text){navigator.clipboard.writeText(text).then(()=>pkToast('Copied to clipboard'))};
  // csv esc
  window.pkCsv=function(rows){return rows.map(r=>r.map(c=>{c=String(c==null?'':c);return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c}).join(',')).join('\n')};
})();

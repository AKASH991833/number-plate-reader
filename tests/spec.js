module.exports=async(page)=>{
  // build a synthetic plate photo in-page and run the real pipeline on it
  const result=await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=760;c.height=140;
    const x=c.getContext('2d');
    x.fillStyle='#f4f4f0';x.fillRect(0,0,760,140);
    x.fillStyle='#111';x.fillRect(0,0,760,6);x.fillRect(0,134,760,6);x.fillRect(0,0,6,140);x.fillRect(754,0,6,140);
    x.font='700 68px "JetBrains Mono", monospace';
    x.textAlign='center';x.textBaseline='middle';
    x.fillText('KA 01 MJ 4422',380,74);
    // light noise
    const im=x.getImageData(0,0,760,140),d=im.data;
    for(let i=0;i<d.length;i+=4){const n=(Math.random()-0.5)*16;d[i]+=n;d[i+1]+=n;d[i+2]+=n}
    x.putImageData(im,0,0);
    return window.__plateTest(c.toDataURL('image/png'));
  });
  if(!result.plate)throw new Error('no plate extracted from synthetic image. raw='+JSON.stringify(result.raw));
  const digitsOk=/4422/.test(result.plate)&&/01/.test(result.plate);
  const lettersOk=/K/.test(result.plate)&&/A/.test(result.plate);
  if(!digitsOk||!lettersOk)throw new Error('plate misread: '+result.plate+' (raw='+JSON.stringify(result.raw)+', conf='+result.conf+')');
  // history UI renders
  const hist=await page.$eval('#hist-list',e=>e.textContent);
  return `OCR read "${result.plate}" (conf ${Math.round(result.conf)}%) from synthetic plate; history visible=${/Nothing read yet/.test(hist)?'empty-state':'rows'}`;
};

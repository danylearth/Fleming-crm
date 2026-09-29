export function cropSignatureCanvas(source) {
  const ctx=source.getContext('2d'),{data}=ctx.getImageData(0,0,source.width,source.height);
  let left=source.width,top=source.height,right=-1,bottom=-1;
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(data[(y*source.width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if(right<left)return source;
  const padding=12,width=right-left+1,height=bottom-top+1,result=document.createElement('canvas');
  result.width=width+padding*2;result.height=height+padding*2;
  result.getContext('2d').drawImage(source,left,top,width,height,padding,padding,width,height);
  return result;
}
export function signatureEditor({canvas, name, apply, label='Signature'}) {
  const dialog=document.createElement('dialog');dialog.className='signature-dialog';dialog.setAttribute('aria-labelledby','signature-editor-title');
  dialog.innerHTML=`<div class="signature-dialog-heading"><div><h2 id="signature-editor-title">Add Your ${label}</h2><p>Choose a style or draw with your finger or mouse.</p></div><button type="button" class="signature-close" aria-label="Close Signature Editor">✕</button></div>
  <div class="signature-tabs" role="tablist" aria-label="Signature Method"><button type="button" role="tab" aria-selected="true" id="signature-type-tab" aria-controls="signature-type-panel">Type</button><button type="button" role="tab" aria-selected="false" id="signature-draw-tab" aria-controls="signature-draw-panel">Draw</button></div>
  <div id="signature-type-panel" role="tabpanel" aria-labelledby="signature-type-tab"><label for="signature-editor-name">${label==='Initials'?'Initials':'Full Name'}</label><input id="signature-editor-name" readonly><div class="signature-styles"><button type="button" data-style="Georgia" aria-pressed="true"></button><button type="button" data-style="cursive" aria-pressed="false"></button></div><button type="button" class="signature-more">↻ Generate More Styles</button></div>
  <div id="signature-draw-panel" role="tabpanel" aria-labelledby="signature-draw-tab" hidden><p class="signature-instruction">Draw inside the box below.</p><canvas width="1000" height="340" aria-label="Draw Your Signature Here"></canvas><div class="signature-draw-tools"><button type="button" class="signature-clear">Clear Signature</button></div></div>
  <p class="signature-editor-status" role="status"></p><div class="signature-editor-actions"><button type="button" class="button secondary signature-cancel">Cancel</button><button type="button" class="button primary signature-apply">Apply ${label}</button></div>`;
  document.body.append(dialog);
  const draw=dialog.querySelector('canvas'),ctx=draw.getContext('2d'),typePanel=dialog.querySelector('#signature-type-panel'),drawPanel=dialog.querySelector('#signature-draw-panel'),tabs=[...dialog.querySelectorAll('[role=tab]')],styles=[...dialog.querySelectorAll('[data-style]')],message=dialog.querySelector('[role=status]');
  const variants=[{font:'Georgia',weight:400},{font:'cursive',weight:400},{font:'"Segoe Script", cursive',weight:400},{font:'"Brush Script MT", cursive',weight:400},{font:'"Palatino Linotype", serif',weight:400},{font:'"Segoe Print", cursive',weight:700}];
  let mode='type',style='Georgia',weight=400,batch=0,drawing=false,drawn=false;
  function refreshStyles(){styles.forEach((button,index)=>{const variant=variants[(batch+index)%variants.length];button.dataset.style=variant.font;button.dataset.weight=String(variant.weight);button.style.fontFamily=variant.font;button.style.fontWeight=String(variant.weight);button.textContent=name().trim()||'Your Signature';button.setAttribute('aria-pressed',String(index===0));});style=styles[0].dataset.style;weight=Number(styles[0].dataset.weight);}
  dialog.querySelector('.signature-more').onclick=()=>{batch=(batch+2)%variants.length;refreshStyles();message.textContent='';};
  function tab(next){mode=next;typePanel.hidden=next!=='type';drawPanel.hidden=next!=='draw';tabs.forEach((t,i)=>{t.setAttribute('aria-selected',String((i===0)===(next==='type')));t.tabIndex=(i===0)===(next==='type')?0:-1;});}
  tabs.forEach((t,i)=>{t.onclick=()=>tab(i?'draw':'type');t.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();tab(i?'type':'draw');tabs[1-i].focus();}};});
  styles.forEach(b=>b.onclick=()=>{style=b.dataset.style;weight=Number(b.dataset.weight||400);styles.forEach(s=>s.setAttribute('aria-pressed',String(s===b)));});
  const point=e=>{const r=draw.getBoundingClientRect();return[(e.clientX-r.left)*draw.width/r.width,(e.clientY-r.top)*draw.height/r.height];};
  const observer=new ResizeObserver(()=>{const r=draw.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=Math.min(2,devicePixelRatio||1),width=Math.round(r.width*dpr),height=Math.round(r.height*dpr);if(draw.width===width&&draw.height===height)return;const saved=document.createElement('canvas');saved.width=draw.width;saved.height=draw.height;saved.getContext('2d').drawImage(draw,0,0);draw.width=width;draw.height=height;const scale=Math.min(width/saved.width,height/saved.height),w=saved.width*scale,h=saved.height*scale;ctx.drawImage(saved,(width-w)/2,(height-h)/2,w,h);});observer.observe(draw);
  draw.tabIndex=0;
  draw.onpointerdown=e=>{e.preventDefault();draw.setPointerCapture(e.pointerId);drawing=true;ctx.beginPath();ctx.moveTo(...point(e));ctx.strokeStyle='#27083d';ctx.lineWidth=2.5*Math.min(2,devicePixelRatio||1);ctx.lineCap='round';};
  draw.onpointermove=e=>{if(drawing){e.preventDefault();ctx.lineTo(...point(e));ctx.stroke();drawn=true;}};
  draw.onpointerup=draw.onpointercancel=()=>drawing=false;
  dialog.querySelector('.signature-clear').onclick=()=>{ctx.clearRect(0,0,draw.width,draw.height);drawn=false;};
  for(const button of dialog.querySelectorAll('.signature-close,.signature-cancel'))button.onclick=()=>dialog.close();
  dialog.querySelector('.signature-apply').onclick=()=>{
    if(mode==='draw'&&!drawn){message.textContent='Please draw your signature first.';draw.focus();return;}
    const output=document.createElement('canvas');output.width=700;output.height=290;const out=output.getContext('2d');
    if(mode==='draw'){const scale=Math.min(700/draw.width,290/draw.height),w=draw.width*scale,h=draw.height*scale;out.drawImage(draw,(700-w)/2,(290-h)/2,w,h);}else{const value=name().trim();if(!value){message.textContent='Enter your full name on the form first.';return;}let size=74;out.font='italic '+weight+' '+size+'px '+style;while(out.measureText(value).width>650&&size>12){size--;out.font='italic '+weight+' '+size+'px '+style;}out.fillStyle='#27083d';out.fillText(value,24,160);}
    apply(cropSignatureCanvas(output),mode==='type');dialog.close();
  };
  const entry=document.createElement('button');entry.type='button';entry.className='signature-entry';entry.innerHTML='<span class=signature-plus aria-hidden=true>+</span><span>Add '+label+'</span>';canvas.parentElement.append(entry);
  canvas.style.pointerEvents='none';
  const open=(method='type')=>{const value=name().trim();if(!value){message.textContent='Enter your full name on the form first.';}else message.textContent='';dialog.querySelector('input').value=value;refreshStyles();tab(method);dialog.showModal();tabs[method==='type'?0:1].focus();};
  entry.onclick=()=>open();
  return {open,destroy(){observer.disconnect();dialog.remove();entry.remove();},refresh(signed){entry.innerHTML=signed?'Edit '+label:'<span class=signature-plus aria-hidden=true>+</span><span>Add '+label+'</span>';entry.classList.toggle('has-signature',signed);if(!signed){ctx.clearRect(0,0,draw.width,draw.height);drawn=false;}}};
}

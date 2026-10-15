// Keep floating dropdowns inside the usable viewport, including at browser zoom.
function positionPublicSelect(dropdown, trigger) {
 const viewport=window.visualViewport;
 const left=viewport?.offsetLeft||0, top=viewport?.offsetTop||0;
 const width=viewport?.width||window.innerWidth, height=viewport?.height||window.innerHeight;
 const rect=trigger.getBoundingClientRect(), margin=8;
 dropdown.classList.add('open');
 const desired=Math.min(250,dropdown.scrollHeight+2);
 const below=Math.max(0,top+height-rect.bottom-margin),above=Math.max(0,rect.top-top-margin);
 const upwards=below<desired&&above>below;
 const listHeight=Math.min(desired,Math.max(40,upwards?above:below),height-margin*2);
 const listWidth=Math.min(rect.width,width-margin*2);
 dropdown.style.maxHeight=listHeight+'px';
 dropdown.style.width=listWidth+'px';
 dropdown.style.left=Math.max(left+margin,Math.min(rect.left,left+width-listWidth-margin))+'px';
 dropdown.style.top=Math.max(top+margin,Math.min(upwards?rect.top-listHeight:rect.bottom,top+height-listHeight-margin))+'px';
 dropdown.classList.toggle('opens-above',upwards);
}
window.addEventListener('resize',()=>{if(typeof closeAllCustomSelects==='function')closeAllCustomSelects();});

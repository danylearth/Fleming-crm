import {useRef,useState,type ReactNode} from 'react';

export default function PropertyCarousel({children}:{children:ReactNode}) {
 const drag=useRef<{id:number;x:number;scroll:number}|null>(null);
 const suppressClick=useRef(false);
 const [dragging,setDragging]=useState(false);
 const finish=()=>{drag.current=null;setDragging(false);};
 return <div aria-label="My Properties" tabIndex={0}
  className={`flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-hide select-none [&_*]:cursor-inherit ${dragging?'cursor-grabbing':'cursor-grab'}`}
  onPointerDown={event=>{
   suppressClick.current=false;
   if(event.pointerType!=='mouse'||event.button!==0)return;
   drag.current={id:event.pointerId,x:event.clientX,scroll:event.currentTarget.scrollLeft};
  }}
  onPointerMove={event=>{
   const start=drag.current;if(!start||event.pointerId!==start.id)return;
   const distance=event.clientX-start.x;
   if(!suppressClick.current&&Math.abs(distance)<6)return;
   if(!suppressClick.current){event.currentTarget.setPointerCapture(event.pointerId);suppressClick.current=true;setDragging(true);}
   event.preventDefault();event.currentTarget.scrollLeft=start.scroll-distance;
  }}
  onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
  onPointerLeave={()=>{if(!suppressClick.current)finish();}}
  onClickCapture={event=>{if(suppressClick.current&&event.detail!==0){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}
  onDragStart={event=>event.preventDefault()}
 >{children}</div>;
}

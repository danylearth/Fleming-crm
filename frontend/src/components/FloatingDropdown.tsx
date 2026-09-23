import {useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {createPortal} from 'react-dom';
export default function FloatingDropdown({anchor,onClose,children}:{anchor:RefObject<HTMLElement|null>;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState({top:0,left:0,width:0,maxHeight:320});
 useLayoutEffect(()=>{
  const update=()=>{const r=anchor.current?.getBoundingClientRect(),menu=ref.current;if(!r||!menu)return;
   const width=Math.min(r.width,window.innerWidth-16);menu.style.width=`${width}px`;
   const height=Math.min(menu.scrollHeight,320),below=Math.max(0,window.innerHeight-r.bottom-12),above=Math.max(0,r.top-12);
   const up=below<height&&above>below,maxHeight=Math.max(40,Math.min(320,up?above:below));
   setPosition({top:up?Math.max(8,r.top-Math.min(height,maxHeight)-4):r.bottom+4,left:Math.max(8,Math.min(r.left,window.innerWidth-width-8)),width,maxHeight});};
  const outside=(e:MouseEvent)=>{if(!anchor.current?.contains(e.target as Node)&&!ref.current?.contains(e.target as Node))onClose();};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
  update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);document.addEventListener('mousedown',outside);document.addEventListener('keydown',key);
  return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',key);};
 },[anchor,onClose]);
 return createPortal(<div ref={ref} style={{...position,zIndex:10000,position:'fixed',overflowY:'auto'}} className="bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-input)] rounded-xl shadow-2xl">{children}</div>,document.body);
}

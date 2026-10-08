import {useEffect,useState} from 'react';
import {FilePenLine} from 'lucide-react';
import {Button} from '../../frontend/src/components/ui';
import {onboardingRetired} from './lifecycle.mjs';

export function retiredApplication(){
 const keys=(window as any).crmPreviewKeys;
 const data=JSON.parse(localStorage.getItem(keys.dataKey)||'{}');
 const asof=new URLSearchParams(location.search).get('asof');
 return onboardingRetired(data,asof==='2026-11-06'?asof:undefined);
}
export default function ApplicationAction(){
 const [retired,setRetired]=useState(retiredApplication);
 useEffect(()=>{const refresh=()=>setRetired(retiredApplication());const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
 return <Button variant="outline" className="preview-new-application gap-2" size="sm" onClick={()=>window.dispatchEvent(new CustomEvent('preview-reapply',{detail:{name:'Zoe'}}))}><FilePenLine size={16}/>{retired?'New Application':new URLSearchParams(location.search).get('stage')==='not-sent'?'Start New Application':'Continue Application'}</Button>;
}

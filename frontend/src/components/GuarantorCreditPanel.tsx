import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {useApi} from '../hooks/useApi';
import CreditCheckPanel from './CreditCheckPanel';
import {Button} from './ui';
export default function GuarantorCreditPanel({enquiryId,data,onSaved}:{enquiryId:number;data:Record<string,any>;onSaved:()=>Promise<void>}){
 const {token}=useAuth(),api=useApi(),endpoint='/api/tenant-enquiries/'+enquiryId+'/guarantor';
 const [error,setError]=useState('');const attempted=useRef(false);
 const complete=async()=>{try{setError('');await api.post(endpoint,{action:'verify'});await onSaved();}catch(e){setError(e instanceof Error?e.message:'Guarantor verification could not complete.');}};
 useEffect(()=>{if(data.status==='verified'||!data.record?.credit_check_completed||!data.signed||!data.witnessed||data.deedNeedsResigning||data.record?.application_review_status!=='approved'){attempted.current=false;return;}if(attempted.current)return;attempted.current=true;void complete();},[data.status,data.record?.credit_check_completed,data.record?.application_review_status,data.signed,data.witnessed,data.deedNeedsResigning]);
 const open=async(id:number,name:string,download=false)=>{const r=await fetch((import.meta.env.VITE_API_URL||'')+endpoint+'/files/'+id,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('Credit report could not be opened.');const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;if(download)a.download=name;else{a.target='_blank';a.rel='noopener';}a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};
 return <div className="min-w-0 space-y-3"><CreditCheckPanel apiBase={endpoint} enquiry={data.record} documents={data.documents||[]} onView={(id,name)=>open(id,name)} onDownload={(id,name)=>open(id,name,true)} onSaved={onSaved}/>{error&&<div role="alert" className="text-sm text-red-600">{error}<Button variant="outline" onClick={()=>void complete()}>Retry completing checks</Button></div>}</div>;
}

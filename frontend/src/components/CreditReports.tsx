import {useEffect, useState} from 'react';
import {FileText,CheckCircle} from 'lucide-react';
import {useApi} from '../hooks/useApi';
import {useAuth} from '../context/AuthContext';
import {Button, GlassCard} from './ui';

type Result = {report_date?:string;provider?:string; reference?:string; score?:string; rating?:string; active_ccjs?:number; satisfied_ccjs?:number; active_ccj_value?:number; satisfied_ccj_value?:number; insolvencies?:number; bankruptcy?:boolean};
type Report = {id:number; doc_type:string; original_name:string; uploaded_at:string; credit_check_result?:Result|null};
export default function CreditReports({tenantId}:{tenantId:number}) {
  const api=useApi(); const {token}=useAuth();
  const [reports,setReports]=useState<Report[]>([]); const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;setLoading(true);setError('');setReports([]);
    api.get(`/api/documents/tenant/${tenantId}`).then((docs:Report[])=>{if(active)setReports(docs.filter(d=>d.doc_type==='Credit Check Report'||d.doc_type==='Credit Report'));}).catch(()=>{if(active)setError('Credit reports could not be loaded.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[tenantId]); // eslint-disable-line react-hooks/exhaustive-deps
  const download=async(report:Report)=>{
    try {const response=await fetch(`${import.meta.env.VITE_API_URL||''}/api/documents/download/${report.id}`,{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)throw Error('Report download failed');
      const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=report.original_name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{setError('The report could not be downloaded. Please try again.');}
  };
  const currency=(value?:number)=>value===undefined||value===null?'Not supplied':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(value);
  return <GlassCard className={`p-5 space-y-4 ${reports.length?'!border-emerald-500/25 !bg-emerald-500/10':''}`}><h3 className="font-semibold flex items-center gap-2">{reports.length?<CheckCircle size={18} className="text-emerald-600"/>:<FileText size={18}/>}Credit Reports</h3>
    {loading&&<p className="text-sm text-[var(--text-muted)]">Loading reports...</p>}
    {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
    {!loading&&!error&&!reports.length&&<p className="text-sm text-[var(--text-muted)]">No credit report saved for this tenant.</p>}
    {reports.map((report,index)=>{const r=report.credit_check_result||{};const fields:[string,string|number][]=[
      ['Report Date',r.report_date?new Date(r.report_date+'T12:00:00').toLocaleDateString('en-GB'):'Not supplied'],['Report Reference',r.reference||'Not supplied'],['Credit Rating',r.rating?r.rating.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()):'Not supplied'],['Numeric Score',r.score||'Not supplied'],
      ['Active CCJs',r.active_ccjs??'Not supplied'],['Satisfied CCJs',r.satisfied_ccjs??'Not supplied'],['Active CCJ Value',currency(r.active_ccj_value)],['Satisfied CCJ Value',currency(r.satisfied_ccj_value)],['Insolvencies',r.insolvencies??'Not supplied'],['Bankruptcy',r.bankruptcy===true?'Recorded':r.bankruptcy===false?'None recorded':'Not supplied']];
      return <details key={report.id} className="rounded-xl border border-[var(--border-input)] p-4"><summary className="cursor-pointer text-sm font-medium">{index===0?'Latest Report':'Previous Report'} · {r.provider||'Provider not recorded'} · {r.report_date?new Date(r.report_date+'T12:00:00').toLocaleDateString('en-GB'):'Uploaded '+new Date(report.uploaded_at).toLocaleDateString('en-GB')}</summary>
        <dl className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">{fields.map(([label,value])=><div key={label}><dt className="text-xs text-[var(--text-muted)]">{label}</dt><dd className="text-sm mt-1 break-words">{value}</dd></div>)}</dl>
        <div className="flex justify-end mt-4"><Button variant="outline" size="sm" onClick={()=>download(report)}>Download Report</Button></div>
      </details>;
    })}
  </GlassCard>;
}

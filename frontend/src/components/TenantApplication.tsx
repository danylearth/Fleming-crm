import {useEffect,useRef,useState} from 'react';
import {FilePenLine} from 'lucide-react';
import {useApi} from '../hooks/useApi';
import {useAuth} from '../context/AuthContext';
import {useNotifications} from '../context/NotificationContext';
import {Button} from './ui';
import OnboardingWizard from './ui/OnboardingWizard';

interface BillingPeriod {names:string[];monthlyRent:number;rentDueDay:number}
interface Cycle {
  enquiry_id:number|null;
  transition:null|{id:number;start_date:string;previous_end_date:string;previous:BillingPeriod;next:BillingPeriod;outgoingNames:string[]};
}
const date=(value:string)=>new Date(value.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});

export function TenancyTransitionCard({transition}:{transition:Cycle['transition']}) {
  if(!transition)return null;
  return <section aria-label="Tenancy Changeover & Billing" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-slate-900 space-y-4">
    <h3 className="font-semibold">Tenancy Changeover &amp; Billing</h3>
    <p className="text-sm leading-relaxed">The new tenancy starts on {date(transition.start_date)}. The current tenancy remains active through {date(transition.previous_end_date)}.</p>
    {([['previous','Active'],['next','Scheduled']] as const).map(([key,label])=>{
      const period=transition[key];
      return <div key={key} className="rounded-xl border border-amber-200 bg-white/70 p-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2 font-semibold"><span>{period.names.join(' & ')} — {period.names.length>1?'joint':'sole'} tenancy</span><span>{label}</span></div>
        <p className="mt-2">{period.monthlyRent.toLocaleString('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2})} per month · Due day {period.rentDueDay}</p>
        <p>Billing {key==='previous'?'ends '+date(transition.previous_end_date):'starts '+date(transition.start_date)}</p>
      </div>;
    })}
    {!!transition.outgoingNames.length&&<p className="text-sm">{transition.outgoingNames.join(' & ')} {transition.outgoingNames.length>1?'move':'moves'} to archived tenants on {date(transition.start_date)}.</p>}
    <p className="text-sm">Previous tenancy documents, invoices, payments and outstanding balances remain in history.</p>
  </section>;
}

export function useTenantApplication(tenantId:number,onTenantChanged:()=>Promise<void>) {
  const api=useApi(),{user}=useAuth(),{notify}=useNotifications();
  const [cycle,setCycle]=useState<Cycle|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  // The wizard already owns its full application shape.
  const [application,setApplication]=useState<Record<string,any>|null>(null);
  const [properties,setProperties]=useState<any[]>([]),[users,setUsers]=useState<any[]>([]);
  const current=useRef({api,onTenantChanged,application,cycle});current.current={api,onTenantChanged,application,cycle};
  const initialOpen=useRef(false);
  const activeTenant=useRef(tenantId);activeTenant.current=tenantId;
  useEffect(()=>{
    initialOpen.current=false;setCycle(null);setApplication(null);setError('');setBusy(false);
    current.current.cycle=null;current.current.application=null;
  },[tenantId]);
  const close=()=>{setApplication(null);const url=new URL(location.href);url.searchParams.delete('onboarding');history.replaceState(null,'',url);};
  useEffect(()=>{
    if(!tenantId)return;
    let cancelled=false,running=false;
    const refresh=async()=>{
      if(running)return;running=true;
      try{
        const value:Cycle=await current.current.api.get(`/api/tenants/${tenantId}/onboarding-cycle`);
        if(cancelled)return;
        const old=current.current.cycle;
        setCycle(value);setError('');
        if(old?.transition&&!value.transition){close();await current.current.onTenantChanged();}
        if(!value.enquiry_id&&current.current.application?.status==='converted')close();
        if(!initialOpen.current){initialOpen.current=true;if(new URLSearchParams(location.search).get('onboarding')==='1'&&value.enquiry_id)await open(value.enquiry_id);}
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Application status could not be loaded');}
      finally{running=false;}
    };
    void refresh();const timer=setInterval(()=>void refresh(),15000);window.addEventListener('focus',refresh);
    return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[tenantId,api]);
  const open=async(enquiryId:number)=>{
    let [record,propertyRows,userRows]=await Promise.all([api.get(`/api/tenant-enquiries/${enquiryId}`),api.get('/api/properties'),api.get('/api/users')]);
    if(record.existing_tenancy_application&&!record.application_form_sent&&!record.application_form_completed&&!record.application_form_token&&['admin','manager','staff'].includes(user?.role||'')){
      await api.post(`/api/tenants/${tenantId}/new-application`,{});
      record=await api.get(`/api/tenant-enquiries/${enquiryId}`);
    }
    if(activeTenant.current!==tenantId)return;
    setApplication(record);setProperties(propertyRows);setUsers(userRows);
  };
  const update=async()=>{
    if(application){
      const [record,nextCycle]=await Promise.all([api.get(`/api/tenant-enquiries/${application.id}`),api.get(`/api/tenants/${tenantId}/onboarding-cycle`)]);
      if(activeTenant.current!==tenantId)return;
      setApplication(record);setCycle(nextCycle);
    }
    await current.current.onTenantChanged();
  };
  const action=<Button size="sm" className="!gap-2" disabled={busy||!cycle||(!cycle.enquiry_id&&Boolean(cycle.transition))||(!cycle.enquiry_id&&!['admin','manager','staff'].includes(user?.role||''))} onClick={async()=>{
    setBusy(true);try{const id=cycle?.enquiry_id||(await api.post(`/api/tenants/${tenantId}/new-application`,{})).enquiry_id;if(activeTenant.current!==tenantId)return;await open(id);const next=await api.get(`/api/tenants/${tenantId}/onboarding-cycle`);if(activeTenant.current===tenantId)setCycle(next);}catch(e){if(activeTenant.current===tenantId)notify(e instanceof Error?e.message:'Could not open the application','error');}finally{if(activeTenant.current===tenantId)setBusy(false);}
  }}><FilePenLine size={16}/>{busy?'Opening…':cycle?.enquiry_id?'Continue Application':'New Application'}</Button>;
  return {action,error,transition:cycle?.transition||null,dialog:application?<OnboardingWizard key={`${application.id}:${application.linked_property_id}`} enquiryId={application.id} enquiry={application} properties={properties} users={users} onClose={close} onUpdate={update}/>:null};
}

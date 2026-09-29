import {useEffect,useState} from 'react';
import {useApi} from './useApi';

/** Opening onboarding is recorded separately from progressing the pipeline. */
export function useOnboardingStarted(id:number|undefined,progressRecorded:boolean) {
 const api=useApi();
 const [activity,setActivity]=useState<{id:number;started:boolean}|null>(null);
 useEffect(()=>{
  if(!id)return;
  let active=true;
  void api.get(`/api/tenant-enquiries/${id}/onboarding-activity`).then(data=>{
   if(active)setActivity({id,started:Boolean(data.last_viewed_at||data.last_progressed_at)});
  }).catch(()=>{});
  return()=>{active=false;};
 },[api,id]);
 return progressRecorded||Boolean(id&&activity?.id===id&&activity.started);
}

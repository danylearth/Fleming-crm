// Marketing uses the API origin directly in production so uploads and campaign
// requests do not depend on the web host's HTML fallback/proxy response.
export function apiUrl(endpoint:string){
 const configured=import.meta.env.VITE_API_URL;
 const production=typeof window!=='undefined'&&(window.location.hostname==='crm.fleminglettings.co.uk'||window.location.hostname==='fleming-portal.vercel.app');
 const base=configured||(production&&endpoint.startsWith('/api/marketing/')?'https://fleming-crm-api.fly.dev':'');
 return `${base}${endpoint}`;
}
export async function readApiResponse(response:Response){
 const text=await response.text();
 let data;
 try{data=JSON.parse(text);}catch{
  if(response.status===413)throw new Error('The file is too large. Choose an attachment up to 8 MB.');
  throw new Error('The server returned an unexpected response. Your request could not be confirmed. Check Campaign History before retrying a send.');
 }
 if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
 return data;
}

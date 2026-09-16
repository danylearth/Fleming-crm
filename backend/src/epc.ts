const API='https://api.get-energy-performance-data.communities.gov.uk';
export async function searchEpc(postcode:string) {
 const token=process.env.EPC_API_TOKEN?.trim();
 if(!token)throw new Error('EPC setup required: sign in to Get energy performance of buildings data with GOV.UK One Login, then configure the bearer token from My Account. The old EPC API credentials no longer work.');
 const response=await fetch(`${API}/api/domestic/search?${new URLSearchParams({postcode:postcode.trim().toUpperCase(),page_size:'5000'})}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(response.status===404)return [];
 if([401,403].includes(response.status))throw new Error('The EPC access token was rejected. Update the bearer token from the government service’s My Account page.');
 if(!response.ok)throw new Error('The government EPC service is unavailable. Try again later or enter the certificate details manually.');
 const data=await response.json() as {data?:unknown};
 if(!Array.isArray(data.data))throw new Error('The government EPC service returned an unexpected response.');
 return data.data.map((r:any)=>({address:[r.addressLine1,r.addressLine2,r.addressLine3,r.addressLine4].filter(Boolean).join(', '),postcode:r.postcode,current_rating:r.currentEnergyEfficiencyBand,lodgement_date:r.registrationDate,certificate_number:r.certificateNumber})).sort((a:any,b:any)=>String(b.lodgement_date).localeCompare(String(a.lodgement_date)));
}

import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import SignatureFieldEditor from '../frontend/src/components/SignatureFieldEditor';
import SignatureRequests,{SigningPage} from '../frontend/src/components/SignatureRequests';
import TenantSmsComposer from '../frontend/src/components/TenantSmsComposer';
import Settings from '../frontend/src/pages/Settings';
import Users from '../frontend/src/pages/Users';
import Dashboard from '../frontend/src/pages/Dashboard';
import {PortfolioProvider} from '../frontend/src/context/PortfolioContext';
import {ThemeProvider} from '../frontend/src/context/ThemeContext';
import {api,sampleDraft} from './review-shim';
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,options={})=>{
 const url=String(input);
 if(url.includes('/api/signature-requests/')&&url.includes('/page/'))return nativeFetch('/assets/field-placement-source.png');
 if(url==='/api/signature-requests')return Response.json(sampleDraft(options.body));
 if(url==='/api/company-settings/preview')return Response.json({error:'This local screen preview does not generate agreements yet. The form is available for layout feedback.'},{status:400});
 if(url.includes('/api/'))return Response.json(await api.get(url));
 return nativeFetch(input,options);
};
function Review(){
 const view=new URLSearchParams(location.search).get('view')||'certificate';
 const [fields,setFields]=useState([]),[open,setOpen]=useState(true),[page,setPage]=useState(0),[signer,setSigner]=useState('1');
 if(view==='dashboard')return <Dashboard/>;
 if(view==='company')return <Settings/>;
 if(view==='team')return <Users/>;
 return <main style={{maxWidth:view==='company'?1250:1100,margin:'28px auto',padding:'0 24px'}}>
  {view==='requests'?<><h1 className="text-2xl font-bold mb-5">Tenant record · Alex Example</h1><div className="grid md:grid-cols-2 gap-6 items-start"><SignatureRequests entity="tenant" id={1}/><TenantSmsComposer tenantId={1} phone="07700 900000" onSent={()=>{}}/></div></>:view==='placement'?<><h1 className="text-2xl font-bold">Field placement test</h1><p className="my-4">Choose Signature, Initials or Date, then click the document to place it. Selecting a type should leave the field count unchanged.</p><button onClick={()=>setOpen(true)}>Open field editor</button><pre id="field-results">{JSON.stringify(fields,null,2)}</pre>{open&&<SignatureFieldEditor recipients={[{id:1,name:'Alex Example'}]} fields={fields} onChange={setFields} page={page} onPage={setPage} pageCount={1} signer={signer} onSigner={setSigner} renderPage={children=><SigningPage endpoint="/assets/field-placement-source.png">{children}</SigningPage>} onClose={()=>setOpen(false)} onSave={async()=>{}}/>}</>:<><h1 className="text-2xl font-bold mb-3">Completed document · certificate test</h1><p className="mb-5">Sample signature and test IP address. <a className="underline" href="/assets/signing-fix-test.pdf" target="_blank">Open the two-page test PDF</a></p><img alt="Completed certificate with agreed declarations and test signature" src="/assets/certificate-test.png" style={{width:'100%',maxWidth:760,margin:'auto',display:'block',boxShadow:'0 2px 18px #0002'}}/></>}
 </main>;
}
createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeProvider><PortfolioProvider><Review/></PortfolioProvider></ThemeProvider></MemoryRouter>);

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, MessageCircle, MousePointer2, Paperclip, Plus, Send, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './feedback.css';

type Anchor = { selector: string; label: string; x: number; y: number; pageX: number; pageY: number };
type FileRecord = { id: number; message_id: number; original_name: string; size: number };
type Ticket = { id: number; title: string; body?: string; category: string; priority: string; status: string; page_path: string; anchor: Anchor | null; updated_at: string; author_name: string; revision: number; messages?: { id: number; author_name: string; is_agent: boolean; body: string; created_at: string }[]; files?: FileRecord[]; notifications?: {sent_at: string | null; last_error: string | null}[] };
const labels: Record<string,string> = { queued:'Queued',in_progress:'In progress',blocked:'Needs your reply',completed:'Completed' };
const accept = '.png,.jpg,.jpeg,.webp,.heic,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.mp4,.mov,.mp3,.m4a,.ogg,.wav';
const api = import.meta.env.VITE_API_URL || '';
const prettyDate = (s: string) => new Date(s).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

function selectorFor(el: Element): string {
  const parts: string[]=[];
  let current: Element | null=el;
  while(current && current.tagName.toLowerCase()!=='main' && parts.length<8){
    if(current.id){parts.unshift(`#${CSS.escape(current.id)}`);break;}
    const tag=current.tagName.toLowerCase();
    const siblings=current.parentElement ? Array.from(current.parentElement.children).filter(s=>s.tagName===current!.tagName) : [];
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current)+1})`);
    current=current.parentElement;
  }
  return `${current?.tagName.toLowerCase()==='main'?'main > ':''}${parts.join(' > ')}`.slice(0,700);
}

export default function FeedbackPanel() {
  const { token,user }=useAuth();
  const location=useLocation();
  const navigate=useNavigate();
  const [open,setOpen]=useState(false);
  const [picking,setPicking]=useState(false);
  const [creating,setCreating]=useState(false);
  const [tickets,setTickets]=useState<Ticket[]>([]);
  const [nextOffset,setNextOffset]=useState<number|null>(null);
  const [selected,setSelected]=useState<Ticket|null>(null);
  const [filter,setFilter]=useState('open');
  const [title,setTitle]=useState('');
  const [body,setBody]=useState('');
  const [category,setCategory]=useState('bug');
  const [priority,setPriority]=useState('normal');
  const [anchor,setAnchor]=useState<Anchor|null>(null);
  const [files,setFiles]=useState<File[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [pins,setPins]=useState<{ticket:Ticket;x:number;y:number}[]>([]);
  const drawer=useRef<HTMLDivElement>(null);
  const enabled=user?.role==='admin';
  const selectedId=selected?.id;
  const request=useCallback(async (path:string,init:RequestInit={})=>{
    const response=await fetch(`${api}/api/feedback${path}`,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers}});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'Could not load feedback. Please try again.');}
    return response.json();
  },[token]);
  const load=useCallback(async(offset=0)=>{
    const data=await request(`?offset=${offset}`);
    setTickets(old=>offset ? [...old,...data.tickets] : data.tickets);setNextOffset(data.next_offset);
  },[request]);
  const view=useCallback(async(id:number)=>{
    setError('');setCreating(false);setOpen(true);setBody('');setFiles([]);setRequestId(crypto.randomUUID());
    try{setSelected(await request(`/${id}`));}catch(e){setError((e as Error).message);}
  },[request]);
  useEffect(()=>{
    if(!enabled)return;
    void load().catch(()=>{});
    const id=Number(new URLSearchParams(location.search).get('feedback'));
    if(id>0)void view(id);
  },[enabled,load,view,location.pathname,location.search]);
  useEffect(()=>{
    if(!open||!enabled)return;
    const timer=setInterval(()=>{
      void load().catch(()=>{});
      if(selectedId)void request(`/${selectedId}`).then(setSelected).catch(()=>{});
    },30000);
    return()=>clearInterval(timer);
  },[open,enabled,load,request,selectedId]); // Keep replies and progress current without replacing the draft.
  useEffect(()=>{
    if(!picking)return;
    const pick=(event:MouseEvent)=>{
      const target=event.target as Element;
      if(target.closest('[data-feedback-ui]'))return;
      const main=target.closest('main');if(!main)return;
      event.preventDefault();event.stopPropagation();
      const el=target.closest('button,a,label,h1,h2,h3,td,[data-testid]')||target;
      const rect=el.getBoundingClientRect(),m=main.getBoundingClientRect();
      const clamp=(n:number)=>Math.max(0,Math.min(1,n));
      setAnchor({selector:selectorFor(el),label:(el.getAttribute('aria-label')||el.textContent||'Selected area').trim().slice(0,200),x:clamp((event.clientX-rect.left)/Math.max(1,rect.width)),y:clamp((event.clientY-rect.top)/Math.max(1,rect.height)),pageX:clamp((event.clientX-m.left)/Math.max(1,main.scrollWidth)),pageY:clamp((event.clientY-m.top+main.scrollTop)/Math.max(1,main.scrollHeight))});
      setPicking(false);setCreating(true);setOpen(true);
    };
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setPicking(false);setOpen(true);}};
    document.addEventListener('click',pick,true);document.addEventListener('keydown',escape);
    document.body.classList.add('feedback-picking');
    return()=>{document.removeEventListener('click',pick,true);document.removeEventListener('keydown',escape);document.body.classList.remove('feedback-picking');};
  },[picking]);
  useEffect(()=>{
    const main=document.querySelector('main');if(!main||!enabled)return;
    const position=()=>{
      const m=main.getBoundingClientRect();
      setPins(tickets.filter(t=>t.page_path===location.pathname&&t.anchor&&t.status!=='completed').flatMap(ticket=>{
        const a=ticket.anchor!;let target:Element|null=null;
        try{target=document.querySelector(a.selector);}catch{/* Fall back to the saved page position. */}
        const r=target?.getBoundingClientRect();
        const x=r?r.left+a.x*r.width:m.left+a.pageX*main.scrollWidth;
        const y=r?r.top+a.y*r.height:m.top+a.pageY*main.scrollHeight-main.scrollTop;
        return x>=m.left&&x<=m.right&&y>=m.top&&y<=m.bottom?[{ticket,x,y}]:[];
      }));
    };
    position();main.addEventListener('scroll',position,{passive:true});window.addEventListener('resize',position);
    const observer=new ResizeObserver(position);observer.observe(main);if(main.firstElementChild)observer.observe(main.firstElementChild);
    return()=>{main.removeEventListener('scroll',position);window.removeEventListener('resize',position);observer.disconnect();};
  },[tickets,location.pathname,enabled]);
  useEffect(()=>{
    if(open){drawer.current?.focus();}
  },[open]);
  if(!enabled)return null;
  const reset=()=>{setSelected(null);setCreating(true);setTitle('');setBody('');setAnchor(null);setFiles([]);setError('');setRequestId(crypto.randomUUID());};
  const addFiles=(incoming:File[])=>{
    const all=[...files,...incoming];
    if(all.length>10||all.some(f=>f.size>25*1024*1024)||all.reduce((n,f)=>n+f.size,0)>100*1024*1024){setError('Choose up to 10 files, 25 MB each and 100 MB total.');return;}
    if(all.some(f=>!accept.split(',').includes('.'+f.name.split('.').pop()?.toLowerCase()))){setError('Use images, PDF, Word, Excel, text, ZIP, audio or video files.');return;}
    setFiles(all);setError('');
  };
  const submit=async()=>{
    if(!body.trim()||(!selected&&!title.trim()))return;
    setBusy(true);setError('');
    try{
      const data=new FormData();data.set('client_id',requestId);data.set('body',body);
      if(!selected){data.set('title',title);data.set('category',category);data.set('priority',priority);data.set('page_path',location.pathname);if(anchor)data.set('anchor',JSON.stringify(anchor));}
      files.forEach(f=>data.append('files',f));
      const saved=await request(selected?`/${selected.id}/messages`:'',{method:'POST',body:data});
      setSelected(saved);setCreating(false);setBody('');setFiles([]);setRequestId(crypto.randomUUID());await load();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const download=async(f:FileRecord)=>{
    try{
      const r=await fetch(`${api}/api/feedback/${selected!.id}/files/${f.id}`,{headers:{Authorization:`Bearer ${token}`}});
      if(!r.ok)throw Error('Could not download this attachment');
      const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download=f.original_name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setError((e as Error).message);}
  };
  const shown=tickets.filter(t=>filter==='all'||(filter==='open'?t.status!=='completed':t.status==='completed'));
  const list=()=>{setSelected(null);setCreating(false);setError('');setBody('');setFiles([]);};
  return <>
    {!open&&!picking&&<button data-feedback-ui className="feedback-launch" onClick={()=>{setOpen(true);void load().catch(e=>setError(e.message));}}><MessageCircle size={18}/><span>Feedback</span></button>}
    {!open&&pins.map(p=><button data-feedback-ui key={p.ticket.id} className="feedback-pin" style={{left:p.x,top:p.y}} title={p.ticket.title} aria-label={`Feedback ${p.ticket.id}: ${p.ticket.title}`} onClick={()=>void view(p.ticket.id)}>{p.ticket.id}</button>)}
    {picking&&<div data-feedback-ui className="feedback-pick-banner"><MousePointer2 size={18}/>Click the part of the page you want to comment on<button onClick={()=>{setPicking(false);setOpen(true);}} aria-label="Cancel pin"><X size={18}/></button></div>}
    {open&&<aside data-feedback-ui ref={drawer} tabIndex={-1} role="dialog" aria-modal="false" aria-label="Platform feedback" className="feedback-drawer" onKeyDown={e=>{if(e.key==='Escape'&&!busy)setOpen(false);}}>
      <header className="feedback-header"><div><span className="feedback-eyebrow">FLEMING CRM</span><h2>Feedback <span className="feedback-count">{tickets.filter(t=>t.status!=='completed').length}</span></h2></div><button aria-label="Close feedback" disabled={busy} onClick={()=>setOpen(false)}><X size={20}/></button></header>
      <div className="feedback-intro"><span className="feedback-live-dot"/>Checked every 6 hours. Updates go to your accounts inbox.</div>
      {error&&<div className="feedback-error" role="alert">{error}</div>}
      {(!selected&&!creating)?<>
        <div className="feedback-actions"><button className="feedback-primary" onClick={reset}><Plus size={17}/>New feedback</button><button className="feedback-secondary" onClick={()=>{reset();setOpen(false);setPicking(true);}}><MousePointer2 size={17}/>Pin to page</button></div>
        <div className="feedback-tabs">{['open','completed','all'].map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f==='open'?'Open':f==='completed'?'Completed':'All feedback'}</button>)}</div>
        <div className="feedback-scroll">{shown.length===0?<div className="feedback-empty"><MessageCircle size={30}/><h3>A direct line for your ideas</h3><p>Something wrong? Missing a feature? Leave a note or pin it to the page. Attach screenshots, documents or a WhatsApp export.</p><button className="feedback-secondary" onClick={reset}>Leave your first comment</button></div>:shown.map(t=><button className="feedback-ticket" key={t.id} onClick={()=>void view(t.id)}><div className="feedback-ticket-top"><span>#{t.id} · {t.category}</span><span className={`feedback-status ${t.status}`}>{labels[t.status]}</span></div><h3>{t.title}</h3><p>{t.page_path==='/'?'Dashboard':t.page_path.replaceAll('/',' / ')}</p><small>{prettyDate(t.updated_at)}{t.priority==='high'?' · High priority':''}</small></button>)}{nextOffset!==null&&<button className="feedback-secondary" onClick={()=>void load(nextOffset).catch(e=>setError(e.message))}>Load older feedback</button>}</div>
      </>:<>
        <div className="feedback-subhead"><button onClick={list} disabled={busy}><ArrowLeft size={16}/>All feedback</button>{selected&&<span className={`feedback-status ${selected.status}`}>{labels[selected.status]}</span>}</div>
        <div className="feedback-scroll" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(Array.from(e.dataTransfer.files));}}>
          {selected?<><h3 className="feedback-detail-title">#{selected.id} {selected.title}</h3><button className="feedback-page-link" onClick={()=>navigate(`${selected.page_path}?feedback=${selected.id}`)}>Open original page ↗</button>{selected.anchor&&<div className="feedback-anchor-label"><MousePointer2 size={14}/>{selected.anchor.label||'Pinned area'}</div>}
          <div className="feedback-thread">{selected.messages?.map(m=><article key={m.id} className={m.is_agent?'feedback-message agent':'feedback-message'}><div><strong>{m.is_agent&&<CheckCircle2 size={14}/>} {m.author_name}</strong><time>{prettyDate(m.created_at)}</time></div><p>{m.body}</p>{selected.files?.filter(f=>f.message_id===m.id).map(f=><button key={f.id} className="feedback-attachment" onClick={()=>void download(f)}><Download size={15}/><span>{f.original_name}<small>{(f.size/1024/1024).toFixed(1)} MB</small></span></button>)}</article>)}</div>
          {selected.status==='completed'&&<div className="feedback-success">Published to production.{selected.notifications?.some(n=>n.sent_at)?' Completion email sent.':' Completion email queued.'} Reply below if it needs another look.</div>}
          </>:<><h3 className="feedback-detail-title">What would you like to change?</h3><label className="feedback-label">Title<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={140} placeholder="A short summary of the change"/></label><div className="feedback-two"><label className="feedback-label">Type<select value={category} onChange={e=>setCategory(e.target.value)}><option value="bug">Something is broken</option><option value="feature">New feature / improvement</option><option value="data">Record correction / documents</option><option value="question">Question</option></select></label><label className="feedback-label">Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label></div><div className="feedback-anchor-label"><MousePointer2 size={14}/>{anchor?anchor.label||'Pinned area':`Page: ${location.pathname==='/'?'Dashboard':location.pathname}`}<button aria-label="Choose a page pin" onClick={()=>{setOpen(false);setPicking(true);}}>Change pin</button></div></>}
          <form className="feedback-composer" onSubmit={e=>{e.preventDefault();void submit();}} onPaste={e=>{const pasted=Array.from(e.clipboardData.files);if(pasted.length){e.preventDefault();addFiles(pasted);}}}>
            <label className="feedback-label">{selected?'Reply or add more detail':'Your feedback'}<textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={20000} rows={selected?4:7} placeholder={selected?'Add a reply, another file or explain what still needs changing…':'Tell us what happens, what you expected, or describe the feature you need. You can paste the whole conversation here.'} required/></label>
            <label className="feedback-file-picker"><Paperclip size={17}/>Attach files or drop them here<input type="file" multiple accept={accept} onChange={e=>{addFiles(Array.from(e.target.files||[]));e.target.value='';}} disabled={busy}/></label><p className="feedback-hint">Images, documents, ZIP exports, audio and video. Up to 10 files, 25 MB each.</p>
            {files.map((f,i)=><div className="feedback-selected-file" key={`${f.name}-${i}`}><Paperclip size={14}/><span>{f.name}</span><button type="button" disabled={busy} aria-label={`Remove ${f.name}`} onClick={()=>setFiles(files.filter((_,j)=>j!==i))}><X size={15}/></button></div>)}
            <button className="feedback-primary feedback-submit" disabled={busy||!body.trim()||(!selected&&!title.trim())}><Send size={16}/>{busy?'Saving feedback…':selected?'Send reply':'Submit feedback'}</button>
          </form>
        </div>
      </>}
    </aside>}
  </>;
}

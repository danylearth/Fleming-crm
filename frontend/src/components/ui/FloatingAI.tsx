import {useAuth} from '../../context/AuthContext';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Send, Sparkles, ChevronDown, Mic, ArrowLeft, Paperclip } from 'lucide-react';
import FlemoDocumentReview,{type DocumentReview} from './FlemoDocumentReview';
import { useAIChat } from '../../hooks/useAIChat';
import type { AIAction } from '../../hooks/useAIChat';

const now = () => new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });

function getGreeting(name?:string):string {return `👋 Hi there ${name?.split(' ')[0] || 'there'}! How can I help you today?`;}

// Parse page context from pathname
function getPageContext(pathname: string): { page: string; entityType?: string; entityId?: number } {
  const context: { page: string; entityType?: string; entityId?: number } = { page: pathname };

  const detailMatch = pathname.match(/\/(properties|tenants|landlords|enquiries|bdm|tasks|maintenance)\/(\d+)/);
  if (detailMatch) {
    const typeMap: Record<string, string> = {
      properties: 'property', tenants: 'tenant', landlords: 'landlord',
      enquiries: 'enquiry', bdm: 'landlord_bdm', tasks: 'task', maintenance: 'maintenance',
    };
    context.entityType = typeMap[detailMatch[1]] || detailMatch[1];
    context.entityId = parseInt(detailMatch[2]);
  }

  return context;
}

export default function FloatingAI({open:controlledOpen,onClose,onMenu,onMinimize}:{open?:boolean;onClose?:()=>void;onMenu?:()=>void;onMinimize?:()=>void}={}) {
  const {user,token}=useAuth();
  const [attachments,setAttachments]=useState<{id:string;name:string;size:number}[]>([]),[uploading,setUploading]=useState(false),[uploadError,setUploadError]=useState('');
  const fileInput=useRef<HTMLInputElement>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const open=controlledOpen??localOpen;
  const setOpen=(value:boolean)=>{setLocalOpen(value);if(!value)onClose?.();};
  const [input, setInput] = useState('');
  const voice = useVoiceInput(setInput);
  const [hasUnread, setHasUnread] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();
  const prevPath = useRef(location.pathname);
  const { messages, typing, progress, send, executeAction, setMessages } = useAIChat();

  // Initial greeting
  useEffect(() => {
    setMessages([{ role: 'assistant', text: getGreeting(user?.name), status: 'done' }]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset greeting when page changes
  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      prevPath.current = location.pathname;
      // Only reset if chat has been idle (no user messages in last set)
      setMessages(current=>current.some(m=>m.role==='user')?current:[{ role: 'assistant', text: getGreeting(user?.name), status: 'done' }]);
      if (!open) queueMicrotask(() => setHasUnread(true));
    }
  }, [location.pathname, open, setMessages,user?.name]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const handleOpen = () => {
    setOpen(true);
    setHasUnread(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSend = (text?: string) => {
    if (typing||uploading) return;
    const msg = (text || input).trim();
    if (!msg) return;
    setInput('');
    const context = getPageContext(location.pathname);
    void send(msg, context,attachments);setAttachments([]);
  };

  const attach=async(files:File[])=>{
    if(uploading||typing)return;
    if(files.length+attachments.length>6||files.reduce((n,f)=>n+f.size,attachments.reduce((n,f)=>n+f.size,0))>40*1024*1024){setUploadError('Attach up to 6 documents, totalling 40 MB.');return;}
    setUploading(true);setUploadError('');try{for(const file of files){if(file.size>15*1024*1024)throw Error('Each file must be 15 MB or smaller.');const data=new FormData();data.append('file',file);const r=await fetch(`${import.meta.env.VITE_API_URL||''}/api/ai/attachments`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:data});const value=await r.json();if(!r.ok)throw Error(value.error||'Upload failed.');setAttachments(current=>[...current,value]);}}catch(e){setUploadError((e as Error).message);}finally{setUploading(false);}
  };

  const handleAction = (action: AIAction) => {
    if (action.type === 'link' && action.href) {
      globalThis.location.assign(action.href);
      return;
    }
    executeAction(action.id, action);
  };



  return (
    <>
      {/* Floating Button */}
      {!open && controlledOpen===undefined && (
        <button
          aria-label="Open Flemo"
          onClick={handleOpen}
          className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center shadow-lg shadow-pink-500/20 hover:shadow-pink-500/40 hover:scale-105 transition-all group"
        >
          <Sparkles size={22} className="text-white" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
              <span className="w-2.5 h-2.5 bg-gradient-to-br from-orange-500 to-pink-500 rounded-full animate-pulse" />
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div className={`fixed bottom-0 right-0 z-50 w-full h-[85vh] ${controlledOpen!==undefined?'!right-[92px] !bottom-[92px] max-h-[calc(100dvh-112px)] max-w-[calc(100vw-108px)]':''} md:bottom-6 md:right-6 md:w-[380px] md:h-[560px] flex flex-col md:rounded-2xl rounded-t-2xl border border-[var(--border-input)] bg-[var(--chat-bg)] shadow-2xl shadow-black/50 overflow-hidden animate-in slide-in-from-bottom-4`}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
            <div className="flex items-center gap-3">
              <button aria-label="Open communications menu" onClick={onMenu} className="w-9 h-9 rounded-full bg-white flex items-center justify-center"><img src="/logo-icon.png" alt="" className="w-6 h-6 object-contain"/></button>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Flemo! Your AI helper</p>

              </div>
            </div>
            <div className="flex items-center gap-1">
              <button aria-label="Collapse Flemo" onClick={() => onMinimize?onMinimize():setOpen(false)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
                <ChevronDown size={18} />
              </button>
              <button aria-label="Close Flemo" onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {onMenu&&<div className="px-5 py-2 border-b border-[var(--border-subtle)]"><button onClick={onMenu} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><ArrowLeft size={15}/>Back to menu</button></div>}
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-1' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
                        <Sparkles size={10} className="text-white" />
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)]">Assistant · {now()}</span>
                    </div>
                  )}
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-orange-500/20 to-pink-500/20 border border-orange-500/20 text-[var(--text-primary)]'
                      : 'bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)]'
                  }`}>
                    {formatMessageText(msg.text)}
                  </div>
                  {msg.role === 'user' && (
                    <p className="text-[11px] text-[var(--text-muted)] text-right mt-1">{now()}</p>
                  )}
                  {msg.data?.documentReview?<FlemoDocumentReview review={msg.data.documentReview as unknown as DocumentReview} onComplete={text=>setMessages(current=>[...current.map((message,index)=>index===i?{...message,data:{...message.data,documentReview:{...(message.data?.documentReview as DocumentReview),status:'applied'}}}:message),{role:'assistant',text,status:'done'}])}/>:null}
                  {/* Action Buttons */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.actions.map((action) => (
                        <button
                          key={action.id}
                          onClick={() => handleAction(action)}
                          disabled={action.done}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                            action.done
                              ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                              : action.type === 'dismiss'
                              ? 'bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                              : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/20'
                          }`}
                        >
                          {action.done ? `✓ ${action.label}` : action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
                  <Sparkles size={10} className="text-white" />
                </div>
                <div className="bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-2xl px-4 py-3">
                  {progress&&<p role="status" className="text-xs text-[var(--text-secondary)] mb-2">{progress}</p>}
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-[var(--border-color)]" onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}} onDrop={e=>{e.preventDefault();void attach(Array.from(e.dataTransfer.files));}}>
            <input ref={fileInput} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e=>{void attach(Array.from(e.target.files||[]));e.target.value='';}}/>
            {attachments.length>0&&<div className="mb-2 flex flex-wrap gap-1">{attachments.map(a=><span key={a.id} className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-input)] px-2 py-1 text-xs max-w-full"><span className="truncate">{a.name}</span><button aria-label={`Remove ${a.name}`} disabled={uploading||typing} onClick={()=>setAttachments(current=>current.filter(f=>f.id!==a.id))}><X size={12}/></button></span>)}</div>}
            {(uploadError||uploading)&&<p role="status" className="text-xs mb-2">{uploading?'Uploading documents…':uploadError}</p>}
            {voice.error && <p role="status" className="text-xs text-red-400 mb-2">{voice.error}</p>}
            <div className="flex items-center gap-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5">
              {user?.role!=='viewer'&&<button aria-label="Attach documents" title="Attach PDF or images" disabled={typing||uploading} onClick={()=>fileInput.current?.click()}><Paperclip size={18}/></button>}
              <textarea
                rows={Math.min(5,Math.max(2,input.split("\n").length,Math.ceil(input.length/34)))}
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onPaste={e=>{if(e.clipboardData.files.length){e.preventDefault();void attach(Array.from(e.clipboardData.files));}}}
                onKeyDown={e => {if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}}}
                placeholder='Ask anything...'
                className="flex-1 min-w-0 resize-none bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
              {voice.supported && <button title="Dictate using your browser’s speech service, then review before sending" aria-label={voice.listening ? 'Stop dictation' : 'Dictate question'} onClick={voice.toggle} className={voice.listening ? 'text-red-500 animate-pulse' : 'text-[var(--text-muted)]'}><Mic size={18} /></button>}
              <button aria-label="Send to Flemo" disabled={typing||uploading} onClick={() => handleSend()}
                className={`p-1.5 rounded-lg transition-colors ${input.trim() ? 'text-orange-400 hover:text-orange-300' : 'text-[var(--text-faint)]'}`}>
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Simple markdown-like formatting for bold text
function formatMessageText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

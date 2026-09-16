import {useAuth} from '../context/AuthContext';
import { usePortfolio } from '../context/PortfolioContext';
import { useState, useCallback } from 'react';
import { useApi } from './useApi';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  actions?: AIAction[];
  data?: Record<string, unknown>;
  status?: 'pending' | 'done' | 'error';
}

export interface AIAction {
  id: string;
  label: string;
  type: 'confirm' | 'link' | 'dismiss' | 'download' | 'report';
  href?: string;
  payload?: Record<string, unknown>;
  done?: boolean;
}

export function useAIChat() {
  const api = useApi();
  const {token}=useAuth();
  const { portfolioFilter } = usePortfolio();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [typing, setTyping] = useState(false);

  const addMessage = (msg: AIMessage) => setMessages(prev => [...prev, msg]);

  const executeAction = useCallback(async (actionId: string, action: AIAction) => {
    if (action.type === 'link') return;
    if(action.type==='download'||action.type==='report'){
      try{let blob:Blob;if(action.type==='report')blob=new Blob([String(action.payload?.content||'')],{type:'text/plain;charset=utf-8'});else{if(!/^\/api\/documents\/download\/\d+$/.test(action.href||''))throw new Error('Invalid document');const response=await fetch(`${import.meta.env.VITE_API_URL||''}${action.href}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('Document could not be downloaded');blob=await response.blob();}const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=String(action.payload?.filename||'Fleming CRM document');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){addMessage({role:'assistant',text:error instanceof Error?error.message:'Download failed',status:'error'});}return;
    }
    if (action.type === 'dismiss') {
      addMessage({ role: 'assistant', text: 'Cancelled.', status: 'done' });
      return;
    }

    if (!action.payload) {
      addMessage({ role: 'assistant', text: 'This action is unavailable. Ask Flemo again.', status: 'done' });
      return;
    }

    try {
      setTyping(true);
      const result = await api.post('/api/ai/execute', { actionId, payload: action.payload });
      setTyping(false);
      setMessages(current=>current.map(m=>({...m,actions:m.actions?.map(a=>a.id===actionId?{...a,done:true}:a)})));
      addMessage({ role: 'assistant', text: result.text || 'Done.', status: 'done' });
    } catch (err: unknown) {
      setTyping(false);
      const message = err instanceof Error ? err.message : 'Something went wrong';
      addMessage({ role: 'assistant', text: `Failed: ${message}. Try again?`, status: 'error' });
    }
  }, [api,token]);

  const send = useCallback(async (text: string, context?: { page?: string; entityType?: string; entityId?: number }) => {
    addMessage({ role: 'user', text });
    setTyping(true);

    try {
      const result = await api.post('/api/ai/chat', { message: text, history:messages.slice(-8).map(({role,text})=>({role,text})), context: { ...context, portfolio: portfolioFilter } });
      setTyping(false);
      addMessage({
        role: 'assistant',
        text: result.text || 'I didn\'t understand that.',
        actions: result.actions,
        data: result.data,
        status: 'done',
      });
    } catch (err: unknown) {
      setTyping(false);
      const message = err instanceof Error ? err.message : 'Please try again.';
      addMessage({
        role: 'assistant',
        text: `Something went wrong: ${message}`,
        status: 'error',
      });
    }
  }, [api, portfolioFilter,messages]);

  return { messages, typing, send, executeAction, addMessage, setMessages };
}

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
  type: 'confirm' | 'link' | 'dismiss';
  href?: string;
  payload?: Record<string, unknown>;
  done?: boolean;
}

export function useAIChat() {
  const api = useApi();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [typing, setTyping] = useState(false);

  const addMessage = (msg: AIMessage) => setMessages(prev => [...prev, msg]);

  const executeAction = useCallback(async (actionId: string, action: AIAction) => {
    if (action.type === 'link') return;
    if (action.type === 'dismiss') {
      addMessage({ role: 'assistant', text: 'Cancelled.', status: 'done' });
      return;
    }

    if (!action.payload) {
      addMessage({ role: 'assistant', text: `Done.`, status: 'done' });
      return;
    }

    try {
      setTyping(true);
      const result = await api.post('/api/ai/execute', { actionId, payload: action.payload });
      setTyping(false);
      addMessage({ role: 'assistant', text: result.text || 'Done.', status: 'done' });
    } catch (err: unknown) {
      setTyping(false);
      const message = err instanceof Error ? err.message : 'Something went wrong';
      addMessage({ role: 'assistant', text: `Failed: ${message}. Try again?`, status: 'error' });
    }
  }, [api]);

  const send = useCallback(async (text: string, context?: { page?: string; entityType?: string; entityId?: number }) => {
    addMessage({ role: 'user', text });
    setTyping(true);

    try {
      const result = await api.post('/api/ai/chat', { message: text, context });
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
  }, [api]);

  return { messages, typing, send, executeAction, addMessage, setMessages };
}

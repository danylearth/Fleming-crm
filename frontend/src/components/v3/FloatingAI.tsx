import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Send, Sparkles, ChevronDown } from 'lucide-react';
import { useAIChat, AIAction } from '../../hooks/useAIChat';

const now = () => new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });

// Context-aware suggestions per page
const pageSuggestions: Record<string, string[]> = {
  '/v3': [
    'Prioritise my day',
    'Compliance alerts summary',
    'What needs attention?',
    'Show overdue tasks',
  ],
  '/v3/enquiries': [
    'Draft a response to the latest enquiry',
    'Which enquiries need follow-up?',
    'Chase pending references',
    'Show new enquiries',
  ],
  '/v3/properties': [
    'Which properties need cert renewal?',
    'Show vacant properties',
    'Compliance overview',
    'Properties with rent review due',
  ],
  '/v3/landlords': [
    'Email a landlord update',
    'Who has the most properties?',
    'Landlords needing KYC renewal',
    'Draft landlord update email',
  ],
  '/v3/tenants': [
    'Tenants with rent arrears',
    'Upcoming lease renewals',
    'Send rent reminders',
    'Show tenancy expiry dates',
  ],
  '/v3/bdm': [
    'Pipeline conversion rate',
    'Prospects needing follow-up',
    'Draft outreach email',
    'Show new leads',
  ],
  '/v3/maintenance': [
    'Urgent open issues',
    'Which properties have most issues?',
    'Show open maintenance',
    'Schedule contractor for open jobs',
  ],
  '/v3/tasks': [
    'What\'s overdue?',
    'Show my completed tasks this week',
    'Create a new task',
    'Prioritise my tasks',
  ],
  '/v3/financials': [
    'Monthly rent collection summary',
    'Who\'s in arrears?',
    'Send rent reminders',
    'Financial overview',
  ],
};

// Get greeting based on page
function getGreeting(pathname: string): string {
  if (pathname === '/v3') return "Hi. I can help you manage your day — compliance checks, emails, rent reminders, and more. What do you need?";
  if (pathname.includes('enquir')) return "Viewing enquiries. I can email applicants, chase references, or move enquiries. What would you like?";
  if (pathname.includes('properties')) return "Property portfolio. I can check compliance, show voids, or help with rent reviews. Need anything?";
  if (pathname.includes('landlord')) return "Landlord overview. I can draft update emails or check KYC status. What do you need?";
  if (pathname.includes('tenant')) return "Tenant management. I can send rent reminders, check arrears, or review leases. How can I help?";
  if (pathname.includes('bdm')) return "Business development pipeline. I can help with follow-ups or outreach. What would you like?";
  if (pathname.includes('maintenance')) return "Maintenance requests. I can prioritise issues or help contact contractors. Need anything?";
  if (pathname.includes('task')) return "Task overview. I can create tasks, mark them complete, or help you prioritise. What do you need?";
  if (pathname.includes('financial')) return "Financial overview. I can show arrears, send rent reminders, or give a collection summary. What would you like?";
  return "How can I help?";
}

// Parse page context from pathname
function getPageContext(pathname: string): { page: string; entityType?: string; entityId?: number } {
  const context: { page: string; entityType?: string; entityId?: number } = { page: pathname };

  const detailMatch = pathname.match(/\/v3\/(properties|tenants|landlords|enquiries|bdm|tasks|maintenance)\/(\d+)/);
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

export default function FloatingAI() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [hasUnread, setHasUnread] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const prevPath = useRef(location.pathname);
  const { messages, typing, send, executeAction, setMessages, addMessage } = useAIChat();

  // Initial greeting
  useEffect(() => {
    setMessages([{ role: 'assistant', text: getGreeting(location.pathname), status: 'done' }]);
  }, []);

  // Reset greeting when page changes
  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      prevPath.current = location.pathname;
      // Only reset if chat has been idle (no user messages in last set)
      setMessages([{ role: 'assistant', text: getGreeting(location.pathname), status: 'done' }]);
      setHasUnread(!open);
    }
  }, [location.pathname, open]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  useEffect(() => {
    if (open) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSend = (text?: string) => {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput('');
    const context = getPageContext(location.pathname);
    send(msg, context);
  };

  const handleAction = (action: AIAction) => {
    if (action.type === 'link' && action.href) {
      window.location.href = action.href;
      return;
    }
    executeAction(action.id, action);
  };

  const suggestions = pageSuggestions[location.pathname] || pageSuggestions['/v3'] || [];

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
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
        <div className="fixed bottom-0 right-0 z-50 w-full h-[85vh] md:bottom-6 md:right-6 md:w-[380px] md:h-[560px] flex flex-col md:rounded-2xl rounded-t-2xl border border-[var(--border-input)] bg-[var(--chat-bg)] shadow-2xl shadow-black/50 overflow-hidden animate-in slide-in-from-bottom-4">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] bg-gradient-to-r from-[#232323] to-[#1e1e1e]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
                <Sparkles size={16} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Assistant</p>
                <p className="text-[11px] text-[var(--text-muted)]">Fleming AI</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
                <ChevronDown size={18} />
              </button>
              <button onClick={() => { setOpen(false); setMessages([{ role: 'assistant', text: getGreeting(location.pathname), status: 'done' }]); }} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

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

          {/* Suggestions */}
          {messages.length <= 2 && (
            <div className="px-5 pb-3 flex flex-wrap gap-1.5">
              {suggestions.slice(0, 3).map((s, i) => (
                <button key={i} onClick={() => handleSend(s)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] border border-[var(--border-subtle)] transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-[var(--border-color)]">
            <div className="flex items-center gap-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder='Ask anything...'
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
              <button onClick={() => handleSend()}
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

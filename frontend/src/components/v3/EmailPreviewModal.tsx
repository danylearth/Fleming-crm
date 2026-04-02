import React, { useState, useRef, useEffect } from 'react';
import { Button } from './index';
import { X, Mail, Pencil, Eye } from 'lucide-react';

interface EmailPreviewModalProps {
  open: boolean;
  onClose: () => void;
  onSend: (data: { subject: string; bodyHtml: string }) => Promise<void>;
  sending?: boolean;
  /** Recipient email address */
  to: string;
  /** Sender email address */
  from: string;
  /** Initial subject line (editable) */
  initialSubject: string;
  /** Full HTML string for email body preview */
  initialBodyHtml: string;
  /** Label for the send button */
  sendLabel?: string;
  /** Optional extra content rendered above the email preview (e.g. financial inputs) */
  children?: React.ReactNode;
}

export default function EmailPreviewModal({
  open,
  onClose,
  onSend,
  sending = false,
  to,
  from,
  initialSubject,
  initialBodyHtml,
  sendLabel = 'Send Email',
  children,
}: EmailPreviewModalProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [bodyHtml, setBodyHtml] = useState(initialBodyHtml);
  const [editingSubject, setEditingSubject] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sync props when they change (e.g. financial inputs update the template)
  useEffect(() => { setSubject(initialSubject); }, [initialSubject]);
  useEffect(() => { setBodyHtml(initialBodyHtml); }, [initialBodyHtml]);

  // Write HTML into sandboxed iframe whenever bodyHtml changes
  useEffect(() => {
    if (!editingBody && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;font-family:Arial,sans-serif;}</style></head><body>${bodyHtml}</body></html>`);
        doc.close();
      }
    }
  }, [bodyHtml, editingBody, open]);

  if (!open) return null;

  const handleSend = async () => {
    await onSend({ subject, bodyHtml });
  };

  return (
    <div
      className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-input)] w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#DC006D] to-[#a5004f] flex items-center justify-center">
              <Mail size={16} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Email Preview</h3>
              <p className="text-xs text-[var(--text-muted)]">Review and edit before sending</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Extra content slot (e.g. financial inputs, date pickers) */}
          {children}

          {/* Email metadata */}
          <div className="bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-2 text-xs text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--text-muted)] w-14">To:</span>
              <span>{to}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--text-muted)] w-14">From:</span>
              <span>{from}</span>
            </div>
            <div className="h-px bg-[var(--border-subtle)]" />
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--text-muted)] w-14">Subject:</span>
              {editingSubject ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    autoFocus
                    className="flex-1 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-orange)]/50 transition-colors"
                  />
                  <button
                    onClick={() => setEditingSubject(false)}
                    className="text-[var(--accent-orange)] hover:text-[var(--accent-orange)]/80 text-[10px] font-medium"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex items-center gap-2">
                  <span className="font-semibold text-[var(--text-primary)]">{subject}</span>
                  <button
                    onClick={() => setEditingSubject(true)}
                    className="text-[var(--text-muted)] hover:text-[var(--accent-orange)] transition-colors"
                    title="Edit subject"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Email body preview / edit */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider">
                Email Body
              </label>
              <button
                onClick={() => setEditingBody(!editingBody)}
                className="flex items-center gap-1 text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--accent-orange)] transition-colors"
              >
                {editingBody ? <><Eye size={12} /> Preview</> : <><Pencil size={12} /> Edit HTML</>}
              </button>
            </div>

            {editingBody ? (
              <textarea
                value={bodyHtml}
                onChange={e => setBodyHtml(e.target.value)}
                className="w-full h-64 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-3 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-orange)]/50 transition-colors resize-y"
              />
            ) : (
              <div className="bg-white rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                <iframe
                  ref={iframeRef}
                  title="Email preview"
                  sandbox=""
                  className="w-full h-64 border-0"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              variant="gradient"
              onClick={handleSend}
              disabled={sending || !subject.trim()}
            >
              {sending ? 'Sending...' : sendLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

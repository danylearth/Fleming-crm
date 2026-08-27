import React, { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { Button, DatePicker } from './index';
import EmailPreviewModal from './EmailPreviewModal';
import {
  CheckCircle, Circle, Clock, Mail, FileText, Shield, CreditCard,
  ChevronDown, AlertTriangle, User, X, Send,
  Eye, Download, PoundSterling
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

// Traffic light colours
const STATUS = {
  red: { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-500' },
  amber: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-500' },
  green: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

function StatusDot({ status }: { status: string }) {
  return <div className={`w-3 h-3 rounded-full ${STATUS[status as keyof typeof STATUS]?.dot || STATUS.red.dot}`} />;
}

function StepCard({ idx, step, children, activeStep, setActiveStep }: {
  idx: number;
  step: { label: string; icon: React.ElementType; getStatus: () => string; desc: string };
  children: React.ReactNode;
  activeStep: number;
  setActiveStep: (v: number) => void;
}) {
  const status = step.getStatus();
  const s = STATUS[status as keyof typeof STATUS] || STATUS.red;
  const isActive = activeStep === idx;

  return (
    <div className={`rounded-xl border transition-all ${isActive ? s.border + ' ' + s.bg : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50'}`}>
      <button
        onClick={() => setActiveStep(isActive ? -1 : idx)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <StatusDot status={status} />
        <step.icon size={16} className={s.text} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
            {step.label}
          </p>
          <p className="text-[10px] text-[var(--text-muted)] truncate">{step.desc}</p>
        </div>
        <span className={`text-[10px] font-medium uppercase tracking-wider ${s.text}`}>
          {status === 'green' ? 'Done' : status === 'amber' ? 'Pending' : 'To Do'}
        </span>
        <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${isActive ? 'rotate-180' : ''}`} />
      </button>
      {isActive && (
        <div className="px-4 pb-4 space-y-3">
          <div className="h-px bg-[var(--border-subtle)]" />
          {children}
        </div>
      )}
    </div>
  );
}

interface OnboardingWizardProps {
  enquiryId: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enquiry: Record<string, any>;
  properties: { id: number; address: string; postcode?: string; rent_amount?: number }[];
  users: { id: number; name: string; email: string }[];
  onClose: () => void;
  onUpdate: () => void;
}

export default function OnboardingWizard({ enquiryId, enquiry, properties, onClose, onUpdate }: OnboardingWizardProps) {
  const api = useApi();
  const { token } = useAuth();
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // Step 1: Holding Deposit Request
  const [hdMonthlyRent, setHdMonthlyRent] = useState('');
  const [hdSecurityDeposit, setHdSecurityDeposit] = useState('');
  const [hdHoldingDeposit, setHdHoldingDeposit] = useState('');
  const [hdFollowUpDate, setHdFollowUpDate] = useState('');

  // Step 2: Holding Deposit Received
  const [hdReceivedDate, setHdReceivedDate] = useState('');
  const [hdReceivedAmount, setHdReceivedAmount] = useState('');

  // Step 5: Credit check
  const [creditScore, setCreditScore] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [changesRequired, setChangesRequired] = useState('');
  const [sendReviewSms, setSendReviewSms] = useState(false);
  const [sendReviewEmail, setSendReviewEmail] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Application email modal
  const [showApplicationEmail, setShowApplicationEmail] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Holding deposit email preview modal
  const [showHDEmailPreview, setShowHDEmailPreview] = useState(false);

  // Documents for ID verification step
  const [enquiryDocs, setEnquiryDocs] = useState<{ id: number; doc_type: string; original_name: string; mime_type: string; size: number; uploaded_at: string; review_status?: string; review_notes?: string; reviewed_at?: string }[]>([]);
  const [emailMessages, setEmailMessages] = useState<{ id: number; template: string; status: string; error_message?: string; created_at: string }[]>([]);

  const fetchDocs = () => {
    if (!token) return;
    fetch(`${API_URL}/api/documents/tenant_enquiry/${enquiryId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setEnquiryDocs(d); })
      .catch(() => {});
  };

  const fetchEmailHistory = () => {
    api.get(`/api/email-history/tenant_enquiry/${enquiryId}`)
      .then(data => { if (Array.isArray(data)) setEmailMessages(data); })
      .catch(() => {});
  };

  // Fetch documents for this enquiry
  useEffect(() => { fetchDocs(); fetchEmailHistory(); }, [enquiryId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const reviewDocument = async (docId: number, status: 'approved' | 'rejected') => {
    setSaving(true);
    setReviewError('');
    try {
      await api.put(`/api/documents/${docId}/review`, { status, notes: reviewNotes || null });
      fetchDocs();
      onUpdate();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Document review could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const downloadDocument = async (docId: number, originalName: string) => {
    if (!token) return;
    const response = await fetch(`${API_URL}/api/documents/download/${docId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setReviewError('Document download failed');
      return;
    }
    const href = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = href;
    link.download = originalName;
    link.click();
    URL.revokeObjectURL(href);
  };

  const viewDocument = async (docId: number) => {
    if (!token) return;
    const response = await fetch(`${API_URL}/api/documents/download/${docId}?disposition=inline`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setReviewError('Document preview failed');
      return;
    }
    const href = URL.createObjectURL(await response.blob());
    window.open(href, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  const updateApplicationReview = async (status: 'approved' | 'changes_requested') => {
    setSaving(true);
    setReviewError('');
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/application-review`, {
        status,
        notes: reviewNotes || null,
        changes_required: status === 'changes_requested' ? changesRequired : null,
        send_sms: status === 'changes_requested' && sendReviewSms,
        send_email: status === 'changes_requested' && sendReviewEmail,
      });
      const delivery = (result?.delivery || {}) as Record<string, { success: boolean; error?: string }>;
      const failedDeliveries = Object.values(delivery).filter(item => !item.success);
      if (failedDeliveries.length) {
        setReviewError(`Review saved, but communication failed: ${failedDeliveries.map(item => item.error).join('; ')}`);
      }
      fetchEmailHistory();
      onUpdate();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Application review could not be updated');
    } finally {
      setSaving(false);
    }
  };

  // Initialize from enquiry data
  useEffect(() => {
    const prop = properties.find(p => p.id === Number(enquiry.linked_property_id));
    const rent = enquiry.monthly_rent_agreed || prop?.rent_amount || 0;
    setHdMonthlyRent(String(rent || ''));
    setHdSecurityDeposit(String(enquiry.security_deposit_amount || ''));
    setHdHoldingDeposit(String(enquiry.holding_deposit_amount || (rent ? Math.round(rent * 12 / 52) : '')));
    setHdReceivedAmount(enquiry.holding_deposit_received_amount ? String(enquiry.holding_deposit_received_amount) : '');
    setCreditScore(enquiry.credit_score || '');
    setReviewNotes('');
    setChangesRequired(enquiry.application_review_status === 'changes_requested' ? enquiry.application_review_notes || '' : '');
    // Set active step based on progress
    if (!enquiry.holding_deposit_requested) setActiveStep(0);
    else if (!enquiry.holding_deposit_received) setActiveStep(1);
    else if (!enquiry.application_form_completed) setActiveStep(2);
    else if (enquiry.application_review_status !== 'approved') setActiveStep(3);
    else if (!enquiry.credit_check_completed) setActiveStep(4);
    else setActiveStep(5);
  }, [enquiry, properties]);

  const name = [enquiry.first_name_1, enquiry.last_name_1].filter(Boolean).join(' ');
  const prop = properties.find(p => p.id === Number(enquiry.linked_property_id));
  // Step definitions
  const steps = [
    {
      label: 'Request Holding Deposit',
      icon: Mail,
      getStatus: () => enquiry.holding_deposit_requested ? 'green' : 'red',
      desc: enquiry.holding_deposit_requested ? `Sent to ${enquiry.email_1}` : 'Send email with deposit details & application form',
    },
    {
      label: 'Holding Deposit Received',
      icon: CheckCircle,
      getStatus: () => enquiry.holding_deposit_received ? 'green' : enquiry.holding_deposit_requested ? 'amber' : 'red',
      desc: enquiry.holding_deposit_received
        ? `£${Number(enquiry.holding_deposit_received_amount || enquiry.holding_deposit_amount).toLocaleString()} received`
        : enquiry.holding_deposit_requested ? 'Waiting for payment' : 'Request deposit first',
    },
    {
      label: 'Application Form',
      icon: FileText,
      getStatus: () => enquiry.application_form_completed ? 'green' : enquiry.application_form_sent ? 'amber' : 'red',
      desc: enquiry.application_form_completed ? 'Completed & signed' : enquiry.application_form_sent ? 'Sent — waiting for tenant' : 'Not yet sent',
    },
    {
      label: 'Application Review',
      icon: Shield,
      getStatus: () => enquiry.application_review_status === 'approved'
        ? 'green'
        : enquiry.application_form_completed ? 'amber' : 'red',
      desc: enquiry.application_review_status === 'approved'
        ? 'Application and evidence approved'
        : enquiry.application_review_status === 'changes_requested'
          ? 'Changes requested from applicant'
          : 'Review the submitted form and evidence',
    },
    {
      label: 'Run Credit Check',
      icon: CreditCard,
      getStatus: () => enquiry.credit_check_completed ? 'green' : 'red',
      desc: enquiry.credit_check_completed ? `Credit check completed${enquiry.credit_score ? ` — ${enquiry.credit_score}` : ''}` : 'Run after the application is approved',
    },
    {
      label: 'Convert to Tenant',
      icon: User,
      getStatus: () => enquiry.status === 'converted' ? 'green' : 'red',
      desc: enquiry.status === 'converted' ? 'Converted' : 'Complete all steps to proceed',
    },
  ];

  const allPreviousComplete = (stepIdx: number) => {
    for (let i = 0; i < stepIdx; i++) {
      if (steps[i].getStatus() !== 'green') return false;
    }
    return true;
  };

  // Actions
  const requestHoldingDeposit = async () => {
    if (!hdMonthlyRent || !hdHoldingDeposit) return;
    setSaving(true);
    try {
      await api.post(`/api/tenant-enquiries/${enquiryId}/request-holding-deposit`, {
        monthly_rent: Number(hdMonthlyRent),
        security_deposit: Number(hdSecurityDeposit),
        holding_deposit: Number(hdHoldingDeposit),
        follow_up_date: hdFollowUpDate || null,
      });
      fetchEmailHistory();
      onUpdate();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Holding deposit email could not be sent');
    }
    setSaving(false);
  };

  const confirmDepositReceived = async () => {
    setSaving(true);
    try {
      const receivedDate = hdReceivedDate || new Date().toISOString().split('T')[0];
      const receivedAmount = Number(hdReceivedAmount) || enquiry.holding_deposit_amount;
      const existingNotes: { id: string; text: string; author: string; created_at: string }[] = [];
      if (enquiry.notes) {
        try {
          const parsed = JSON.parse(enquiry.notes);
          if (Array.isArray(parsed)) existingNotes.push(...parsed);
          else existingNotes.push({ id: `legacy-${Date.now()}`, text: String(enquiry.notes), author: 'System', created_at: new Date().toISOString() });
        } catch {
          existingNotes.push({ id: `legacy-${Date.now()}`, text: String(enquiry.notes), author: 'System', created_at: new Date().toISOString() });
        }
      }
      const displayDate = receivedDate.split('-').reverse().join('/');
      existingNotes.push({
        id: `holding-deposit-${Date.now()}`,
        text: `Holding deposit received of £${Number(receivedAmount).toLocaleString('en-GB')} on ${displayDate}.`,
        author: 'System',
        created_at: new Date().toISOString(),
      });
      await api.put(`/api/tenant-enquiries/${enquiryId}`, {
        first_name_1: enquiry.first_name_1, last_name_1: enquiry.last_name_1,
        email_1: enquiry.email_1, status: enquiry.status,
        holding_deposit_received: 1,
        holding_deposit_received_date: receivedDate,
        holding_deposit_received_amount: receivedAmount,
        notes: JSON.stringify(existingNotes),
      });
      api.post('/api/activity', {
        action: 'update', entity_type: 'tenant_enquiry', entity_id: enquiryId,
        changes: { action: 'holding_deposit_received', amount: receivedAmount, date: receivedDate },
      }).catch(() => {});
      onUpdate();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const updateField = async (fields: Record<string, string | number | boolean | null>) => {
    setSaving(true);
    try {
      await api.put(`/api/tenant-enquiries/${enquiryId}`, {
        first_name_1: enquiry.first_name_1, last_name_1: enquiry.last_name_1,
        email_1: enquiry.email_1, status: enquiry.status,
        ...fields,
      });
      onUpdate();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const convertToTenant = async () => {
    setSaving(true);
    try {
      await api.post(`/api/tenant-enquiries/${enquiryId}/convert`, {
        property_id: enquiry.linked_property_id,
        tenancy_start_date: new Date().toISOString().split('T')[0],
      });
      onUpdate();
      onClose();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const propertyAddress = (() => {
    const prop = properties.find(p => p.id === enquiry.linked_property_id);
    return prop ? [prop.address, prop.postcode].filter(Boolean).join(', ') : '';
  })();

  const applicantName = [enquiry.first_name_1, enquiry.last_name_1].filter(Boolean).join(' ');

  // Values below come from the public enquiry form — escape before interpolating into email HTML
  const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

  const buildTenancyApplicationEmailHtml = (): string => {
    const rent = Number(enquiry.monthly_rent_agreed || 0);
    const secDep = Number(enquiry.security_deposit_amount || 0);
    const holdDep = Number(enquiry.holding_deposit_amount || 0);
    const formUrl = enquiry.application_form_token
      ? `https://apply.fleminglettings.co.uk/onboarding/${enquiry.application_form_token}`
      : '#';
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);
    const deadlineStr = deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #25073B, #DC006D); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">Fleming Lettings</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px;">Tenancy Application</p>
      </div>
      <div style="background: #fff; padding: 32px; border: 1px solid #eee; border-top: none;">
        <p style="font-size: 15px; color: #333;">Dear ${escapeHtml(applicantName)},</p>
        <p style="font-size: 14px; color: #555; line-height: 1.6;">
          Thank you for your interest in renting <strong>${escapeHtml(propertyAddress)}</strong>. We are pleased to invite you to complete your tenancy application.
        </p>
        <p style="font-size: 14px; color: #555; line-height: 1.6;">
          Please review the financial details below and complete your application within <strong>14 days</strong> (by ${deadlineStr}).
        </p>
        <h3 style="font-size: 15px; color: #333; margin: 24px 0 12px; border-bottom: 2px solid #DC006D; padding-bottom: 8px;">Financial Summary</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px;">
          <tr style="background: #f8f8f8;">
            <td style="padding: 12px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Monthly Rent</td>
            <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">&pound;${rent.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Security Deposit</td>
            <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">&pound;${secDep.toLocaleString()}</td>
          </tr>
          <tr style="background: #f0f8ff;">
            <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #DC006D; border-bottom: 2px solid #DC006D;">Holding Deposit</td>
            <td style="padding: 12px 16px; font-size: 16px; font-weight: 700; color: #DC006D; text-align: right; border-bottom: 2px solid #DC006D;">&pound;${holdDep.toLocaleString()}</td>
          </tr>
        </table>
        <h3 style="font-size: 15px; color: #333; margin: 24px 0 12px; border-bottom: 2px solid #DC006D; padding-bottom: 8px;">Bank Details for Payment</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px;">
          <tr style="background: #f8f8f8;">
            <td style="padding: 10px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Account Name</td>
            <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">Fleming Lettings and Developments UK Limited</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Bank</td>
            <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">Barclays</td>
          </tr>
          <tr style="background: #f8f8f8;">
            <td style="padding: 10px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Sort Code</td>
            <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">20-08-64</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #eee;">Account Number</td>
            <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #333; text-align: right; border-bottom: 1px solid #eee;">03803880</td>
          </tr>
        </table>
        <p style="font-size: 14px; color: #555; line-height: 1.6;">
          Please complete your tenancy application by clicking the button below:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${formUrl}" style="display: inline-block; background: linear-gradient(135deg, #DC006D, #a5004f); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
            Complete Tenancy Application
          </a>
        </div>
        <p style="font-size: 13px; color: #888; line-height: 1.6;">
          Please ensure your application is completed by <strong>${deadlineStr}</strong>. Failure to complete within this timeframe may result in the property being offered to another applicant.
        </p>
        <p style="font-size: 13px; color: #555; line-height: 1.6;">
          You can save your application and resume it later by reopening this same secure link.
        </p>
        <p style="font-size: 14px; color: #555;">
          Kind regards,<br/><strong>Lettings Support Team | fleminglettings.co.uk</strong><br/>
          <span style="font-size: 12px; color: #888;">01902 212 415 | contact@tenancies.fleminglettings.co.uk</span>
        </p>
      </div>
      <div style="background: #f5f5f5; padding: 16px; border-radius: 0 0 12px 12px; text-align: center; border: 1px solid #eee; border-top: none;">
        <p style="font-size: 11px; color: #999; margin: 0;">
          Fleming Lettings and Developments UK Limited<br/>
          Creative Industries Centre, Wolverhampton Science Park, Wolverhampton, WV10 9TG
        </p>
      </div>
    </div>`;
  };

  const buildResendApplicationEmailHtml = (): string => {
    const firstName = enquiry.first_name_1 || 'there';
    const formUrl = enquiry.application_form_token
      ? `https://apply.fleminglettings.co.uk/onboarding/${enquiry.application_form_token}`
      : '#';
    return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #25073B, #DC006D); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">Fleming Lettings</h1>
      </div>
      <div style="background: #fff; padding: 32px; border: 1px solid #eee; border-top: none;">
        <p style="font-size: 15px; color: #333;">Dear ${escapeHtml(firstName)},</p>
        <p style="font-size: 14px; color: #555; line-height: 1.6;">Welcome to Fleming Lettings!</p>
        <p style="font-size: 14px; color: #555; line-height: 1.6;">
          We are still waiting on your application form(s) to be completed by clicking on the following link:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${formUrl}" style="display: inline-block; background: linear-gradient(135deg, #DC006D, #a5004f); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
            Complete Your Application
          </a>
        </div>
        <p style="font-size: 13px; color: #555; line-height: 1.6;">
          You can save your application and resume it later by reopening this same secure link.
        </p>
        <p style="font-size: 14px; color: #555; line-height: 1.6;">
          If you get stuck, need some help or if you would like our friendly team to guide you through the process then please do not hesitate to get in touch on <strong>01902 212 415</strong>.
        </p>
        <p style="font-size: 14px; color: #555;">Kind regards,<br/><strong>Lettings Support Team | fleminglettings.co.uk</strong><br/>contact@tenancies.fleminglettings.co.uk | 01902 212 415</p>
      </div>
      <div style="background: #f5f5f5; padding: 16px; border-radius: 0 0 12px 12px; text-align: center; border: 1px solid #eee; border-top: none;">
        <p style="font-size: 11px; color: #999; margin: 0;">
          Fleming Lettings and Developments UK Limited<br/>
          Creative Industries Centre, Wolverhampton Science Park, Wolverhampton, WV10 9TG
        </p>
      </div>
    </div>`;
  };

  const sendApplicationEmail = async ({ subject, bodyHtml }: { subject: string; bodyHtml: string }) => {
    setSendingEmail(true);
    try {
      await api.post(`/api/tenant-enquiries/${enquiryId}/send-application-email`, {
        subject,
        body_html: bodyHtml,
      });
      setShowApplicationEmail(false);
      fetchEmailHistory();
      onUpdate();
    } catch (err) {
      console.error('Failed to send application email:', err);
      alert(err instanceof Error ? err.message : 'Application email could not be sent');
    }
    setSendingEmail(false);
  };

  const stepCardProps = { activeStep, setActiveStep };
  const applicationData = (enquiry.app_form_data || {}) as Record<string, unknown>;
  const requiredReviewDocumentTypes = ['Primary Identification', 'Secondary Identification', 'Bank Statements'];
  if (!['Student', 'Unemployed'].includes(String(applicationData.employment_status || ''))) {
    requiredReviewDocumentTypes.push('Proof of Income or Employment');
  }
  const allRequiredDocsApproved = requiredReviewDocumentTypes.every(docType =>
    enquiryDocs.some(doc => doc.doc_type === docType && doc.review_status === 'approved')
  );
  const latestApplicationEmail = emailMessages.find(message =>
    message.template === 'tenancy_application' || message.template === 'holding_deposit_request'
  );
  const latestHoldingEmail = emailMessages.find(message => message.template === 'holding_deposit_request');
  const answerLabel = (key: string) => key.replace(/^declaration_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const answerValue = (value: unknown) => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value || '—');

  return (
    <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-input)] w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
            {name.charAt(0)}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold">{name}</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {prop ? `${prop.address}${prop.postcode ? `, ${prop.postcode}` : ''}` : 'No property linked'}
            </p>
          </div>
          {/* Progress */}
          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)]">Progress</p>
            <p className="text-sm font-bold text-emerald-400">
              {steps.filter(s => s.getStatus() === 'green').length}/{steps.length}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] ml-2"><X size={18} /></button>
        </div>

        {/* Steps */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">

          {/* Step 1: Request Holding Deposit */}
          <StepCard idx={0} step={steps[0]} {...stepCardProps}>
            {enquiry.holding_deposit_requested ? (
              <div className="space-y-3">
                {/* Email sent confirmation */}
                <div className="text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle size={14} /> Email sent to {enquiry.email_1} on {enquiry.onboarding_email_sent_at ? new Date(enquiry.onboarding_email_sent_at as string | number).toLocaleDateString('en-GB') : 'N/A'}
                </div>
                {latestHoldingEmail && (
                  <div className={`rounded-lg px-3 py-2 text-xs border ${['failed', 'bounced', 'complained'].includes(latestHoldingEmail.status)
                    ? 'bg-red-500/10 border-red-500/20 text-red-400'
                    : latestHoldingEmail.status === 'delivered'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                    Delivery: <strong>{latestHoldingEmail.status === 'sent' ? 'accepted by provider' : latestHoldingEmail.status}</strong>
                    {latestHoldingEmail.error_message && <span> — {latestHoldingEmail.error_message}</span>}
                  </div>
                )}

                {/* Financial summary */}
                <div className="bg-[var(--bg-subtle)] rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {enquiry.monthly_rent_agreed && (
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)]">Monthly Rent</p>
                      <p className="text-sm font-medium text-[var(--text-primary)]">£{Number(enquiry.monthly_rent_agreed).toLocaleString()}</p>
                    </div>
                  )}
                  {enquiry.security_deposit_amount && (
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)]">Security Deposit</p>
                      <p className="text-sm font-medium text-[var(--text-primary)]">£{Number(enquiry.security_deposit_amount).toLocaleString()}</p>
                    </div>
                  )}
                  {enquiry.holding_deposit_amount && (
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)]">Holding Deposit</p>
                      <p className="text-sm font-medium text-[var(--text-primary)]">£{Number(enquiry.holding_deposit_amount).toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {/* Email content summary */}
                <div className="bg-[var(--bg-subtle)] rounded-lg p-3 space-y-2">
                  <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Email Summary</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)]">To</p>
                      <p className="text-xs text-[var(--text-primary)]">{enquiry.email_1}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)]">From</p>
                      <p className="text-xs text-[var(--text-primary)]">contact@tenancies.fleminglettings.co.uk</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)]">Subject</p>
                      <p className="text-xs text-[var(--text-primary)]">Tenancy Application – {propertyAddress || 'Property'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)]">Sent</p>
                      <p className="text-xs text-[var(--text-primary)]">{enquiry.onboarding_email_sent_at ? new Date(enquiry.onboarding_email_sent_at as string | number).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                    </div>
                  </div>
                  <div className="h-px bg-[var(--border-subtle)]" />
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">Email contains</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-secondary)] bg-[var(--bg-hover)] rounded px-2 py-1">
                        <PoundSterling size={10} /> Holding Deposit Summary
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-secondary)] bg-[var(--bg-hover)] rounded px-2 py-1">
                        <FileText size={10} /> Application Form Link
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowHDEmailPreview(true)}
                    className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--accent-orange)] hover:underline mt-1"
                  >
                    <Eye size={12} /> View Email Preview
                  </button>
                  <Button variant="ghost" onClick={requestHoldingDeposit} disabled={saving || !enquiry.email_1} className="flex items-center gap-2">
                    <Send size={14} /> {saving ? 'Sending...' : 'Resend Holding Deposit Email'}
                  </Button>
                </div>

                {/* Deposit received status */}
                <div className={`rounded-lg p-3 border ${enquiry.holding_deposit_received ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                  <div className="flex items-center gap-2">
                    {enquiry.holding_deposit_received ? (
                      <CheckCircle size={14} className="text-emerald-400" />
                    ) : (
                      <Clock size={14} className="text-amber-400" />
                    )}
                    <span className={`text-xs font-medium ${enquiry.holding_deposit_received ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {enquiry.holding_deposit_received
                        ? `Deposit received${enquiry.holding_deposit_received_date ? ` on ${new Date(enquiry.holding_deposit_received_date).toLocaleDateString('en-GB')}` : ''}`
                        : 'Awaiting deposit payment'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1 font-medium">Monthly Rent (£)</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdMonthlyRent} onChange={e => {
                      const v = e.target.value.replace(/[^0-9.]/g, '');
                      setHdMonthlyRent(v);
                      const r = Number(v);
                      if (r > 0) { setHdHoldingDeposit(String(Math.round(r * 12 / 52))); }
                    }} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1 font-medium">Security Dep. (£)</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdSecurityDeposit} onChange={e => setHdSecurityDeposit(e.target.value.replace(/[^0-9.]/g, ''))} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1 font-medium">Holding Dep. (£)</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdHoldingDeposit} onChange={e => setHdHoldingDeposit(e.target.value.replace(/[^0-9.]/g, ''))} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                  </div>
                </div>
                <DatePicker label="Follow-up Date" value={hdFollowUpDate} onChange={setHdFollowUpDate} />
                <div className="bg-[var(--bg-subtle)] rounded-lg p-3 text-[10px] text-[var(--text-muted)] space-y-1">
                  <p className="font-medium text-[var(--text-secondary)]">Will send to: {enquiry.email_1}</p>
                  <p>From: contact@tenancies.fleminglettings.co.uk</p>
                  <p>Includes: Holding Deposit Summary + Application Form Link</p>
                </div>
                <Button variant="gradient" onClick={requestHoldingDeposit} disabled={saving || !hdMonthlyRent || !hdHoldingDeposit}>
                  {saving ? 'Sending...' : 'Send Email & Application Link'}
                </Button>
              </>
            )}
          </StepCard>

          {/* Step 2: Holding Deposit Received */}
          <StepCard idx={1} step={steps[1]} {...stepCardProps}>
            {enquiry.holding_deposit_received ? (
              <div className="space-y-3">
                <div className="text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle size={14} /> Deposit received and confirmed
                </div>

                {/* Tracking timeline */}
                <div className="bg-[var(--bg-subtle)] rounded-lg p-3 space-y-3">
                  <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Deposit Tracking</p>
                  <div className="space-y-2">
                    {/* Email sent row */}
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                          <Mail size={10} className="text-emerald-400" />
                        </div>
                        <div className="w-px h-full bg-emerald-500/30 min-h-[16px]" />
                      </div>
                      <div className="pb-2">
                        <p className="text-xs text-[var(--text-primary)] font-medium">Email sent to {enquiry.email_1}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{enquiry.onboarding_email_sent_at ? new Date(enquiry.onboarding_email_sent_at as string | number).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                      </div>
                    </div>
                    {/* Deposit received row */}
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                          <CheckCircle size={10} className="text-emerald-400" />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-primary)] font-medium">£{Number(enquiry.holding_deposit_received_amount || enquiry.holding_deposit_amount).toLocaleString()} received</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{enquiry.holding_deposit_received_date ? new Date(enquiry.holding_deposit_received_date).toLocaleDateString('en-GB') : '—'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Email tracking context */}
                {enquiry.holding_deposit_requested && enquiry.onboarding_email_sent_at && (
                  <div className="bg-[var(--bg-subtle)] rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Mail size={12} className="text-amber-400" />
                      <span>Deposit request sent to <strong>{enquiry.email_1}</strong> on {new Date(enquiry.onboarding_email_sent_at as string | number).toLocaleDateString('en-GB')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <CreditCard size={12} className="text-amber-400" />
                      <span>Amount requested: <strong>£{Number(enquiry.holding_deposit_amount || 0).toLocaleString()}</strong></span>
                    </div>
                  </div>
                )}

                {/* Date Deposit Received */}
                <div className="rounded-lg border border-[var(--border-input)] p-3 space-y-3">
                  <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Confirm Payment</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1 font-medium">Amount Received (£)</label>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdReceivedAmount} onChange={e => setHdReceivedAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={String(enquiry.holding_deposit_amount || '')}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                    </div>
                    <DatePicker label="Date Deposit Received" value={hdReceivedDate} onChange={setHdReceivedDate} />
                  </div>
                  <Button variant="gradient" onClick={confirmDepositReceived} disabled={saving}>
                    {saving ? 'Saving...' : 'Confirm Deposit Received'}
                  </Button>
                </div>
              </div>
            )}
          </StepCard>

          {/* Step 3: Application Form */}
          <StepCard idx={2} step={steps[2]} {...stepCardProps}>
            {/* Progress tracker — three milestones */}
            {(() => {
              const sent = !!enquiry.application_form_sent;
              const completed = !!enquiry.application_form_completed;
              const milestones = [
                { label: 'Not Sent', reached: true, active: !sent && !completed, ts: null },
                { label: 'Sent — Waiting', reached: sent, active: sent && !completed, ts: enquiry.onboarding_email_sent_at },
                { label: 'Completed', reached: completed, active: completed, ts: enquiry.app_signed_at },
              ];
              return (
                <div className="space-y-4">
                  {/* Horizontal progress tracker */}
                  <div className="flex items-start">
                    {milestones.map((m, i) => (
                      <div key={m.label} className="flex items-start flex-1">
                        <div className="flex flex-col items-center flex-1">
                          {/* Node */}
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${
                            m.active
                              ? completed ? 'border-emerald-500 bg-emerald-500/20' : sent ? 'border-amber-500 bg-amber-500/20' : 'border-red-500 bg-red-500/20'
                              : m.reached ? 'border-emerald-500 bg-emerald-500/20' : 'border-[var(--border-input)] bg-[var(--bg-subtle)]'
                          }`}>
                            {m.reached && i > 0 ? (
                              <CheckCircle size={14} className={m.active && !completed ? 'text-amber-400' : 'text-emerald-400'} />
                            ) : m.active && i === 0 ? (
                              <Circle size={10} className="text-red-400 fill-red-400" />
                            ) : (
                              <Circle size={10} className="text-[var(--text-muted)]" />
                            )}
                          </div>
                          {/* Label */}
                          <p className={`text-[10px] mt-1 text-center font-medium ${
                            m.active ? (completed ? 'text-emerald-400' : sent ? 'text-amber-400' : 'text-red-400') : m.reached ? 'text-emerald-400' : 'text-[var(--text-muted)]'
                          }`}>{m.label}</p>
                          {/* Timestamp */}
                          {m.ts && m.reached && (
                            <p className="text-[9px] text-[var(--text-muted)] mt-0.5">
                              {new Date(m.ts).toLocaleDateString('en-GB')}
                            </p>
                          )}
                        </div>
                        {/* Connector line */}
                        {i < milestones.length - 1 && (
                          <div className={`h-0.5 flex-1 mt-3 mx-1 rounded ${
                            milestones[i + 1].reached ? 'bg-emerald-500' : sent && i === 0 ? 'bg-amber-500' : 'bg-[var(--border-input)]'
                          }`} />
                        )}
                      </div>
                    ))}
                  </div>

                  {latestApplicationEmail && (
                    <div className={`rounded-lg px-3 py-2 text-xs border ${['failed', 'bounced', 'complained'].includes(latestApplicationEmail.status)
                      ? 'bg-red-500/10 border-red-500/20 text-red-400'
                      : latestApplicationEmail.status === 'delivered'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                      Latest email: <strong>{latestApplicationEmail.status === 'sent' ? 'accepted by provider' : latestApplicationEmail.status}</strong>
                      {latestApplicationEmail.error_message && <span> — {latestApplicationEmail.error_message}</span>}
                    </div>
                  )}

                  {/* Contextual content below the tracker */}
                  {completed ? (
                    <div className="space-y-2">
                      {enquiry.app_signature && (
                        <div>
                          <p className="text-[10px] text-[var(--text-muted)] mb-1">Signature</p>
                          <div className="bg-white rounded-lg p-2 inline-block">
                            <img src={enquiry.app_signature} alt="Signature" className="h-12" />
                          </div>
                        </div>
                      )}
                      <div className="bg-[var(--bg-subtle)] rounded-lg p-3 space-y-2">
                        <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Application Details</p>
                        <div className="grid grid-cols-2 gap-2">
                          {enquiry.app_ni_number && (
                            <div>
                              <p className="text-[10px] text-[var(--text-muted)]">NI Number</p>
                              <p className="text-xs text-[var(--text-primary)]">{enquiry.app_ni_number}</p>
                            </div>
                          )}
                          {enquiry.employer_1 && (
                            <div>
                              <p className="text-[10px] text-[var(--text-muted)]">Employer</p>
                              <p className="text-xs text-[var(--text-primary)]">{enquiry.employer_1}</p>
                            </div>
                          )}
                          {enquiry.income_1 && (
                            <div>
                              <p className="text-[10px] text-[var(--text-muted)]">Income</p>
                              <p className="text-xs text-[var(--text-primary)]">£{Number(enquiry.income_1).toLocaleString()}</p>
                            </div>
                          )}
                          {enquiry.app_bank_name && (
                            <div>
                              <p className="text-[10px] text-[var(--text-muted)]">Bank</p>
                              <p className="text-xs text-[var(--text-primary)]">{enquiry.app_bank_name}</p>
                            </div>
                          )}
                        </div>
                        {(enquiry.app_has_landlord_ref || enquiry.app_has_employer_ref) && (
                          <>
                            <div className="h-px bg-[var(--border-subtle)]" />
                            <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">References</p>
                            <div className="grid grid-cols-2 gap-2">
                              {enquiry.app_landlord_ref_name && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Landlord Ref</p>
                                  <p className="text-xs text-[var(--text-primary)]">{enquiry.app_landlord_ref_name}</p>
                                  {enquiry.app_landlord_ref_phone && <p className="text-[10px] text-[var(--text-muted)]">{enquiry.app_landlord_ref_phone}</p>}
                                </div>
                              )}
                              {enquiry.app_employer_ref_name && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Employer Ref</p>
                                  <p className="text-xs text-[var(--text-primary)]">{enquiry.app_employer_ref_name}</p>
                                  {enquiry.app_employer_ref_phone && <p className="text-[10px] text-[var(--text-muted)]">{enquiry.app_employer_ref_phone}</p>}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                        {enquiry.app_next_of_kin_name && (
                          <>
                            <div className="h-px bg-[var(--border-subtle)]" />
                            <div>
                              <p className="text-[10px] text-[var(--text-muted)]">Next of Kin</p>
                              <p className="text-xs text-[var(--text-primary)]">{enquiry.app_next_of_kin_name} ({enquiry.app_next_of_kin_relationship || 'N/A'})</p>
                              {enquiry.app_next_of_kin_phone && <p className="text-[10px] text-[var(--text-muted)]">{enquiry.app_next_of_kin_phone}</p>}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : sent ? (
                    <div className="space-y-3">
                      {enquiry.application_form_token && (
                        <div className="bg-[var(--bg-subtle)] rounded-lg p-3">
                          <p className="text-[10px] text-[var(--text-muted)] mb-1">Application Form Link:</p>
                          <p className="text-xs text-[var(--accent-orange)] break-all">
                            https://apply.fleminglettings.co.uk/onboarding/{enquiry.application_form_token}
                          </p>
                        </div>
                      )}
                      <Button variant="ghost" onClick={() => setShowApplicationEmail(true)} disabled={!enquiry.email_1} className="flex items-center gap-2">
                        <Send size={14} /> Resend Application Form Link
                      </Button>
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--text-muted)]">
                      <AlertTriangle size={14} className="inline mr-1 text-amber-400" />
                      Application form link will be sent with the holding deposit email (Step 1)
                    </div>
                  )}
                </div>
              );
            })()}
          </StepCard>

          {/* Step 4: Application Review */}
          <StepCard idx={3} step={steps[3]} {...stepCardProps}>
            <div className="space-y-4">
              {!enquiry.application_form_completed ? (
                <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400" /> Waiting for the applicant to submit the form and documents.
                </div>
              ) : (
                <>
                  <div className="bg-[var(--bg-subtle)] rounded-lg p-3 max-h-56 overflow-y-auto">
                    <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Submitted answers</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {Object.entries(applicationData).map(([key, value]) => (
                        <div key={key} className={String(value).length > 50 ? 'col-span-2' : ''}>
                          <p className="text-[10px] text-[var(--text-muted)]">{answerLabel(key)}</p>
                          <p className="text-xs text-[var(--text-primary)] break-words">{answerValue(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Supporting documents</p>
                    {requiredReviewDocumentTypes.map(docType => {
                      const docs = enquiryDocs.filter(doc => doc.doc_type === docType);
                      return (
                        <div key={docType} className="bg-[var(--bg-hover)]/50 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium">{docType}</span>
                            <span className={`text-[10px] ${docs.some(doc => doc.review_status === 'approved') ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {docs.length ? `${docs.length} uploaded` : 'Missing'}
                            </span>
                          </div>
                          {docs.map(doc => (
                            <div key={doc.id} className="flex items-center gap-2 bg-[var(--bg-subtle)] rounded px-2 py-2">
                              <FileText size={12} className="text-[var(--text-muted)] shrink-0" />
                              <div className="text-left min-w-0 flex-1">
                                <p className="text-[11px] text-[var(--text-primary)] truncate">{doc.original_name}</p>
                                <p className="text-[10px] text-[var(--text-muted)]">{new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</p>
                              </div>
                              <span className={`text-[10px] font-medium ${doc.review_status === 'approved' ? 'text-emerald-400' : doc.review_status === 'rejected' ? 'text-red-400' : 'text-amber-400'}`}>
                                {doc.review_status || 'pending'}
                              </span>
                              <button onClick={() => viewDocument(doc.id)} className="px-2 py-1 rounded text-[10px] bg-sky-500/15 text-sky-400 flex items-center gap-1"><Eye size={10} />View</button>
                              <button onClick={() => downloadDocument(doc.id, doc.original_name)} className="px-2 py-1 rounded text-[10px] bg-[var(--bg-hover)] text-[var(--text-secondary)] flex items-center gap-1"><Download size={10} />Download</button>
                              <button onClick={() => reviewDocument(doc.id, 'approved')} disabled={saving} className="px-2 py-1 rounded text-[10px] bg-emerald-500/15 text-emerald-400">Approve</button>
                              <button onClick={() => reviewDocument(doc.id, 'rejected')} disabled={saving} className="px-2 py-1 rounded text-[10px] bg-red-500/15 text-red-400">Reject</button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>

                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">Internal notes (added to the enquiry record)</label>
                    <textarea value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} rows={3}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">Changes / information required</label>
                    <textarea value={changesRequired} onChange={event => setChangesRequired(event.target.value)} rows={3}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 rounded-lg bg-[var(--bg-subtle)] px-3 py-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={sendReviewSms} onChange={event => setSendReviewSms(event.target.checked)} className="accent-orange-500" /> Send SMS
                    </label>
                    <label className="flex items-center gap-2 rounded-lg bg-[var(--bg-subtle)] px-3 py-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={sendReviewEmail} onChange={event => setSendReviewEmail(event.target.checked)} className="accent-orange-500" /> Send email
                    </label>
                  </div>
                  {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => updateApplicationReview('changes_requested')} disabled={saving || !changesRequired.trim()}>
                      Request Changes
                    </Button>
                    <Button variant="gradient" size="sm" onClick={() => updateApplicationReview('approved')} disabled={saving || !allRequiredDocsApproved}>
                      Approve Application
                    </Button>
                  </div>
                  {!allRequiredDocsApproved && <p className="text-[10px] text-amber-400">Approve at least one file in each required category before approving the application.</p>}
                </>
              )}
            </div>
          </StepCard>

          {/* Step 5: Run Credit Check */}
          <StepCard idx={4} step={steps[4]} {...stepCardProps}>
            <div className="space-y-3">
              {enquiry.application_review_status !== 'approved' && (
                <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400" /> Approve the application before recording a credit check.
                </div>
              )}
              <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Credit Check Result</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[var(--text-muted)] mb-1">Credit Score</label>
                  <input type="text" value={creditScore} onChange={e => setCreditScore(e.target.value)} placeholder="e.g. 720"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                </div>
                <div className="flex items-end">
                  <Button variant={enquiry.credit_check_completed ? 'outline' : 'gradient'} size="sm" onClick={() => updateField({
                    credit_check_completed: 1, credit_score: creditScore, credit_check_date: new Date().toISOString().split('T')[0],
                  })} disabled={saving || !creditScore || enquiry.application_review_status !== 'approved'}>
                    {enquiry.credit_check_completed ? 'Updated' : 'Save Score'}
                  </Button>
                </div>
              </div>
              {enquiry.credit_score && (
                <div className="text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle size={14} /> Credit score: {enquiry.credit_score}
                  {enquiry.credit_check_date && ` (checked ${new Date(enquiry.credit_check_date).toLocaleDateString('en-GB')})`}
                </div>
              )}
            </div>
          </StepCard>

          {/* Step 6: Convert to Tenant */}
          <StepCard idx={5} step={steps[5]} {...stepCardProps}>
            {allPreviousComplete(5) ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-sm font-medium text-emerald-400">All checks complete</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">{name} is ready to be converted to a tenant.</p>
                </div>
                <Button variant="gradient" onClick={convertToTenant} disabled={saving}>
                  {saving ? 'Converting...' : 'Convert to Tenant'}
                </Button>
              </div>
            ) : (
              <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                Complete all previous steps before converting to tenant
              </div>
            )}
          </StepCard>

        </div>
      </div>

      <EmailPreviewModal
        open={showApplicationEmail}
        onClose={() => setShowApplicationEmail(false)}
        onSend={sendApplicationEmail}
        sending={sendingEmail}
        to={enquiry.email_1 || ''}
        from="contact@tenancies.fleminglettings.co.uk"
        initialSubject={`Your Fleming Lettings Application Form`}
        initialBodyHtml={buildResendApplicationEmailHtml()}
        sendLabel="Resend Application Form Link"
      />

      {/* Holding deposit email preview (read-only) */}
      {showHDEmailPreview && (
        <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowHDEmailPreview(false)}>
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-input)] w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)]">
              <h4 className="text-sm font-bold text-[var(--text-primary)]">Email Preview</h4>
              <button onClick={() => setShowHDEmailPreview(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-2 text-xs text-[var(--text-secondary)]">
              <div className="flex gap-2"><span className="text-[var(--text-muted)] w-12">To:</span><span>{enquiry.email_1}</span></div>
              <div className="flex gap-2"><span className="text-[var(--text-muted)] w-12">From:</span><span>contact@tenancies.fleminglettings.co.uk</span></div>
              <div className="flex gap-2"><span className="text-[var(--text-muted)] w-12">Subject:</span><span className="font-medium">Tenancy Application – {propertyAddress || 'Property'}</span></div>
              <div className="flex gap-2"><span className="text-[var(--text-muted)] w-12">Sent:</span><span>{enquiry.onboarding_email_sent_at ? new Date(enquiry.onboarding_email_sent_at as string | number).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden bg-white">
                <div dangerouslySetInnerHTML={{ __html: buildTenancyApplicationEmailHtml() }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

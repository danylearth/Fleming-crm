import { useState, useEffect, useRef } from 'react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { Button, DatePicker } from './index';
import EmailPreviewModal from './EmailPreviewModal';
import {
  CheckCircle, Circle, Clock, Mail, FileText, Shield, CreditCard,
  ChevronDown, AlertTriangle, User, X, Send,
  Download, Upload, Trash2, Eye, Paperclip
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

// Traffic light colours
const STATUS = {
  red: { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-500' },
  amber: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-500' },
  green: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

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

  // Application email modal
  const [showApplicationEmail, setShowApplicationEmail] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Holding deposit email preview modal
  const [showHDEmailPreview, setShowHDEmailPreview] = useState(false);

  // Documents for ID verification step
  const [enquiryDocs, setEnquiryDocs] = useState<{ id: number; doc_type: string; original_name: string; mime_type: string; size: number; uploaded_at: string }[]>([]);
  const [uploading, setUploading] = useState<string | null>(null); // tracks which doc_type is uploading
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingDocType = useRef<string>('');

  const fetchDocs = () => {
    if (!token) return;
    fetch(`${API_URL}/api/documents/tenant_enquiry/${enquiryId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setEnquiryDocs(d); })
      .catch(() => {});
  };

  // Fetch documents for this enquiry
  useEffect(() => { fetchDocs(); }, [enquiryId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUploadClick = (docType: string) => {
    pendingDocType.current = docType;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    const docType = pendingDocType.current;
    setUploading(docType);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', docType);
      const res = await fetch(`${API_URL}/api/documents/tenant_enquiry/${enquiryId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error('Upload failed');
      fetchDocs();
    } catch {
      // silently fail — user sees no new doc appear
    } finally {
      setUploading(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDoc = async (docId: number) => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchDocs();
    } catch {
      // silently fail
    }
  };

  // Initialize from enquiry data
  useEffect(() => {
    const prop = properties.find(p => p.id === Number(enquiry.linked_property_id));
    const rent = enquiry.monthly_rent_agreed || prop?.rent_amount || 0;
    setHdMonthlyRent(String(rent || ''));
    if (rent) {
      setHdHoldingDeposit(String(Math.round(rent * 12 / 52)));
    }
    setHdReceivedAmount(enquiry.holding_deposit_received_amount ? String(enquiry.holding_deposit_received_amount) : '');
    setCreditScore(enquiry.credit_score || '');
    // Set active step based on progress
    if (!enquiry.holding_deposit_requested) setActiveStep(0);
    else if (!enquiry.holding_deposit_received) setActiveStep(1);
    else if (!enquiry.application_form_completed) setActiveStep(2);
    else if (!enquiry.id_primary_verified_1 || !enquiry.id_secondary_verified_1) setActiveStep(3);
    else if (!enquiry.bank_statements_received || !enquiry.credit_check_completed) setActiveStep(4);
    else setActiveStep(5);
  }, [enquiry, properties]);

  const name = [enquiry.first_name_1, enquiry.last_name_1].filter(Boolean).join(' ');
  const prop = properties.find(p => p.id === Number(enquiry.linked_property_id));
  const isJoint = !!enquiry.is_joint_application;

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
      label: 'ID Verification',
      icon: Shield,
      getStatus: () => {
        const done1 = enquiry.id_primary_verified_1 && enquiry.id_secondary_verified_1;
        const done2 = !isJoint || (enquiry.id_primary_verified_2 && enquiry.id_secondary_verified_2);
        return done1 && done2 ? 'green' : (enquiry.id_primary_verified_1 || enquiry.id_secondary_verified_1) ? 'amber' : 'red';
      },
      desc: 'Primary & secondary ID for all applicants',
    },
    {
      label: 'Financial Checks',
      icon: CreditCard,
      getStatus: () => {
        const all = enquiry.bank_statements_received && enquiry.source_of_funds_verified && enquiry.employment_check_completed && enquiry.credit_check_completed;
        const any = enquiry.bank_statements_received || enquiry.source_of_funds_verified || enquiry.employment_check_completed || enquiry.credit_check_completed;
        return all ? 'green' : any ? 'amber' : 'red';
      },
      desc: 'Bank statements, source of funds, employment & credit',
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
      onUpdate();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const confirmDepositReceived = async () => {
    setSaving(true);
    try {
      const receivedDate = hdReceivedDate || new Date().toISOString().split('T')[0];
      const receivedAmount = Number(hdReceivedAmount) || enquiry.holding_deposit_amount;
      await api.put(`/api/tenant-enquiries/${enquiryId}`, {
        first_name_1: enquiry.first_name_1, last_name_1: enquiry.last_name_1,
        email_1: enquiry.email_1, status: enquiry.status,
        holding_deposit_received: 1,
        holding_deposit_received_date: receivedDate,
        holding_deposit_received_amount: receivedAmount,
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
        <p style="font-size: 15px; color: #333;">Dear ${applicantName},</p>
        <p style="font-size: 14px; color: #555; line-height: 1.6;">
          Thank you for your interest in renting <strong>${propertyAddress}</strong>. We are pleased to invite you to complete your tenancy application.
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
        <p style="font-size: 14px; color: #555;">
          Kind regards,<br/><strong>Fleming Lettings</strong><br/>
          <span style="font-size: 12px; color: #888;">01902 212 415 | accounts@fleminglettings.co.uk</span>
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

  const sendApplicationEmail = async ({ subject, bodyHtml }: { subject: string; bodyHtml: string }) => {
    setSendingEmail(true);
    try {
      await api.post(`/api/tenant-enquiries/${enquiryId}/send-application-email`, {
        subject,
        body_html: bodyHtml,
      });
      setShowApplicationEmail(false);
      onUpdate();
    } catch (err) {
      console.error('Failed to send application email:', err);
    }
    setSendingEmail(false);
  };

  const StatusDot = ({ status }: { status: string }) => (
    <div className={`w-3 h-3 rounded-full ${STATUS[status as keyof typeof STATUS]?.dot || STATUS.red.dot}`} />
  );

  const StepCard = ({ idx, step, children }: { idx: number; step: typeof steps[0]; children: React.ReactNode }) => {
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
  };

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
          <StepCard idx={0} step={steps[0]}>
            {enquiry.holding_deposit_requested ? (
              <div className="space-y-3">
                {/* Email sent confirmation */}
                <div className="text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle size={14} /> Email sent to {enquiry.email_1} on {enquiry.onboarding_email_sent_at ? new Date(enquiry.onboarding_email_sent_at as string | number).toLocaleDateString('en-GB') : 'N/A'}
                </div>

                {/* Financial summary */}
                <div className="bg-[var(--bg-subtle)] rounded-lg p-3 grid grid-cols-3 gap-3">
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

                {/* Email & attachments summary */}
                <div className="bg-[var(--bg-subtle)] rounded-lg p-3 space-y-2">
                  <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Email Summary</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)]">To</p>
                      <p className="text-xs text-[var(--text-primary)]">{enquiry.email_1}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)]">From</p>
                      <p className="text-xs text-[var(--text-primary)]">accounts@fleminglettings.co.uk</p>
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
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">Attachments</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-secondary)] bg-[var(--bg-hover)] rounded px-2 py-1">
                        <Paperclip size={10} /> Holding Deposit Request (PDF)
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
                <div className="grid grid-cols-3 gap-3">
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
                  <p>From: accounts@fleminglettings.co.uk</p>
                  <p>Includes: Holding Deposit PDF + Application Form Link</p>
                </div>
                <Button variant="gradient" onClick={requestHoldingDeposit} disabled={saving || !hdMonthlyRent || !hdHoldingDeposit}>
                  {saving ? 'Sending...' : 'Send Email & Application Link'}
                </Button>
              </>
            )}
          </StepCard>

          {/* Step 2: Holding Deposit Received */}
          <StepCard idx={1} step={steps[1]}>
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
          <StepCard idx={2} step={steps[2]}>
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
                        <Send size={14} /> Send Application Email
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

          {/* Step 4: ID Verification */}
          <StepCard idx={3} step={steps[3]}>
            <div className="space-y-2">
              {/* Hidden file input shared across all upload buttons */}
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx" onChange={handleFileSelected} />

              {/* Applicant 1 */}
              <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Applicant 1 — {enquiry.first_name_1}</p>
              {[
                { docType: 'Primary ID', verifiedKey: 'id_primary_verified_1' as const },
                { docType: 'Secondary ID', verifiedKey: 'id_secondary_verified_1' as const },
              ].map(({ docType, verifiedKey }) => {
                const docs = enquiryDocs.filter(d => d.doc_type === docType);
                return (
                  <div key={verifiedKey} className="bg-[var(--bg-hover)]/50 rounded-lg px-3 py-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">{docType}</span>
                      <div className="flex gap-1">
                        <button onClick={() => handleUploadClick(docType)} disabled={uploading === docType}
                          className="px-2 py-1 rounded-lg text-[10px] font-medium bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-input)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1">
                          <Upload size={10} /> {uploading === docType ? 'Uploading…' : 'Upload'}
                        </button>
                        <button onClick={() => updateField({ [verifiedKey]: enquiry[verifiedKey] ? 0 : 1 })} disabled={saving}
                          className={`px-3 py-1 rounded-lg text-[10px] font-medium transition-colors ${enquiry[verifiedKey] ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-input)]'}`}>
                          {enquiry[verifiedKey] ? 'Verified' : 'Mark Verified'}
                        </button>
                      </div>
                    </div>
                    {docs.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between bg-[var(--bg-subtle)] rounded px-2 py-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={12} className="text-[var(--text-muted)] shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] text-[var(--text-primary)] truncate">{doc.original_name}</p>
                            <p className="text-[10px] text-[var(--text-muted)]">{new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <a href={`${API_URL}/api/documents/download/${doc.id}`} target="_blank" rel="noopener noreferrer"
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5"><Download size={12} /></a>
                          <button onClick={() => handleDeleteDoc(doc.id)}
                            className="text-[var(--text-muted)] hover:text-red-400 p-0.5"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Applicant 2 (joint only) */}
              {isJoint && (
                <>
                  <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider mt-3">Applicant 2 — {enquiry.first_name_2 || 'Joint'}</p>
                  {[
                    { docType: 'Primary ID', verifiedKey: 'id_primary_verified_2' as const },
                    { docType: 'Secondary ID', verifiedKey: 'id_secondary_verified_2' as const },
                  ].map(({ docType, verifiedKey }) => {
                    const a2DocType = `${docType} (Applicant 2)`;
                    const docs = enquiryDocs.filter(d => d.doc_type === a2DocType);
                    return (
                      <div key={verifiedKey} className="bg-[var(--bg-hover)]/50 rounded-lg px-3 py-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs">{docType}</span>
                          <div className="flex gap-1">
                            <button onClick={() => handleUploadClick(a2DocType)} disabled={uploading === a2DocType}
                              className="px-2 py-1 rounded-lg text-[10px] font-medium bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-input)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1">
                              <Upload size={10} /> {uploading === a2DocType ? 'Uploading…' : 'Upload'}
                            </button>
                            <button onClick={() => updateField({ [verifiedKey]: enquiry[verifiedKey] ? 0 : 1 })} disabled={saving}
                              className={`px-3 py-1 rounded-lg text-[10px] font-medium transition-colors ${enquiry[verifiedKey] ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-input)]'}`}>
                              {enquiry[verifiedKey] ? 'Verified' : 'Mark Verified'}
                            </button>
                          </div>
                        </div>
                        {docs.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between bg-[var(--bg-subtle)] rounded px-2 py-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText size={12} className="text-[var(--text-muted)] shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[11px] text-[var(--text-primary)] truncate">{doc.original_name}</p>
                                <p className="text-[10px] text-[var(--text-muted)]">{new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <a href={`${API_URL}/api/documents/download/${doc.id}`} target="_blank" rel="noopener noreferrer"
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5"><Download size={12} /></a>
                              <button onClick={() => handleDeleteDoc(doc.id)}
                                className="text-[var(--text-muted)] hover:text-red-400 p-0.5"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </StepCard>

          {/* Step 5: Financial Checks */}
          <StepCard idx={4} step={steps[4]}>
            <div className="space-y-2">
              {[
                { key: 'bank_statements_received', label: '3 Months Bank Statements' },
                { key: 'source_of_funds_verified', label: 'Source of Funds' },
                { key: 'employment_check_completed', label: 'Employment Check' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between bg-[var(--bg-hover)]/50 rounded-lg px-3 py-2">
                  <span className="text-xs">{item.label}</span>
                  <button onClick={() => updateField({ [item.key]: enquiry[item.key] ? 0 : 1 })} disabled={saving}
                    className={`px-3 py-1 rounded-lg text-[10px] font-medium transition-colors ${enquiry[item.key] ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-input)]'}`}>
                    {enquiry[item.key] ? 'Complete' : 'Mark Complete'}
                  </button>
                </div>
              ))}
              <div className="h-px bg-[var(--border-subtle)]" />
              <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Credit Check</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[var(--text-muted)] mb-1">Credit Score</label>
                  <input type="text" value={creditScore} onChange={e => setCreditScore(e.target.value)} placeholder="e.g. 720"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                </div>
                <div className="flex items-end">
                  <Button variant={enquiry.credit_check_completed ? 'outline' : 'gradient'} size="sm" onClick={() => updateField({
                    credit_check_completed: 1, credit_score: creditScore, credit_check_date: new Date().toISOString().split('T')[0],
                  })} disabled={saving || !creditScore}>
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
          <StepCard idx={5} step={steps[5]}>
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
        from="accounts@fleminglettings.co.uk"
        initialSubject={`Tenancy Application – ${propertyAddress}`}
        initialBodyHtml={buildTenancyApplicationEmailHtml()}
        sendLabel="Send Application Email"
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
              <div className="flex gap-2"><span className="text-[var(--text-muted)] w-12">From:</span><span>accounts@fleminglettings.co.uk</span></div>
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

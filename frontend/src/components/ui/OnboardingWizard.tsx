import React, { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { Button, DatePicker } from './index';
import EmailPreviewModal from './EmailPreviewModal';
import {
  CheckCircle, Circle, Clock, Mail, FileText, Shield, CreditCard,
  ChevronDown, AlertTriangle, User, X, Send,
  Eye, Download, PoundSterling, FileSignature, CalendarDays
} from 'lucide-react';
import { formatPropertyAddress } from '../../utils/propertyAddress';

const API_URL = import.meta.env.VITE_API_URL || '';

function dateInputValue(value: unknown): string {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const uk = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  return uk ? `${uk[3]}-${uk[2]}-${uk[1]}` : '';
}

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
  onUpdate: () => void | Promise<void>;
}

export default function OnboardingWizard({ enquiryId, enquiry, properties, users, onClose, onUpdate }: OnboardingWizardProps) {
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
  const [hdReceiptSendEmail, setHdReceiptSendEmail] = useState(true);
  const [hdReceiptSendSms, setHdReceiptSendSms] = useState(false);

  // Step 5: Credit check
  const [creditScore, setCreditScore] = useState('');
  const [creditReport, setCreditReport] = useState<File | null>(null);
  const [replacingCreditReport, setReplacingCreditReport] = useState(false);
  const [creditCheckCompleteOverride, setCreditCheckCompleteOverride] = useState(false);
  const [agreement, setAgreement] = useState<{ id: number; agreement_type: string; original_name: string; status: string; requires_landlord_signature: number; requires_joint_tenant_signature: number; tenant_signed_at?: string; joint_tenant_signed_at?: string; landlord_signed_at?: string } | null>(null);
  const [agreementCompliance, setAgreementCompliance] = useState<{
    ready: boolean;
    propertyLinked: boolean;
    items: Array<{ docType: string; label: string; expiryDate: string | null; ready: boolean; reason: string | null }>;
    agreementType?: 'internal' | 'client';
    serviceType?: string | null;
    paymentRoute?: 'fleming_operating' | 'fleming_client_money' | 'landlord';
    landlordName?: string | null;
    jointApplicantsReady?: boolean;
    jointApplicant?: { name: string; applicationComplete: boolean; applicationApproved: boolean; creditCheckComplete: boolean } | null;
    defaults?: { tenancyStartDate?: string; rent?: string | number; deposit?: string | number; permittedOccupiers?: string; sharedFacilities?: string; parking?: string };
  } | null>(null);
  const [agreementStartDate, setAgreementStartDate] = useState('');
  const [agreementRent, setAgreementRent] = useState('');
  const [agreementDeposit, setAgreementDeposit] = useState('');
  const [agreementOccupiers, setAgreementOccupiers] = useState('');
  const [agreementFacilities, setAgreementFacilities] = useState('');
  const [agreementParking, setAgreementParking] = useState('');
  const [landlordBankSortCode, setLandlordBankSortCode] = useState('');
  const [landlordBankAccountNumber, setLandlordBankAccountNumber] = useState('');
  const [landlordBankAccountName, setLandlordBankAccountName] = useState('');
  const [landlordBankName, setLandlordBankName] = useState('');
  const [agreementSendEmail, setAgreementSendEmail] = useState(true);
  const [agreementSendSms, setAgreementSendSms] = useState(false);
  const [agreementEmailMessage, setAgreementEmailMessage] = useState('Your tenancy agreement for {{property_address}} is ready to review and sign.');
  const [agreementSmsMessage, setAgreementSmsMessage] = useState('Hi {{first_name}}, your Fleming Lettings tenancy agreement is ready to review and sign: {{signing_link}}');
  const [balanceSendEmail, setBalanceSendEmail] = useState(false);
  const [balanceSendSms, setBalanceSendSms] = useState(false);
  const [balanceEmailMessage, setBalanceEmailMessage] = useState('Your tenancy agreement has been completed. The remaining balance for {{property_address}} is set out below.');
  const [balanceSmsMessage, setBalanceSmsMessage] = useState('Hi {{first_name}}, thank you for signing your tenancy agreement and completing our application and screening process. We have emailed your final payment details so we can arrange a handover date and location.');
  const [handoverDate, setHandoverDate] = useState('');
  const [handoverTime, setHandoverTime] = useState('10:00');
  const [handoverAssignedTo, setHandoverAssignedTo] = useState('');
  const [handoverWithLandlord, setHandoverWithLandlord] = useState(false);
  const [handoverSendEmail, setHandoverSendEmail] = useState(false);
  const [handoverSendSms, setHandoverSendSms] = useState(false);
  const [handoverEmailMessage, setHandoverEmailMessage] = useState('Finally, we’re nearly there! Your move in and handover appointment is confirmed. We will meet you at the property to conduct the inventory, hand over the keys and answer any final questions that you may have.');
  const [handoverSmsMessage, setHandoverSmsMessage] = useState('Hi {{first_name}}, your Fleming Lettings move in and handover appointment is confirmed for {{handover_date}} at {{handover_time}} at {{property_address}} with {{appointment_with}}.');
  const [reviewNotes, setReviewNotes] = useState('');
  const [changesRequired, setChangesRequired] = useState('');
  const [sendReviewSms, setSendReviewSms] = useState(false);
  const [sendReviewEmail, setSendReviewEmail] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewStatusOverride, setReviewStatusOverride] = useState<string | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{ url: string; name: string; mimeType: string } | null>(null);

  // Application email modal
  const [showApplicationEmail, setShowApplicationEmail] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Holding deposit email preview modal
  const [showHDEmailPreview, setShowHDEmailPreview] = useState(false);

  // Documents for ID verification step
  const [enquiryDocs, setEnquiryDocs] = useState<{ id: number; doc_type: string; original_name: string; mime_type: string; size: number; uploaded_at: string; review_status?: string; review_notes?: string; reviewed_at?: string }[]>([]);
  const [emailMessages, setEmailMessages] = useState<{ id: number; template: string; status: string; error_message?: string; created_at: string }[]>([]);

  const fetchDocs = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/api/documents/tenant_enquiry/${enquiryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (Array.isArray(data)) setEnquiryDocs(data);
    } catch { /* document refresh is non-blocking */ }
  };

  const fetchEmailHistory = async () => {
    try {
      const data = await api.get(`/api/email-history/tenant_enquiry/${enquiryId}`);
      if (Array.isArray(data)) setEmailMessages(data);
    } catch { /* email refresh is non-blocking */ }
  };

  const fetchAgreement = async () => {
    try {
      const data = await api.get(`/api/tenant-enquiries/${enquiryId}/tenancy-agreement`);
      setAgreement(data || null);
    } catch { setAgreement(null); }
  };

  const fetchAgreementCompliance = async () => {
    try {
      const data = await api.get(`/api/tenant-enquiries/${enquiryId}/tenancy-agreement-compliance`);
      setAgreementCompliance(data || null);
      if (data?.defaults) {
        setAgreementStartDate(current => current || dateInputValue(data.defaults.tenancyStartDate));
        setAgreementRent(current => current || String(data.defaults.rent || ''));
        setAgreementDeposit(current => current || String(data.defaults.deposit || ''));
        setAgreementOccupiers(current => current || String(data.defaults.permittedOccupiers || ''));
        setAgreementFacilities(current => current || String(data.defaults.sharedFacilities || ''));
        setAgreementParking(current => current || String(data.defaults.parking || ''));
      }
    } catch { setAgreementCompliance(null); }
  };

  // Fetch documents for this enquiry
  useEffect(() => { fetchDocs(); fetchEmailHistory(); fetchAgreement(); fetchAgreementCompliance(); }, [enquiryId, token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    if (documentPreview) URL.revokeObjectURL(documentPreview.url);
  }, [documentPreview]);

  const reviewDocument = async (docId: number, status: 'approved' | 'rejected') => {
    setSaving(true);
    setReviewError('');
    try {
      await api.put(`/api/documents/${docId}/review`, {
        status,
        notes: status === 'rejected' ? changesRequired.trim() : (reviewNotes.trim() || null),
      });
      await Promise.all([fetchDocs(), onUpdate()]);
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

  const viewDocument = async (docId: number, originalName: string) => {
    if (!token) return;
    const response = await fetch(`${API_URL}/api/documents/download/${docId}?disposition=inline`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setReviewError('Document preview failed');
      return;
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    setDocumentPreview({ url: href, name: originalName, mimeType: blob.type });
  };

  const closeDocumentPreview = () => {
    if (documentPreview) URL.revokeObjectURL(documentPreview.url);
    setDocumentPreview(null);
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
      setReviewStatusOverride(status);
      await Promise.all([fetchEmailHistory(), fetchDocs(), onUpdate()]);
      setActiveStep(status === 'changes_requested' ? 3 : 4);
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
    setHandoverDate(enquiry.handover_date ? String(enquiry.handover_date).slice(0, 10) : '');
    setHandoverTime(enquiry.handover_time ? String(enquiry.handover_time).slice(0, 5) : '10:00');
    setHandoverAssignedTo(enquiry.handover_assigned_to || '');
    setHandoverWithLandlord(Boolean(enquiry.handover_with_landlord));
    setReviewNotes('');
    setReviewStatusOverride(null);
    setCreditCheckCompleteOverride(false);
    setReplacingCreditReport(false);
    setChangesRequired(enquiry.application_review_status === 'changes_requested' ? enquiry.application_review_notes || '' : '');
    // Set active step based on progress
    if (!enquiry.holding_deposit_requested) setActiveStep(0);
    else if (!enquiry.holding_deposit_received) setActiveStep(1);
    else if (!enquiry.application_form_completed) setActiveStep(2);
    else if (enquiry.application_review_status !== 'approved') setActiveStep(3);
    else if (!enquiry.credit_check_completed) setActiveStep(4);
    else if (agreement?.status !== 'completed') setActiveStep(5);
    else if (!enquiry.balance_payment_received) setActiveStep(6);
    else if (!enquiry.handover_date) setActiveStep(7);
    else setActiveStep(8);
  }, [enquiry, properties, agreement]);

  const name = [enquiry.first_name_1, enquiry.last_name_1].filter(Boolean).join(' ');
  const prop = properties.find(p => p.id === Number(enquiry.linked_property_id));
  const creditReportDocument = enquiryDocs.find(document => document.doc_type === 'Credit Check Report');
  const applicationReviewStatus = reviewStatusOverride || enquiry.application_review_status;
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
      getStatus: () => applicationReviewStatus === 'approved'
        ? 'green'
        : enquiry.application_form_completed ? 'amber' : 'red',
      desc: applicationReviewStatus === 'approved'
        ? 'Application and evidence approved'
        : applicationReviewStatus === 'changes_requested'
          ? 'Waiting on tenant review'
          : 'Review the submitted form and evidence',
    },
    {
      label: 'Run Credit Check',
      icon: CreditCard,
      getStatus: () => enquiry.credit_check_completed || creditCheckCompleteOverride ? 'green' : 'red',
      desc: enquiry.credit_check_completed || creditCheckCompleteOverride ? `Credit check completed${creditScore ? ` — ${creditScore}` : ''}` : 'Run after the application is approved',
    },
    {
      label: 'Tenancy Agreement for Fleming Lettings Properties',
      icon: FileSignature,
      getStatus: () => agreement?.status === 'completed' ? 'green' : agreement ? 'amber' : 'red',
      desc: agreement?.status === 'completed' ? 'Agreement signed and stored' : agreement ? 'Waiting for required signatures' : 'Generate and issue the agreement for e-signature',
    },
    {
      label: 'Final Balance',
      icon: PoundSterling,
      getStatus: () => enquiry.balance_payment_received ? 'green' : enquiry.balance_payment_requested ? 'amber' : 'red',
      desc: enquiry.balance_payment_received
        ? `Payment received${enquiry.balance_payment_received_at ? ` on ${new Date(enquiry.balance_payment_received_at).toLocaleDateString('en-GB')}` : ''}`
        : enquiry.balance_payment_requested ? `Waiting for £${Number(enquiry.balance_due_amount || 0).toLocaleString()}` : 'Request deposit and first rent balance',
    },
    {
      label: 'Schedule Handover',
      icon: CalendarDays,
      getStatus: () => enquiry.handover_date ? 'green' : 'red',
      desc: enquiry.handover_date ? `${String(enquiry.handover_date).slice(0, 10)} at ${String(enquiry.handover_time || '').slice(0, 5)}` : 'Assign the property handover to the team calendar',
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
      setActiveStep(1);
      await onUpdate();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Holding deposit email could not be sent');
    }
    setSaving(false);
  };

  const confirmDepositReceived = async () => {
    setSaving(true);
    setReviewError('');
    try {
      const receivedDate = hdReceivedDate || new Date().toISOString().split('T')[0];
      const receivedAmount = Number(hdReceivedAmount) || enquiry.holding_deposit_amount;
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/confirm-holding-deposit`, {
        amount: receivedAmount,
        received_date: receivedDate,
        send_email: hdReceiptSendEmail,
        send_sms: hdReceiptSendSms,
      });
      const failed = Object.values((result?.delivery || {}) as Record<string, { success: boolean; error?: string }>).filter(item => !item.success);
      if (failed.length) setReviewError(`Deposit saved, but communication failed: ${failed.map(item => item.error).join('; ')}`);
      await Promise.all([fetchEmailHistory(), onUpdate()]);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Holding deposit could not be confirmed');
    }
    setSaving(false);
  };

  const convertToTenant = async () => {
    setSaving(true);
    try {
      await api.post(`/api/tenant-enquiries/${enquiryId}/convert`, {
        property_id: enquiry.linked_property_id,
        tenancy_start_date: agreementStartDate || new Date().toISOString().split('T')[0],
        tenancy_type: 'Assured Periodic Tenancy',
      });
      await onUpdate();
      onClose();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const saveCreditCheck = async () => {
    if (!token || !creditScore.trim() || !creditReport) return;
    setSaving(true);
    setReviewError('');
    try {
      const body = new FormData();
      body.append('score', creditScore.trim());
      body.append('report', creditReport);
      const response = await fetch(`${API_URL}/api/tenant-enquiries/${enquiryId}/credit-check`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Credit check could not be saved');
      setCreditReport(null);
      setReplacingCreditReport(false);
      setCreditCheckCompleteOverride(true);
      await Promise.all([fetchDocs(), onUpdate()]);
      setActiveStep(5);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Credit check could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const issueAgreement = async () => {
    if (!token) return;
    setSaving(true); setReviewError('');
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/tenancy-agreement`, {
        tenancy_start_date: agreementStartDate,
        rent: agreementRent,
        deposit: agreementDeposit,
        permitted_occupiers: agreementOccupiers,
        shared_facilities: agreementFacilities,
        parking: agreementParking,
        landlord_bank_sort_code: landlordBankSortCode,
        landlord_bank_account_number: landlordBankAccountNumber,
        landlord_bank_account_name: landlordBankAccountName,
        landlord_bank_name: landlordBankName,
        send_email: agreementSendEmail,
        send_sms: agreementSendSms,
        email_message: agreementEmailMessage,
        sms_message: agreementSmsMessage,
      });
      const failures = Object.values(result.delivery || {}).filter((item: any) => item && item.success === false); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (failures.length) setReviewError(`Agreement issued, but ${failures.length} communication${failures.length === 1 ? '' : 's'} failed. Check the email/SMS history.`);
      await Promise.all([fetchAgreement(), fetchAgreementCompliance(), fetchEmailHistory(), onUpdate()]);
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Agreement could not be issued'); }
    finally { setSaving(false); }
  };

  const requestBalance = async () => {
    setSaving(true); setReviewError('');
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/request-balance`, {
        send_email: balanceSendEmail, send_sms: balanceSendSms,
        email_message: balanceEmailMessage, sms_message: balanceSmsMessage,
      });
      const failures = Object.values(result?.delivery || {}).filter((item: any) => item && item.success === false); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (failures.length) setReviewError('Balance request saved, but the email failed. Check the email history.');
      await Promise.all([fetchEmailHistory(), onUpdate()]);
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Balance request could not be saved'); }
    finally { setSaving(false); }
  };

  const confirmBalance = async () => {
    setSaving(true); setReviewError('');
    try {
      await api.post(`/api/tenant-enquiries/${enquiryId}/confirm-balance`, {});
      await onUpdate();
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Balance receipt could not be saved'); }
    finally { setSaving(false); }
  };

  const scheduleHandover = async () => {
    setSaving(true); setReviewError('');
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/schedule-handover`, {
        handover_date: handoverDate, handover_time: handoverTime, assigned_to: handoverAssignedTo,
        send_email: handoverSendEmail, send_sms: handoverSendSms,
        with_landlord: handoverWithLandlord,
        email_message: handoverEmailMessage, sms_message: handoverSmsMessage,
      });
      const failures = Object.values(result?.delivery || {}).filter((item: any) => item && item.success === false); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (failures.length) setReviewError(`Handover saved, but ${failures.length} communication${failures.length === 1 ? '' : 's'} failed.`);
      await onUpdate();
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Handover could not be scheduled'); }
    finally { setSaving(false); }
  };

  const propertyAddress = (() => {
    const prop = properties.find(p => p.id === enquiry.linked_property_id);
    return prop ? formatPropertyAddress(prop.address, prop.postcode) : '';
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
  const applicationUrl = `https://apply.fleminglettings.co.uk/onboarding/${enquiry.application_form_token || ''}`;
  const reviewSmsPreview = `Hi there ${enquiry.first_name_1 || 'there'}, thank you for completing your application forms with Fleming Lettings. We have reviewed your application and still require further information or documentation from you. Please click on this link to jump back in: ${applicationUrl}. If you need any help, then please contact our office on 01902 212 415.`;
  const reviewEmailPreview = `Subject: More information required for your tenancy application\n\nHi ${enquiry.first_name_1 || 'there'},\n\nThank you for completing your application forms with Fleming Lettings. We have reviewed your application and still require further information or documentation from you.\n\nWhat we need to complete your application:\n${changesRequired || '[Enter the changes or information required above]'}\n\nUpdate your application: ${applicationUrl}\n\nIf you need any help, please contact our office on 01902 212 415.`;
  const landlordBankComplete = agreementCompliance?.paymentRoute !== 'landlord' || Boolean(
    landlordBankSortCode.trim() && landlordBankAccountNumber.trim() && landlordBankAccountName.trim() && landlordBankName.trim()
  );
  const agreementServiceComplete = agreementCompliance?.agreementType !== 'client' || ['let_only', 'rent_collection', 'full_management'].includes(String(agreementCompliance?.serviceType || ''));
  const agreementDetailsComplete = Boolean(agreementStartDate && agreementRent && agreementDeposit !== ''
    && agreementOccupiers.trim() && agreementFacilities.trim() && agreementParking.trim()
    && landlordBankComplete && agreementServiceComplete);

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
              {prop ? formatPropertyAddress(prop.address, prop.postcode) : 'No property linked'}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 rounded-lg bg-[var(--bg-subtle)] px-3 py-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={hdReceiptSendEmail} onChange={event => setHdReceiptSendEmail(event.target.checked)} className="accent-orange-500" /> Email confirmation
                    </label>
                    <label className="flex items-center gap-2 rounded-lg bg-[var(--bg-subtle)] px-3 py-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={hdReceiptSendSms} onChange={event => setHdReceiptSendSms(event.target.checked)} className="accent-orange-500" /> SMS confirmation
                    </label>
                  </div>
                  <Button variant="gradient" onClick={confirmDepositReceived} disabled={saving}>
                    {saving ? 'Saving...' : 'Confirm Deposit Received'}
                  </Button>
                  {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
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
                      {(() => {
                        const completedApplication = enquiryDocs.find(doc => doc.doc_type === 'Completed Tenancy Application');
                        return completedApplication ? (
                          <Button variant="outline" onClick={() => downloadDocument(completedApplication.id, completedApplication.original_name)} className="flex items-center gap-2">
                            <Download size={14} /> Download Completed Application Form
                          </Button>
                        ) : <p className="text-xs text-amber-400">The completed application PDF is being prepared.</p>;
                      })()}
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
              ) : applicationReviewStatus === 'changes_requested' ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <p className="text-sm font-medium text-amber-400">Waiting on tenant review</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">The applicant has been asked to update and resubmit their application.</p>
                  {changesRequired && <p className="mt-3 text-xs text-[var(--text-primary)] whitespace-pre-wrap">{changesRequired}</p>}
                  {reviewError && <p className="mt-2 text-xs text-red-400">{reviewError}</p>}
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
                              <button onClick={() => viewDocument(doc.id, doc.original_name)} className="px-2 py-1 rounded text-[10px] bg-sky-500/15 text-sky-400 flex items-center gap-1"><Eye size={10} />View</button>
                              <button onClick={() => downloadDocument(doc.id, doc.original_name)} className="px-2 py-1 rounded text-[10px] bg-[var(--bg-hover)] text-[var(--text-secondary)] flex items-center gap-1"><Download size={10} />Download</button>
                              <button onClick={() => reviewDocument(doc.id, 'approved')} disabled={saving} className="px-2 py-1 rounded text-[10px] bg-emerald-500/15 text-emerald-400">Approve</button>
                              <button onClick={() => reviewDocument(doc.id, 'rejected')} disabled={saving || !changesRequired.trim()} title={!changesRequired.trim() ? 'Enter the changes or information required first' : undefined} className="px-2 py-1 rounded text-[10px] bg-red-500/15 text-red-400 disabled:opacity-40">Reject</button>
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
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">Changes / information required *</label>
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
                  {sendReviewSms && (
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1">SMS preview</label>
                      <textarea readOnly value={reviewSmsPreview} rows={5}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] resize-none" />
                    </div>
                  )}
                  {sendReviewEmail && (
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1">Email preview</label>
                      <textarea readOnly value={reviewEmailPreview} rows={8}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] resize-none" />
                    </div>
                  )}
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
              {applicationReviewStatus !== 'approved' && (
                <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400" /> Approve the application before recording a credit check.
                </div>
              )}
              <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Credit Check Result</p>
              {creditReportDocument && !replacingCreditReport && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <FileText size={15} className="text-emerald-400" />
                  <span className="min-w-0 flex-1 truncate text-xs">{creditReportDocument.original_name}</span>
                  <Button variant="ghost" size="sm" onClick={() => viewDocument(creditReportDocument.id, creditReportDocument.original_name)}><Eye size={13} className="mr-1" />View</Button>
                  <Button variant="ghost" size="sm" onClick={() => downloadDocument(creditReportDocument.id, creditReportDocument.original_name)}><Download size={13} className="mr-1" />Download</Button>
                  <Button variant="outline" size="sm" onClick={() => setReplacingCreditReport(true)}>Replace</Button>
                </div>
              )}
              {(!creditReportDocument || replacingCreditReport) && <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">Credit Score</label>
                    <input type="text" value={creditScore} onChange={e => setCreditScore(e.target.value)} placeholder="e.g. 720"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Upload Credit Report *</label>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={event => setCreditReport(event.target.files?.[0] || null)}
                      className="block w-full text-xs text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-hover)] file:px-3 file:py-2 file:text-xs file:text-[var(--text-primary)]" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant={enquiry.credit_check_completed ? 'outline' : 'gradient'} size="sm" onClick={saveCreditCheck}
                    disabled={saving || !creditScore.trim() || !creditReport || applicationReviewStatus !== 'approved'}>
                    {saving ? 'Saving...' : enquiry.credit_check_completed ? 'Save Replacement' : 'Save Score & Report'}
                  </Button>
                  {replacingCreditReport && <Button variant="ghost" size="sm" onClick={() => { setReplacingCreditReport(false); setCreditReport(null); }}>Cancel</Button>}
                </div>
              </>}
              {!enquiry.credit_check_completed && <p className="text-[10px] text-amber-400">A score and uploaded report are both required before onboarding can continue.</p>}
              {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
              {enquiry.credit_score && (
                <div className="text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle size={14} /> Credit score: {enquiry.credit_score}
                  {enquiry.credit_check_date && ` (checked ${new Date(enquiry.credit_check_date).toLocaleDateString('en-GB')})`}
                </div>
              )}
            </div>
          </StepCard>

          {/* Step 6: Tenancy Agreement */}
          <StepCard idx={5} step={steps[5]} {...stepCardProps}>
            {allPreviousComplete(5) ? (
              <div className="space-y-3">
                {agreement && <div className={`p-3 rounded-lg border ${agreement.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                  <p className="text-sm font-medium">{agreement.original_name}</p>
                  <p className="text-xs mt-1">{agreement.status === 'completed' ? 'All required signatures completed; signed PDF stored in Documents.' : `Status: ${agreement.status.replace('_', ' ')}${agreement.requires_joint_tenant_signature ? ' · both tenants must sign' : ''}${agreement.requires_landlord_signature ? ' · landlord must sign' : ''}`}</p>
                </div>}
                {agreement && agreement.status !== 'completed' && <Button variant="ghost" size="sm" onClick={fetchAgreement}>Refresh Signatures</Button>}
                {agreement?.status !== 'completed' && <>
                  <div className={`rounded-lg border p-3 ${agreementCompliance?.ready ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-amber-500/20 bg-amber-500/10'}`}>
                    <p className="text-xs font-medium">Property compliance</p>
                    {!agreementCompliance?.propertyLinked ? (
                      <p className="mt-1 text-[10px] text-amber-400">Link a property before issuing the agreement.</p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {agreementCompliance.items.map(item => (
                          <div key={item.docType} className={`flex items-center justify-between gap-2 text-[10px] ${item.ready ? 'text-emerald-400' : 'text-amber-400'}`}>
                            <span className="flex items-center gap-1.5">
                              {item.ready ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
                              {item.ready ? `${item.label} valid to ${new Date(`${item.expiryDate}T00:00:00`).toLocaleDateString('en-GB')}` : item.reason}
                            </span>
                            {!item.ready && enquiry.linked_property_id && (
                              <a href={`/properties/${enquiry.linked_property_id}`} className="shrink-0 underline font-medium text-amber-300">Click to add document</a>
                            )}
                          </div>
                        ))}
                        {agreementCompliance.ready && <p className="pt-1 text-[10px] text-emerald-400">These documents will be attached when the signing link is emailed.</p>}
                      </div>
                    )}
                  </div>
                  {agreementCompliance?.jointApplicant && (
                    <div className={`rounded-lg border p-3 text-xs ${agreementCompliance.jointApplicantsReady ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-amber-500/20 bg-amber-500/10'}`}>
                      <p className="font-medium">Joint applicant: {agreementCompliance.jointApplicant.name}</p>
                      <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                        Application {agreementCompliance.jointApplicant.applicationComplete ? 'complete' : 'incomplete'} · review {agreementCompliance.jointApplicant.applicationApproved ? 'approved' : 'pending'} · credit check {agreementCompliance.jointApplicant.creditCheckComplete ? 'complete' : 'pending'}
                      </p>
                      {!agreementCompliance.jointApplicantsReady && <p className="mt-1 text-[10px] text-amber-400">Both applicants must reach this stage before one shared tenancy agreement can be issued.</p>}
                    </div>
                  )}
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-xs space-y-1">
                    <p className="font-medium text-[var(--text-primary)]">
                      {agreementCompliance?.agreementType === 'client' ? `Client agreement · ${agreementCompliance.landlordName || 'landlord'}` : 'Tenancy Agreement for Fleming Lettings Properties'}
                    </p>
                    <p className="text-[var(--text-muted)]">
                      {agreementCompliance?.paymentRoute === 'landlord'
                        ? 'Let-only: first month to Fleming client money; future rent direct to the landlord.'
                        : agreementCompliance?.paymentRoute === 'fleming_client_money'
                          ? 'Rent collection/full management: rent paid to Fleming client money.'
                          : 'Fleming-owned: rent paid to the Fleming operating account.'}
                    </p>
                    {agreementCompliance?.agreementType === 'client' && <p className="text-[var(--text-muted)]">Signing order: landlord first, then tenant automatically.</p>}
                    {!agreementServiceComplete && <p className="text-amber-400">Set the service type on the property before generating the agreement.</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                    <DatePicker label="Tenancy start *" value={agreementStartDate} onChange={setAgreementStartDate} />
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1">Monthly rent *</label>
                      <input type="number" min="0.01" step="0.01" value={agreementRent} onChange={event => setAgreementRent(event.target.value)} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1">Security deposit *</label>
                      <input type="number" min="0" step="0.01" value={agreementDeposit} onChange={event => setAgreementDeposit(event.target.value)} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-[10px] text-[var(--text-muted)]">Who are the permitted occupiers? *<input type="text" value={agreementOccupiers} onChange={event => setAgreementOccupiers(event.target.value)} placeholder="Enter names, or None" className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-3 text-xs" /></label>
                    <label className="text-[10px] text-[var(--text-muted)]">Are there shared facilities? *<input type="text" value={agreementFacilities} onChange={event => setAgreementFacilities(event.target.value)} placeholder="Describe them, or None" className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-3 text-xs" /></label>
                    <label className="text-[10px] text-[var(--text-muted)] sm:col-span-2">Is there permitted parking, and if so where? *<input type="text" value={agreementParking} onChange={event => setAgreementParking(event.target.value)} placeholder="Describe it, or None" className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-3 text-xs" /></label>
                  </div>
                  {agreementCompliance?.paymentRoute === 'landlord' && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 space-y-2">
                      <p className="text-xs font-medium">Landlord bank details for future monthly rent</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input type="text" inputMode="numeric" value={landlordBankSortCode} onChange={event => setLandlordBankSortCode(event.target.value)} placeholder="Sort code *" className="bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs" />
                        <input type="text" inputMode="numeric" value={landlordBankAccountNumber} onChange={event => setLandlordBankAccountNumber(event.target.value)} placeholder="8-digit account number *" className="bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs" />
                        <input type="text" value={landlordBankAccountName} onChange={event => setLandlordBankAccountName(event.target.value)} placeholder="Account name *" className="bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs" />
                        <input type="text" value={landlordBankName} onChange={event => setLandlordBankName(event.target.value)} placeholder="Bank name *" className="bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs" />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={agreementSendEmail} onChange={e => setAgreementSendEmail(e.target.checked)} /> {agreementCompliance?.agreementType === 'client' ? 'Email landlord, then tenant' : 'Email tenant signing link'}</label>
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={agreementSendSms} onChange={e => setAgreementSendSms(e.target.checked)} /> {agreementCompliance?.agreementType === 'client' ? 'SMS tenant after landlord signs' : 'SMS tenant signing link'}</label>
                  </div>
                  {agreementSendEmail && (
                    <label className="block text-[10px] text-[var(--text-muted)]">Editable tenant email preview
                      <textarea value={agreementEmailMessage} onChange={event => setAgreementEmailMessage(event.target.value)} rows={3} className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" />
                    </label>
                  )}
                  {agreementSendSms && (
                    <label className="block text-[10px] text-[var(--text-muted)]">Editable SMS preview
                      <textarea value={agreementSmsMessage} onChange={event => setAgreementSmsMessage(event.target.value)} rows={3} className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" />
                    </label>
                  )}
                  {(agreementSendEmail || agreementSendSms) && <p className="text-[10px] text-[var(--text-muted)]">Available placeholders: {'{{first_name}}'}, {'{{property_address}}'}, {'{{signing_link}}'}.</p>}
                  <Button variant="gradient" size="sm" onClick={issueAgreement} disabled={saving || agreementCompliance?.ready !== true || !agreementDetailsComplete}>{saving ? 'Generating...' : agreement ? 'Generate Replacement Agreement' : 'Generate & Issue Agreement'}</Button>
                </>}
                {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
              </div>
            ) : (
              <div className="text-xs text-[var(--text-muted)] flex items-center gap-2"><AlertTriangle size={14} className="text-amber-400" />Complete the credit check first</div>
            )}
          </StepCard>

          {/* Step 7: Final Balance */}
          <StepCard idx={6} step={steps[6]} {...stepCardProps}>
            {allPreviousComplete(6) ? <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><span className="block text-[10px] text-[var(--text-muted)]">Security deposit</span><strong>£{Number(enquiry.security_deposit_amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
                <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><span className="block text-[10px] text-[var(--text-muted)]">First month’s rent</span><strong>£{Number(enquiry.monthly_rent_agreed || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
                <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><span className="block text-[10px] text-[var(--text-muted)]">Holding deposit received</span><strong>−£{Number(enquiry.holding_deposit_received_amount || enquiry.holding_deposit_amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
                <div className="rounded-lg bg-[#563F6E] p-3 text-white"><span className="block text-[10px] text-white/70">Remaining balance</span><strong>£{Number(enquiry.balance_due_amount || (Number(enquiry.security_deposit_amount || 0) + Number(enquiry.monthly_rent_agreed || 0) - Number(enquiry.holding_deposit_received_amount || enquiry.holding_deposit_amount || 0))).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
              </div>
              {!enquiry.balance_payment_requested && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={balanceSendEmail} onChange={e => setBalanceSendEmail(e.target.checked)} /> Email payment request</label>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={balanceSendSms} onChange={e => setBalanceSendSms(e.target.checked)} /> SMS payment request</label>
              </div>}
              {!enquiry.balance_payment_requested && balanceSendEmail && <label className="block text-[10px] text-[var(--text-muted)]">Editable email preview<textarea value={balanceEmailMessage} onChange={e => setBalanceEmailMessage(e.target.value)} rows={3} className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" /></label>}
              {!enquiry.balance_payment_requested && balanceSendSms && <label className="block text-[10px] text-[var(--text-muted)]">Editable SMS preview<textarea value={balanceSmsMessage} onChange={e => setBalanceSmsMessage(e.target.value)} rows={4} className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" /></label>}
              {!enquiry.balance_payment_requested && (balanceSendEmail || balanceSendSms) && <p className="text-[10px] text-[var(--text-muted)]">Available placeholders: {'{{first_name}}'}, {'{{property_address}}'}, {'{{balance_due}}'}.</p>}
              {!enquiry.balance_payment_requested ? <Button variant="gradient" size="sm" onClick={requestBalance} disabled={saving}>Request Final Balance</Button>
                : !enquiry.balance_payment_received ? <Button variant="gradient" size="sm" onClick={confirmBalance} disabled={saving}>Confirm Payment Received</Button>
                : <p className="text-xs text-emerald-400 flex items-center gap-2"><CheckCircle size={14} /> Final balance received{enquiry.balance_payment_received_at ? ` on ${new Date(enquiry.balance_payment_received_at).toLocaleDateString('en-GB')}` : ''}</p>}
              {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
            </div> : <p className="text-xs text-[var(--text-muted)]">Complete the signed agreement first.</p>}
          </StepCard>

          {/* Step 8: Handover */}
          <StepCard idx={7} step={steps[7]} {...stepCardProps}>
            {allPreviousComplete(7) ? <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <DatePicker label="Handover date *" value={handoverDate} onChange={setHandoverDate} />
                <input type="time" value={handoverTime} onChange={e => setHandoverTime(e.target.value)} className="bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs" />
              </div>
              <select value={handoverWithLandlord ? '__landlord__' : handoverAssignedTo} onChange={e => { const landlord = e.target.value === '__landlord__'; setHandoverWithLandlord(landlord); setHandoverAssignedTo(landlord ? (agreementCompliance?.landlordName || 'With Landlord') : e.target.value); }} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs">
                <option value="">Assign team member…</option>
                <option value="__landlord__">With Landlord</option>
                {users.map(user => <option key={user.id} value={user.name}>{user.name}</option>)}
              </select>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={handoverSendEmail} onChange={e => setHandoverSendEmail(e.target.checked)} /> Email tenant</label>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={handoverSendSms} onChange={e => setHandoverSendSms(e.target.checked)} /> SMS tenant</label>
              </div>
              {handoverWithLandlord && <p className="text-[10px] text-[var(--text-muted)]">The landlord is included in the selected email/SMS channels.</p>}
              {handoverSendEmail && <label className="block text-[10px] text-[var(--text-muted)]">Editable email preview<textarea value={handoverEmailMessage} onChange={e => setHandoverEmailMessage(e.target.value)} rows={4} className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" /></label>}
              {handoverSendSms && <label className="block text-[10px] text-[var(--text-muted)]">Editable SMS preview<textarea value={handoverSmsMessage} onChange={e => setHandoverSmsMessage(e.target.value)} rows={4} className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" /></label>}
              {(handoverSendEmail || handoverSendSms) && <p className="text-[10px] text-[var(--text-muted)]">Available placeholders: {'{{first_name}}'}, {'{{property_address}}'}, {'{{handover_date}}'}, {'{{handover_time}}'}, {'{{appointment_with}}'}.</p>}
              <Button variant="gradient" size="sm" onClick={scheduleHandover} disabled={saving || !handoverDate || !handoverTime || !handoverAssignedTo}>{enquiry.handover_date ? 'Update Handover' : 'Add to Team Calendar'}</Button>
              {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
            </div> : <p className="text-xs text-[var(--text-muted)]">Confirm the final balance first.</p>}
          </StepCard>

          {/* Step 9: Convert to Tenant */}
          <StepCard idx={8} step={steps[8]} {...stepCardProps}>
            {allPreviousComplete(8) ? <div className="space-y-3">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20"><p className="text-sm font-medium text-emerald-400">All onboarding stages complete</p><p className="text-xs text-[var(--text-muted)] mt-1">{name} is ready to be converted to a tenant.</p></div>
              <Button variant="gradient" onClick={convertToTenant} disabled={saving}>{saving ? 'Converting...' : 'Convert to Tenant'}</Button>
            </div> : <p className="text-xs text-[var(--text-muted)]">Complete all previous stages before converting.</p>}
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

      {documentPreview && (
        <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={closeDocumentPreview}>
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-input)] w-full max-w-4xl h-[86vh] overflow-hidden flex flex-col" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)]">
              <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">{documentPreview.name}</h4>
              <button onClick={closeDocumentPreview} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Close document preview"><X size={18} /></button>
            </div>
            <div className="flex-1 min-h-0 bg-white">
              {documentPreview.mimeType.startsWith('image/') ? (
                <img src={documentPreview.url} alt={documentPreview.name} className="w-full h-full object-contain" />
              ) : documentPreview.mimeType === 'application/pdf' ? (
                <iframe src={documentPreview.url} title={documentPreview.name} className="w-full h-full border-0" />
              ) : (
                <div className="h-full flex items-center justify-center p-8 text-center text-sm text-slate-600">
                  This file type cannot be previewed in the browser. Use Download to open it in its native app.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

import ClientAgreementDetails from '../ClientAgreementDetails';
import { useNotifications } from '../../context/NotificationContext';
import React, { useState, useEffect, useRef } from 'react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { Button, DatePicker, TimePicker } from './index';
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

function DeliveryChoices({email,sms,onEmail,onSms,previewEmail,previewSms}:{email:boolean;sms:boolean;onEmail:(value:boolean)=>void;onSms:(value:boolean)=>void;previewEmail:()=>void;previewSms:()=>void}) {
 const previewClass='w-full rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-200';
 return <div className="grid grid-cols-2 gap-3 w-full"><div className="space-y-2"><label className="flex items-center gap-2 rounded-lg bg-[var(--bg-subtle)] p-3 text-xs"><input type="checkbox" checked={email} onChange={e=>onEmail(e.target.checked)}/>Send Email</label>{email&&<button type="button" className={previewClass} onClick={previewEmail}>Preview Email</button>}</div><div className="space-y-2"><label className="flex items-center gap-2 rounded-lg bg-[var(--bg-subtle)] p-3 text-xs"><input type="checkbox" checked={sms} onChange={e=>onSms(e.target.checked)}/>Send SMS</label>{sms&&<button type="button" className={previewClass} onClick={previewSms}>Preview SMS</button>}</div></div>;
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
  users: { id: number; name: string; role: string }[];
  onClose: () => void;
  onUpdate: () => void | Promise<void>;
}

export default function OnboardingWizard({ enquiryId, enquiry, properties, users, onClose, onUpdate }: OnboardingWizardProps) {
  const api = useApi();
  const {confirmAction}=useNotifications();
  const { token } = useAuth();
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // Step 1: Holding Deposit Request
  const [hdMonthlyRent, setHdMonthlyRent] = useState('');
  const [hdSecurityDeposit, setHdSecurityDeposit] = useState('');
  const [hdHoldingDeposit, setHdHoldingDeposit] = useState('');
  const [hdFollowUpDate, setHdFollowUpDate] = useState('');
  const [hdRequestSendEmail, setHdRequestSendEmail] = useState(true);
  const [smsPreview,setSmsPreview]=useState<string|null>(null);
  const [holdingEmailPreview, setHoldingEmailPreview] = useState<{subject: string; html: string} | null>(null);
  const [hdRequestSendSms, setHdRequestSendSms] = useState(false);

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
  const [agreement, setAgreement] = useState<{ id: number; agreement_type: string; original_name: string; status: string; signing_slug?: string; applicant_signed_at?: string; requires_landlord_signature: number; requires_joint_tenant_signature: number; tenant_name?: string; joint_tenant_name?: string; landlord_name?: string; tenant_signed_at?: string; joint_tenant_signed_at?: string; landlord_signed_at?: string; tenant_opened_at?: string; joint_tenant_opened_at?: string; landlord_opened_at?: string; tenant_delivery_email?: number; tenant_delivery_sms?: number; tenant_delivery_sent_at?: string; agreement_details?: Record<string, any> } | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
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
  const [paymentReference,setPaymentReference]=useState('');
  const [clientDetailsReady,setClientDetailsReady]=useState(false);
  const [landlordSendEmail,setLandlordSendEmail]=useState(true),[landlordSendSms,setLandlordSendSms]=useState(false);
  const [agreementSendEmail, setAgreementSendEmail] = useState(true);
  const [agreementSendSms, setAgreementSendSms] = useState(false);
  const [agreementEmailMessage] = useState('Your tenancy agreement for {{property_address}} is ready to review and sign.');
  const [agreementSmsMessage] = useState('Hi there {{first_name}}, your tenancy agreement is ready to view and for your digital signature. You can access this by clicking here: {{signing_link}}. If you have any questions or are unable to access the link, then please contact us on 01902 212 415.');
  const [reissuingAgreement, setReissuingAgreement] = useState(false);
  const [agreementEmailPreview, setAgreementEmailPreview] = useState<{ subject: string; bodyHtml: string } | null>(null);
  const [balanceSendEmail, setBalanceSendEmail] = useState(false);
  const [balanceSendSms, setBalanceSendSms] = useState(false);
  const [balanceEmailMessage] = useState('Your tenancy agreement has been completed. The remaining balance for {{property_address}} is set out below.');
  const [balanceSmsMessage] = useState('Hi {{first_name}}, thank you for signing your tenancy agreement and completing our application and screening process. We have emailed your final payment details so we can arrange a handover date and location. Feel free to reach out to your lettings manager or to contact us on 01902 212 415 to book this in.');
  const [confirmingBalance,setConfirmingBalance]=useState(false);
  const [balanceReceiptDate,setBalanceReceiptDate]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'}));
  const [balanceFollowUpDate, setBalanceFollowUpDate] = useState(() => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  const [balanceEmailPreview, setBalanceEmailPreview] = useState<{ subject: string; bodyHtml: string } | null>(null);
  const [handoverEmailPreview, setHandoverEmailPreview] = useState<{ subject: string; bodyHtml: string } | null>(null);
  const [handoverDate, setHandoverDate] = useState('');
  const [handoverTime, setHandoverTime] = useState('10:00');
  const [handoverAssignedTo, setHandoverAssignedTo] = useState('');
  const [handoverWithLandlord, setHandoverWithLandlord] = useState(false);
  const [handoverSendEmail, setHandoverSendEmail] = useState(false);
  const [handoverSendSms, setHandoverSendSms] = useState(false);
  const [handoverEmailMessage] = useState('Finally, we’re nearly there! Your move in and handover appointment is confirmed. We will meet you at the property to conduct the inventory, hand over the keys and answer any final questions that you may have.');
  const [handoverSmsMessage] = useState('Hi {{first_name}}, your move in and handover appointment is confirmed for {{handover_date}} at {{handover_time}} at {{property_address}} with {{appointment_with}}. If you are running late or need to rearrange then please contact us on 01902 212 415.');
  const renderSmsPreview=(template:string)=>template.replace(/{{(\w+)}}/g,(_,key:string)=>({
    first_name:enquiry.first_name_1||'there', property_address:propertyAddress,
    signing_link:agreement?.signing_slug?`https://apply.fleminglettings.co.uk/${agreement.signing_slug}`:'[Signing link created when the agreement is issued]',
    handover_date:handoverDate.split('-').reverse().join('/'), handover_time:handoverTime,
    appointment_with:handoverWithLandlord?(agreement?.landlord_name||'the landlord'):handoverAssignedTo,
  }[key]||''));
  const [reviewNotes, setReviewNotes] = useState('');

  const [reviewSmsOverride] = useState('');
  const [sendReviewSms, setSendReviewSms] = useState(false);
  const [sendReviewEmail, setSendReviewEmail] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewStatusOverride, setReviewStatusOverride] = useState<string | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{ url: string; name: string; mimeType: string } | null>(null);

  // Application email modal
  const [sendingEmail, setSendingEmail] = useState(false);

  // Holding deposit email preview modal

  // Documents for ID verification step
  const [enquiryDocs, setEnquiryDocs] = useState<{ id: number; doc_type: string; original_name: string; mime_type: string; size: number; uploaded_at: string; review_status?: string; review_notes?: string; reviewed_at?: string }[]>([]);
  const [emailMessages, setEmailMessages] = useState<{ id: number; template: string; status: string; error_message?: string; created_at: string;body_html?:string;subject?:string }[]>([]);

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

  const agreementDirty=useRef(false);
  const fetchAgreement = async () => {
    try {
      const data = await api.get(`/api/tenant-enquiries/${enquiryId}/tenancy-agreement`);
      setAgreement(data || null);
      const details = data?.agreement_details || {};
      if (data&&!agreementDirty.current) {
        setAgreementStartDate(current => current || dateInputValue(details.tenancyStartDate));
        setAgreementRent(current => current || String(details.rent || ''));
        setAgreementDeposit(current => current || String(details.deposit ?? ''));
        setAgreementOccupiers(current => current || String(details.permittedOccupiers || ''));
        setAgreementFacilities(current => current || String(details.sharedFacilities || ''));
        setAgreementParking(current => current || String(details.parking || ''));

      }
      return data || null;
    } catch { setAgreement(null); return null; }
  };

  useEffect(()=>{if(!agreement||agreement.status==='completed')return;const timer=setInterval(()=>void fetchAgreement(),15000);return()=>clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[enquiryId,agreement?.id,agreement?.status]);

  const fetchAgreementCompliance = async () => {
    try {
      const data = await api.get(`/api/tenant-enquiries/${enquiryId}/tenancy-agreement-compliance`);
      setAgreementCompliance(data || null);
      if (data?.defaults&&!agreementDirty.current) {
        setAgreementStartDate(current => current || dateInputValue(data.defaults.tenancyStartDate));
        setAgreementRent(current => current || String(data.defaults.rent || ''));
        setAgreementDeposit(current => current || String(data.defaults.deposit || ''));
        setAgreementOccupiers(current => current || String(data.defaults.permittedOccupiers || ''));
        setAgreementFacilities(current => current || String(data.defaults.sharedFacilities || ''));
        setAgreementParking(current => current || String(data.defaults.parking || ''));
        setPaymentReference(current=>current||String(data.defaults.paymentReference||''));
      }
    } catch { setAgreementCompliance(null); }
  };

  // Fetch documents for this enquiry
  useEffect(() => { fetchDocs(); fetchEmailHistory(); fetchAgreement(); fetchAgreementCompliance(); }, [enquiryId, token, enquiry.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    if (documentPreview) URL.revokeObjectURL(documentPreview.url);
  }, [documentPreview]);

  const [documentReasons,setDocumentReasons]=useState<Record<number,string>>({});
  const [rejectSection,setRejectSection]=useState<string|null>(null);
  const [sectionReason,setSectionReason]=useState('');
  const sectionReviews=(enquiry.application_section_reviews||{}) as Record<string,{status:string;reason?:string;reviewed_at?:string}>;
  const saveSection=async(section:string,status:'approved'|'rejected')=>{setSaving(true);setReviewError('');try{await api.put(`/api/tenant-enquiries/${enquiryId}/section-review`,{section,status,reason:sectionReason});setReviewStatusOverride(null);setRejectSection(null);setSectionReason('');await onUpdate();}catch(e){setReviewError(e instanceof Error?e.message:'Review failed');}finally{setSaving(false);}};
  const [documentDecisions, setDocumentDecisions] = useState<Record<number, 'approved' | 'rejected'>>({});
  const rejectedReviews = [...Object.values(sectionReviews), ...enquiryDocs.map(doc => ({status: documentDecisions[doc.id] || doc.review_status, reviewed_at: doc.reviewed_at}))].filter(review => review.status === 'rejected');
  const hasUnsentRejection = rejectedReviews.some(review => !enquiry.application_changes_sent_at || !review.reviewed_at || Date.parse(enquiry.application_changes_sent_at) < Date.parse(review.reviewed_at));
  const reviewColour=(status:string|undefined,at?:string)=>status==='approved'?'bg-emerald-500/15 border-emerald-500/30':status==='rejected'?(enquiry.application_changes_sent_at&&at&&Date.parse(enquiry.application_changes_sent_at)>=Date.parse(at)?'bg-amber-500/15 border-amber-500/30':'bg-red-500/15 border-red-500/30'):'bg-[var(--bg-subtle)] border-[var(--border-subtle)]';
  const reviewDocument = async (docId: number, status: 'approved' | 'rejected',saveRejection=false) => {
    if (status === 'rejected'&&!saveRejection) {
      setDocumentDecisions(current => ({...current,[docId]:status}));
      setDocumentReasons(current=>({...current,[docId]:current[docId]??enquiryDocs.find(d=>d.id===docId)?.review_notes??''}));
      setReviewError('');
      return;
    }
    setSaving(true);
    setReviewError('');
    try {
      await api.put(`/api/documents/${docId}/review`, {
        status,
        notes: status==='rejected'?documentReasons[docId]?.trim():null,
      });
      setDocumentDecisions(current => { const next={...current}; delete next[docId]; return next; });
      setReviewStatusOverride(null);
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
        document_decisions: Object.entries(documentDecisions).map(([id,status]) => ({id:Number(id),status})),
        notes: reviewNotes || null,
        changes_required: status === 'changes_requested' ? combinedChanges : null,
        send_sms: status === 'changes_requested' && sendReviewSms,
        ...(reviewSmsOverride ? { sms_message: reviewSmsOverride } : {}),
        send_email: status === 'changes_requested' && sendReviewEmail,
      });
      const delivery = (result?.delivery || {}) as Record<string, { success: boolean; error?: string }>;
      const failedDeliveries = Object.values(delivery).filter(item => !item.success);
      if (failedDeliveries.length) {
        setReviewError(`Review saved, but communication failed: ${failedDeliveries.map(item => item.error).join('; ')}`);
      }
      setDocumentDecisions({});
      setReviewStatusOverride(status);
      await Promise.all([fetchEmailHistory(), fetchDocs(), onUpdate()]);
      setActiveStep(status === 'changes_requested' ? 3 : 4);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Application review could not be updated');
    } finally {
      setSaving(false);
    }
  };

  const lastHydrated = useRef('');
  const handoverSnapshot = JSON.stringify([enquiryId, enquiry.handover_date, enquiry.handover_time, enquiry.handover_assigned_to, enquiry.handover_with_landlord]);
  useEffect(() => {
    if (lastHydrated.current === handoverSnapshot) return;
    lastHydrated.current = handoverSnapshot;
    setHandoverDate(enquiry.handover_date ? String(enquiry.handover_date).slice(0, 10) : '');
    setHandoverTime(enquiry.handover_time ? String(enquiry.handover_time).slice(0, 5) : '10:00');
    setHandoverAssignedTo(enquiry.handover_assigned_to || '');
    setHandoverWithLandlord(Boolean(enquiry.handover_with_landlord));
  }, [handoverSnapshot, enquiry.handover_date, enquiry.handover_time, enquiry.handover_assigned_to, enquiry.handover_with_landlord]);

  // Hydrate once per opened record; focus, previews and uploads must preserve drafts.
  const initialisedEnquiry = useRef<number | null>(null);
  useEffect(() => {
    if (initialisedEnquiry.current === enquiryId) return;
    initialisedEnquiry.current = enquiryId;
    const prop = properties.find(p => p.id === Number(enquiry.linked_property_id));
    const rent = enquiry.monthly_rent_agreed || prop?.rent_amount || 0;
    setHdMonthlyRent(String(rent || ''));
    setHdSecurityDeposit(String(enquiry.security_deposit_amount || ''));
    setHdHoldingDeposit(String(enquiry.holding_deposit_amount || (rent ? Math.round(rent * 12 / 52) : '')));
    setHdReceivedAmount(enquiry.holding_deposit_received_amount ? String(enquiry.holding_deposit_received_amount) : '');
    setCreditScore(enquiry.credit_score || '');
    setReviewNotes('');
    setReviewStatusOverride(null);
    setCreditCheckCompleteOverride(false);
    setReplacingCreditReport(false);

  // Seed the editable values only when opening a different enquiry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiryId]);

  useEffect(() => {
    // Advance when a recorded milestone changes; saving a review must not reset inputs.
    if (!enquiry.holding_deposit_requested) setActiveStep(0);
    else if (!enquiry.holding_deposit_received) setActiveStep(1);
    else if (!enquiry.application_form_completed) setActiveStep(2);
    else if (enquiry.application_review_status !== 'approved') setActiveStep(3);
    else if (!enquiry.credit_check_completed) setActiveStep(4);
    else if (agreement?.status !== 'completed') setActiveStep(5);
    else if (!enquiry.balance_payment_received) setActiveStep(6);
    else if (!enquiry.handover_date && !enquiry.handover_not_required) setActiveStep(7);
    else setActiveStep(8);
  }, [enquiryId,enquiry.holding_deposit_requested,enquiry.holding_deposit_received,enquiry.application_form_completed,enquiry.application_review_status,enquiry.credit_check_completed,enquiry.balance_payment_received,enquiry.handover_date,enquiry.handover_not_required,agreement?.status]);

  const formatMoneyInput=(value:string)=>{const [whole,fraction]=value.split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction!==undefined?'.'+fraction:'');};
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
      desc: enquiry.holding_deposit_requested ? `Request recorded for ${enquiry.email_1}` : 'Send Email with deposit details & application form',
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
        : hasUnsentRejection ? 'red' : enquiry.application_form_completed ? 'amber' : 'red',
      desc: applicationReviewStatus === 'approved'
        ? 'Application and evidence approved'
        : applicationReviewStatus === 'changes_requested'
          ? enquiry.application_changes_sent_at && !hasUnsentRejection ? 'Changes sent — waiting for tenant' : 'Changes saved — not yet sent'
          : 'Review the submitted form and evidence',
    },
    {
      label: 'Run Credit Check',
      icon: CreditCard,
      getStatus: () => enquiry.credit_check_completed || creditCheckCompleteOverride ? 'green' : 'red',
      desc: enquiry.credit_check_completed || creditCheckCompleteOverride ? `Credit check completed${creditScore ? ` — ${creditScore}` : ''}` : 'Run after the application is approved',
    },
    {
      label: agreementCompliance?.agreementType === 'client' ? 'Client Tenancy Agreement' : 'Tenancy Agreement for Fleming Lettings Properties',
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
      getStatus: () => enquiry.handover_date || enquiry.handover_not_required ? 'green' : 'red',
      desc: enquiry.handover_not_required ? 'No handover required — confirmed by office' : enquiry.handover_date ? `${String(enquiry.handover_date).slice(0, 10)} at ${String(enquiry.handover_time || '').slice(0, 5)}` : 'Assign the property handover to the team calendar',
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
    if (!await confirmAction('Please confirm that you wish to progress with the tenant(s) application and request their holding deposit.')) return;
    setSaving(true);
    setReviewError('');
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/request-holding-deposit`, {
        monthly_rent: Number(hdMonthlyRent),
        security_deposit: Number(hdSecurityDeposit),
        holding_deposit: Number(hdHoldingDeposit),
        follow_up_date: hdFollowUpDate || null,
        send_sms: hdRequestSendSms,
        send_email: hdRequestSendEmail,
      });
      const failed = Object.values((result?.delivery || {}) as Record<string, { success: boolean; error?: string }>).filter(item => !item.success);
      if (failed.length) setReviewError(`Request saved, but communication failed: ${failed.map(item => item.error).join('; ')}`);
      await Promise.all([fetchEmailHistory(), onUpdate()]);
      setActiveStep(1);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Holding deposit email could not be sent');
    }
    setSaving(false);
  };

  const confirmDepositReceived = async () => {
    if (!await confirmAction("Please confirm the deposit has been received in full and ensure that all automations have been selected where required.")) return;
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
      setActiveStep(2);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Holding deposit could not be confirmed');
    }
    setSaving(false);
  };

  const convertToTenant = async () => {
    setSaving(true);
    setReviewError('');
    try {
      await api.post(`/api/tenant-enquiries/${enquiryId}/convert`, {
        property_id: enquiry.linked_property_id,
        tenancy_start_date: agreement?.agreement_details?.tenancyStartDate || agreementStartDate || dateInputValue(enquiry.handover_date),
        tenancy_type: 'Assured Periodic Tenancy',
      });
      await onUpdate();
      onClose();
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Conversion failed. Please review both applicants and try again.'); }
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
    if (!await confirmAction(agreement ? 'Issue a new agreement? Existing unsigned links for both applicants will stop working and both must sign the replacement.' : 'Please confirm that you wish for the tenancy agreement to be issued and all automations to be sent out.')) return;
    const previousAgreementId = agreement?.id;
    setSaving(true); setReviewError('');
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/tenancy-agreement`, {
        tenancy_start_date: agreementStartDate,
        rent: agreementRent,
        deposit: agreementDeposit,
        permitted_occupiers: agreementOccupiers,
        shared_facilities: agreementFacilities,
        parking: agreementParking,
        payment_reference:paymentReference,
        landlord_send_email:landlordSendEmail,landlord_send_sms:landlordSendSms,
        send_email: agreementSendEmail,
        send_sms: agreementSendSms,
        email_message: agreementEmailMessage,
        sms_message: agreementSmsMessage,
      });
      const failures = Object.values(result.delivery || {}).filter((item: any) => item && item.success === false); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (failures.length) setReviewError(`Agreement issued, but ${failures.length} communication${failures.length === 1 ? '' : 's'} failed. Check the email/SMS history.`);
      setReissuingAgreement(false);
      await Promise.all([fetchAgreement(), fetchAgreementCompliance(), fetchEmailHistory(), onUpdate()]);
    } catch (err) {
      const refreshed = await fetchAgreement();
      if (refreshed && refreshed.id !== previousAgreementId) {
        setReviewError('The agreement was created, but the response or delivery was interrupted. Its current status has been refreshed; use Retry Delivery if the signing link was not sent.');
        await Promise.all([fetchAgreementCompliance(), fetchEmailHistory(), onUpdate()]);
      } else {
        setReviewError(err instanceof Error ? err.message : 'Agreement could not be issued');
      }
    }
    finally { setSaving(false); }
  };

  const previewAgreementEmail = async () => {
    setReviewError('');
    try {
      const preview = await api.post(`/api/tenant-enquiries/${enquiryId}/tenancy-agreement/email-preview`, {
        tenancy_start_date: agreementStartDate, rent: agreementRent, deposit: agreementDeposit, email_message: agreementEmailMessage,
      });
      setAgreementEmailPreview({ subject: preview.subject, bodyHtml: preview.body_html });
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Agreement email preview could not be prepared');
    }
  };

  const previewBalanceEmail = async () => {
    setReviewError('');
    try {
      const preview = await api.post(`/api/tenant-enquiries/${enquiryId}/${confirmingBalance?'confirm-balance':'request-balance'}/email-preview`, { email_message: balanceEmailMessage,received_date:balanceReceiptDate });
      setBalanceEmailPreview({ subject: preview.subject, bodyHtml: preview.body_html });
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Balance email preview could not be prepared');
    }
  };

  const retryAgreementDelivery = async () => {
    setSaving(true); setReviewError('');
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/tenancy-agreement/retry-delivery`, {});
      const failures = Object.values(result?.delivery || {}).filter((item: any) => item?.success === false); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (failures.length) setReviewError(`Delivery still failed: ${failures.map((item: any) => item.error).filter(Boolean).join('; ')}`); // eslint-disable-line @typescript-eslint/no-explicit-any
      await Promise.all([fetchAgreement(), fetchEmailHistory(), onUpdate()]);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Agreement delivery could not be retried');
    } finally { setSaving(false); }
  };

  const requestBalance = async () => {
    setSaving(true); setReviewError('');
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/request-balance`, {
        send_email: balanceSendEmail, send_sms: balanceSendSms,
        email_message: balanceEmailMessage, sms_message: balanceSmsMessage,
        follow_up_date: balanceFollowUpDate,
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
      const result=await api.post(`/api/tenant-enquiries/${enquiryId}/confirm-balance`, {received_date:balanceReceiptDate,send_email:balanceSendEmail,send_sms:balanceSendSms});
      if(Object.values(result.delivery||{}).some(v=>(v as {success?:boolean}).success===false))setReviewError('Receipt saved, but a notification failed. Check communications history.');
      setConfirmingBalance(false);
      await onUpdate();
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Balance receipt could not be saved'); }
    finally { setSaving(false); }
  };

  const previewHandoverEmail = async () => {
    setReviewError('');
    try {
      const preview = await api.post(`/api/tenant-enquiries/${enquiryId}/schedule-handover/email-preview`, {
        handover_date: handoverDate, handover_time: handoverTime, assigned_to: handoverAssignedTo,
        with_landlord: handoverWithLandlord, email_message: handoverEmailMessage,
      });
      setHandoverEmailPreview({ subject: preview.subject, bodyHtml: preview.body_html });
    } catch (error) { setReviewError(error instanceof Error ? error.message : 'Email preview could not be prepared'); }
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

  // Values below come from the public enquiry form — escape before interpolating into email HTML
  const previewHoldingEmail = async (receipt = false) => {
    if(!receipt&&enquiry.holding_deposit_requested){
      const sent=emailMessages.find(m=>m.template==='holding_deposit_request');
      if(sent?.body_html){setHoldingEmailPreview({subject:sent.subject||'Holding Deposit Request',html:sent.body_html});return;}
    }
    setReviewError('');
    try {
      const preview = await api.post(`/api/tenant-enquiries/${enquiryId}/holding-deposit/email-preview`, {
        receipt, monthly_rent: Number(hdMonthlyRent), security_deposit: Number(hdSecurityDeposit),
        holding_deposit: Number(hdHoldingDeposit), amount: Number(hdReceivedAmount) || enquiry.holding_deposit_amount,
        received_date: hdReceivedDate || new Date().toISOString().slice(0, 10),
      });
      setHoldingEmailPreview(preview);
    } catch (error) { setReviewError(error instanceof Error ? error.message : 'Could not load the email preview'); }
  };

  const sendApplicationEmail = async (_preview: { subject: string; bodyHtml: string }) => {
    void _preview;
    setSendingEmail(true);
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/send-application-email`, {send_email:true});
      const failed=Object.values(result.delivery as Record<string,{success:boolean;error?:string}>).filter(r=>!r.success);
      if(failed.length)setReviewError(failed.map(r=>r.error).join('; '));
      fetchEmailHistory();
      onUpdate();
    } catch (err) {
      console.error('Failed to send application email:', err);
      alert(err instanceof Error ? err.message : 'Application email could not be sent');
    }
    setSendingEmail(false);
  };

  const stepCardProps = { activeStep, setActiveStep };
  const answerSection=(key:string)=> /^(bank|sort_code|account_)/.test(key)?'Bank Details':/^(nok|next_of_kin)/.test(key)?'Next of Kin':/^(guarantor)/.test(key)?'Guarantor':/^(employ|income|job|student)/.test(key)?'Employment & Income':/^(landlord|agent|current_|previous_)/.test(key)?'Address & Landlord':/^(rent|deposit|preferred|tenancy|forwarding|parking|pet|smok)/.test(key)?'Tenancy Details':/^(declar|sign|consent)/.test(key)?'Declaration':'Personal Details';
  const applicationData = (enquiry.app_form_data || {}) as Record<string, unknown>;
  const requiredReviewDocumentTypes = ['Primary Identification', 'Secondary Identification', 'Bank Statements'];
  if (!['Student', 'Unemployed'].includes(String(applicationData.employment_status || ''))) {
    requiredReviewDocumentTypes.push('Proof of Income or Employment');
  }
  const allRequiredDocsApproved = requiredReviewDocumentTypes.every(docType =>
    enquiryDocs.some(doc => doc.doc_type === docType && (documentDecisions[doc.id] || doc.review_status) === 'approved')
  );
  const latestApplicationEmail = emailMessages.find(message =>
    message.template === 'tenancy_application' || message.template === 'holding_deposit_request'
  );
  const latestHoldingEmail = emailMessages.find(message => message.template === 'holding_deposit_request');
  const answerLabel = (key: string) => key==='ni_number'?'National Insurance Number':key.replace(/^declaration_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const answerValue = (value: unknown) => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value || '—');
  const applicationUrl = `https://apply.fleminglettings.co.uk/${enquiry.application_form_slug || enquiry.application_form_token || ''}`;
  const reviewSmsPreview = `Hi there ${enquiry.first_name_1 || 'there'}, thank you for completing your application forms with Fleming Lettings. We have reviewed your application and still require further information or documentation from you. Please click on this link to jump back in: ${applicationUrl}. If you need any help, then please contact our office on 01902 212 415.`;
  const visibleSections=[...new Set(Object.entries(applicationData).filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()!==''&&!Array.isArray(v)&&typeof v!=='object').map(([key])=>answerSection(key)))];
  const allSectionsApproved=sectionReviews['Application Details'] ? sectionReviews['Application Details'].status==='approved' : enquiry.application_review_status==='approved'||(visibleSections.length>0&&visibleSections.every(section=>sectionReviews[section]?.status==='approved'));
  const answerDecision=sectionReviews['Application Details'] || (allSectionsApproved?{status:'approved'}:Object.values(sectionReviews).find(r=>r.status==='rejected'));
  const rejectionReasons=JSON.stringify([...Object.entries(sectionReviews).filter(([,r])=>r.status==='rejected').map(([section,r])=>`${section}: ${r.reason}`),...enquiryDocs.filter(d=>d.review_status==='rejected').map(d=>`${d.doc_type} — ${d.original_name}: ${d.review_notes}`)]);
  const combinedChanges=(JSON.parse(rejectionReasons) as string[]).join('\n\n');
  const previewReviewEmail=async()=>{try{const preview=await api.post(`/api/tenant-enquiries/${enquiryId}/application-review/email-preview`,{changes_required:combinedChanges});setHoldingEmailPreview(preview);}catch(e){setReviewError(String(e));}};
  const landlordBankComplete = agreementCompliance?.agreementType !== 'client' || clientDetailsReady;
  const agreementServiceComplete = agreementCompliance?.agreementType !== 'client' || ['let_only', 'rent_collection', 'full_management'].includes(String(agreementCompliance?.serviceType || ''));
  const agreementDetailsComplete = Boolean(agreementStartDate && agreementRent && agreementDeposit !== ''
    && agreementOccupiers.trim() && agreementFacilities.trim() && agreementParking.trim()
    && landlordBankComplete && agreementServiceComplete);
  const outstandingAgreementSigners = agreement ? [
    !agreement.tenant_signed_at ? agreement.tenant_name || enquiry.first_name_1 : null,
    agreement.requires_joint_tenant_signature && !agreement.joint_tenant_signed_at ? agreement.joint_tenant_name || 'joint tenant' : null,
    agreement.requires_landlord_signature && !agreement.landlord_signed_at ? agreement.landlord_name || 'landlord' : null,
  ].filter(Boolean) as string[] : [];
  const lastAgreementOpenedAt = agreement
    ? [agreement.tenant_opened_at, agreement.joint_tenant_opened_at, agreement.landlord_opened_at]
      .filter(Boolean).sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0]
    : null;
  const showAgreementForm = !agreement || reissuingAgreement;

  return (
    <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={event => { if(event.target===event.currentTarget)onClose(); }}>
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-input)] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
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
                  <CheckCircle size={14} /> Request recorded for {enquiry.email_1} · {enquiry.onboarding_email_sent_at ? new Date(enquiry.onboarding_email_sent_at as string | number).toLocaleDateString('en-GB') : 'Delivery shown below'}
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
                    onClick={() => previewHoldingEmail()}
                    className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--accent-orange)] hover:underline mt-1"
                  >
                    <Eye size={12} /> View Email
                  </button>
                  <Button variant="ghost" onClick={requestHoldingDeposit} disabled={saving || !enquiry.email_1 || !!enquiry.holding_deposit_received} className="flex items-center gap-2">
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
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdMonthlyRent.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} onChange={e => {
                      const v = e.target.value.replace(/[^0-9.]/g, '');
                      setHdMonthlyRent(v);
                      const r = Number(v);
                      if (r > 0) { setHdHoldingDeposit(String(Math.round(r * 12 / 52))); }
                    }} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1 font-medium">Security Dep. (£)</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdSecurityDeposit.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} onChange={e => setHdSecurityDeposit(e.target.value.replace(/[^0-9.]/g, ''))} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1 font-medium">Holding Dep. (£)</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdHoldingDeposit.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} onChange={e => setHdHoldingDeposit(e.target.value.replace(/[^0-9.]/g, ''))} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                  </div>
                </div>
                <DatePicker label="Follow-up Date" value={hdFollowUpDate} onChange={setHdFollowUpDate} />
                <div className="bg-[var(--bg-subtle)] rounded-lg p-3 text-[10px] text-[var(--text-muted)] space-y-1">
                  <p className="font-medium text-[var(--text-secondary)]">Will send to: {enquiry.email_1}</p>
                  <p>From: contact@tenancies.fleminglettings.co.uk</p>
                  <p>Includes: Holding Deposit Summary + Application Form Link</p>
                </div>
                <DeliveryChoices email={hdRequestSendEmail} sms={hdRequestSendSms} onEmail={setHdRequestSendEmail} onSms={setHdRequestSendSms} previewEmail={()=>void previewHoldingEmail()} previewSms={()=>setSmsPreview(`Hi ${enquiry.first_name_1}, we have just emailed you the details to pay and place your holding deposit on ${propertyAddress}. Please ensure that you contact your lettings manager once the funds have been transferred so we can confirm receipt and continue with your application screening.`)}/>
                {Boolean(enquiry.joint_partner_id) && <p className="text-xs text-[var(--text-muted)]">Both applicants receive their own application link.</p>}
                <Button variant="gradient" onClick={requestHoldingDeposit} disabled={saving || !hdMonthlyRent || !hdHoldingDeposit}>
                  {saving ? 'Sending...' : 'Send Automations & Progress'}
                </Button>
                {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
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
                        <p className="text-xs text-[var(--text-primary)] font-medium">Confirmation for {enquiry.email_1}</p>
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
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdReceivedAmount.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} onChange={e => setHdReceivedAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={String(enquiry.holding_deposit_amount || '')}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                    </div>
                    <DatePicker label="Date Deposit Received" value={hdReceivedDate} onChange={setHdReceivedDate} />
                  </div>
                  <DeliveryChoices email={hdReceiptSendEmail} sms={hdReceiptSendSms} onEmail={setHdReceiptSendEmail} onSms={setHdReceiptSendSms} previewEmail={()=>void previewHoldingEmail(true)} previewSms={()=>setSmsPreview(`Hi ${enquiry.first_name_1}, we are pleased to confirm receipt of your holding deposit payment of £${Number(hdReceivedAmount || enquiry.holding_deposit_amount).toLocaleString('en-GB',{minimumFractionDigits:2})}. These funds are now held on account and you can now proceed with your tenancy application of which has been issued to you on email.`)}/>

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

                  <div className="grid grid-cols-2 gap-3 text-xs"><p>Last Viewed<br/>{enquiry.application_form_last_viewed_at?new Date(enquiry.application_form_last_viewed_at).toLocaleString('en-GB'):'Not Viewed Yet'}</p><p>Last Updated<br/>{enquiry.application_form_last_saved_at?new Date(enquiry.application_form_last_saved_at).toLocaleString('en-GB'):enquiry.application_form_completed?'Application Submitted':'No Draft Saved'}</p></div>
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
                  ) : (sent || !!enquiry.application_form_token) ? (
                    <div className="space-y-3">
                      {enquiry.application_form_token && (
                        <div className="bg-[var(--bg-subtle)] rounded-lg p-3">
                          <div className="flex justify-between gap-3"><p className="text-[10px] text-[var(--text-muted)] mb-1">Application Form Link:</p><button className="rounded-full border px-3 py-1 text-xs" onClick={async()=>{try{await navigator.clipboard.writeText(`https://apply.fleminglettings.co.uk/${enquiry.application_form_slug || enquiry.application_form_token}`);}catch{setReviewError('Copy failed. Select the application link to copy it.');}}}>Copy</button></div>
                          <p className="text-xs text-[var(--accent-orange)] break-all">
                            https://apply.fleminglettings.co.uk/{enquiry.application_form_slug || enquiry.application_form_token}
                          </p>
                        </div>
                      )}
                      <Button variant="ghost" onClick={async() => { if (await confirmAction('Send each applicant their own application link?')) void sendApplicationEmail({subject:'',bodyHtml:''}); }} disabled={sendingEmail} className="flex items-center gap-2">
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
                  <div className="bg-[var(--bg-subtle)] rounded-lg p-3 max-h-[32rem] overflow-y-auto">
                    <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider mb-2">Submitted answers</p>
                    <div className={`mb-4 rounded-xl border p-3 ${reviewColour(answerDecision?.status,answerDecision?.reviewed_at)}`}>
                    {visibleSections.map(section=><section key={section} className="mb-4"><h4 className="text-xs font-semibold mb-2">{section}</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{Object.entries(applicationData).filter(([key,value])=>answerSection(key)===section&&value!==null&&value!==undefined&&String(value).trim()!==''&&!Array.isArray(value)&&typeof value!=='object').map(([key,value])=><div key={key}><p className="text-[10px] text-[var(--text-muted)]">{answerLabel(key)}</p><p className="text-xs break-words">{answerValue(value)}</p></div>)}</div></section>)}
                    <p className="text-xs mb-2">Application Answers · {answerDecision?.status||'Needs Review'}</p>
                    <div className="flex gap-2"><Button size="sm" variant="outline" disabled={saving} onClick={()=>saveSection('Application Details','approved')}>Approve Answers</Button><Button size="sm" variant="outline" disabled={saving} onClick={()=>{setRejectSection('Application Details');setSectionReason(answerDecision?.reason||'');}}>Reject Answers</Button></div>
                    {rejectSection&&<div className="mt-3 space-y-2"><label className="text-xs font-semibold block">Rejection Reason<textarea aria-label="Application rejection reason" placeholder="Application details — reason for rejection / what needs to change" className="block w-full mt-2 border rounded-lg bg-[var(--bg-input)] p-3" rows={3} value={sectionReason} onChange={e=>setSectionReason(e.target.value)}/></label><Button size="sm" disabled={saving||!sectionReason.trim()} onClick={()=>saveSection('Application Details','rejected')}>Save Rejection</Button><Button size="sm" variant="ghost" onClick={()=>setRejectSection(null)}>Cancel</Button></div>}
                    {!rejectSection&&answerDecision?.reason&&<p className="text-xs mt-3 whitespace-pre-wrap">{answerDecision.reason}</p>}
                    </div>

                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Supporting documents</p>
                    {[...new Set([...requiredReviewDocumentTypes, ...enquiryDocs.filter(doc=>!['Completed Tenancy Application','Tenancy Agreement','Signed Tenancy Agreement'].includes(doc.doc_type)).map(doc=>doc.doc_type)])].map(docType => {
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
                            <div key={doc.id} className={`flex flex-wrap items-center gap-2 border rounded-lg p-3 ${reviewColour(documentDecisions[doc.id]||doc.review_status,documentDecisions[doc.id]?undefined:doc.reviewed_at)}`}>
                              <FileText size={12} className="text-[var(--text-muted)] shrink-0" />
                              <select aria-label={`Category for ${doc.original_name}`} value={doc.doc_type} disabled={saving} className="max-w-28 text-xs bg-[var(--bg-input)] rounded" onChange={async event=>{setSaving(true);try{await api.put(`/api/documents/${doc.id}/category`,{doc_type:event.target.value});setReviewStatusOverride(null);await Promise.all([fetchDocs(),onUpdate()]);}catch(error){setReviewError(error instanceof Error?error.message:'Category could not be saved');}finally{setSaving(false);}}}>
                                {['Primary Identification','Secondary Identification','Bank Statements','Proof of Income or Employment','Credit Check Report','Other'].map(type=><option key={type}>{type}</option>)}
                              </select>
                              <div className="flex items-start gap-3 text-left min-w-0 basis-full order-first"><div className="flex-1 min-w-0">
                                <p className="text-xs text-[var(--text-primary)] break-words">{doc.original_name}</p>
                                <p className="text-[10px] text-[var(--text-muted)]">{new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</p></div>
                              </div>
                              <span className={`text-[10px] font-medium ${(documentDecisions[doc.id]||doc.review_status) === 'approved' ? 'text-emerald-600' : (documentDecisions[doc.id]||doc.review_status) === 'rejected' ? 'text-red-600' : 'text-amber-600'}`}>
                                {({approved:'Approved',rejected:'Rejected',pending:'Pending'} as Record<string,string>)[documentDecisions[doc.id]||doc.review_status||'pending']||'Pending'}
                              </span>

                              <button onClick={() => downloadDocument(doc.id, doc.original_name)} className="px-2 py-1 rounded text-[10px] bg-[var(--bg-hover)] text-[var(--text-secondary)] flex items-center gap-1"><Download size={10} />Download</button>
                              <button onClick={() => reviewDocument(doc.id, 'approved')} disabled={saving} className="px-2 py-1 rounded text-[10px] bg-emerald-500/15 text-emerald-400">Approve</button>
                              <button onClick={() => reviewDocument(doc.id, 'rejected')} disabled={saving} className="px-2 py-1 rounded text-[10px] bg-red-500/15 text-red-400 disabled:opacity-40">{doc.review_status==='rejected'?'Edit Rejection Reason':'Reject'}</button><button onClick={() => viewDocument(doc.id, doc.original_name)} className="ml-auto shrink-0 px-2 py-1 rounded text-xs bg-sky-500/15 text-sky-600">View</button>{documentDecisions[doc.id]==='rejected'?<div className="basis-full space-y-2"><label className="block text-xs">Rejection Reason<textarea placeholder="Document name — reason for rejection / what is required" className="block w-full rounded-lg border p-2 bg-[var(--bg-input)]" rows={3} value={documentReasons[doc.id]??doc.review_notes??''} onChange={e=>setDocumentReasons(r=>({...r,[doc.id]:e.target.value}))}/></label><Button size="sm" disabled={saving||!documentReasons[doc.id]?.trim()} onClick={()=>reviewDocument(doc.id,'rejected',true)}>Save Rejection</Button></div>:doc.review_notes&&<p className="basis-full text-xs whitespace-pre-wrap">{doc.review_notes}</p>}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>

                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">Add Internal Notes</label>
                    <textarea value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} rows={3}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none" />
                  </div>
                  {rejectedReviews.length>0&&<DeliveryChoices email={sendReviewEmail} sms={sendReviewSms} onEmail={setSendReviewEmail} onSms={setSendReviewSms} previewEmail={()=>void previewReviewEmail()} previewSms={()=>setSmsPreview(reviewSmsOverride || reviewSmsPreview)}/>}
                  {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => updateApplicationReview('changes_requested')} disabled={saving || !combinedChanges.trim() || Object.values(documentDecisions).includes('rejected')}>
                      {sendReviewEmail||sendReviewSms?'Send Change Request':'Save Changes Required'}
                    </Button>
                    <Button variant="gradient" size="sm" onClick={() => updateApplicationReview('approved')} disabled={saving || !allRequiredDocsApproved || !allSectionsApproved || enquiryDocs.some(d=>d.review_status==='rejected') || Object.values(documentDecisions).includes('rejected')}>
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
                {agreement && <div className={`p-3 rounded-lg border ${agreement.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/20 text-[var(--text-primary)]' : 'bg-amber-500/10 border-amber-500/20 text-[var(--text-primary)]'}`}>
                  <p className="text-sm font-medium">{agreement.original_name}</p>
                  <p className="text-xs">{name}: {agreement.applicant_signed_at ? 'Signed' : 'Awaiting signature'}</p>
                  {agreement.signing_slug && <button className="text-xs underline mt-1" onClick={async()=>{try {await navigator.clipboard.writeText(`https://apply.fleminglettings.co.uk/${agreement.signing_slug}`);}catch{setReviewError('Could not copy link');}}}>Copy this applicant’s agreement link</button>}
                  <p className="text-xs mt-1">{agreement.status === 'completed' ? 'All required signatures completed; signed PDF stored in the property and tenant documents.' : `Waiting on ${outstandingAgreementSigners.join(' and ') || 'signature processing'}`}</p>
                  <p className="mt-1 text-[10px] opacity-80">Last opened: {lastAgreementOpenedAt ? new Date(lastAgreementOpenedAt as string).toLocaleString('en-GB') : 'Not opened yet'}</p>
                </div>}
                {agreement && agreement.status !== 'completed' && <div className="flex flex-wrap gap-2">
                  <DeliveryChoices email={agreementSendEmail} sms={agreementSendSms} onEmail={setAgreementSendEmail} onSms={setAgreementSendSms} previewEmail={()=>void previewAgreementEmail()} previewSms={()=>setSmsPreview(renderSmsPreview(agreementSmsMessage))}/>
                  <Button variant="ghost" size="sm" onClick={fetchAgreement}>Refresh Signatures</Button>
                  <Button variant="outline" size="sm" disabled={saving} onClick={async () => {
                    if (!await confirmAction('Resend the existing agreement to both applicants using the selected channels? Their links and signatures will be preserved.')) return;
                    setSaving(true); setReviewError('');
                    try { const result=await api.post(`/api/tenant-enquiries/${enquiryId}/tenancy-agreement/resend`,{agreement_id:agreement.id,send_email:agreementSendEmail,send_sms:agreementSendSms});
                      const failed=Object.values(result.delivery as Record<string,{success:boolean;error?:string}>).filter(r=>!r.success); if(failed.length)setReviewError(failed.map(r=>r.error).join('; ')); await fetchEmailHistory();
                    } catch(error) {setReviewError(error instanceof Error?error.message:'Could not resend');} finally {setSaving(false);}
                  }}>Resend Existing Agreement</Button>


                  <Button className="text-red-500 border-red-500/40" variant="outline" size="sm" onClick={() => setReissuingAgreement(value => !value)}>{reissuingAgreement ? 'Cancel Reissue' : 'Reissue New Agreement'}</Button>
                  {!agreement.tenant_delivery_sent_at && !agreement.requires_landlord_signature && (agreement.tenant_delivery_email || agreement.tenant_delivery_sms) && (
                    <Button variant="outline" size="sm" onClick={retryAgreementDelivery} disabled={saving}>Retry Agreement Delivery</Button>
                  )}
                </div>}
                {showAgreementForm && <>
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
                        {agreementCompliance.ready && <p className="pt-1 text-[10px] text-emerald-400">These documents will be merged after the APT agreement and attached to the signing email.</p>}
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
                    <DatePicker label="Tenancy Start *" value={agreementStartDate} onChange={v=>{agreementDirty.current=true;setAgreementStartDate(v);}} />
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1">Monthly Rent *</label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">£</span><input aria-label="Monthly Rent" type="text" inputMode="decimal" value={formatMoneyInput(agreementRent)} onChange={event => {agreementDirty.current=true;setAgreementRent(event.target.value.replace(/[^0-9.]/g,''));}} className="h-11 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg pl-7 pr-3 text-sm" /></div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1">Security Deposit *</label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">£</span><input aria-label="Security Deposit" type="text" inputMode="decimal" value={formatMoneyInput(agreementDeposit)} onChange={event => {agreementDirty.current=true;setAgreementDeposit(event.target.value.replace(/[^0-9.]/g,''));}} className="h-11 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg pl-7 pr-3 text-sm" /></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-[10px] text-[var(--text-muted)]">Are there any other occupants? *<textarea rows={2} value={agreementOccupiers} onChange={event => {agreementDirty.current=true;setAgreementOccupiers(event.target.value);}} placeholder="Enter any other parties who are not the named tenants/or None." className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-3 text-xs" /></label>
                    <label className="text-[10px] text-[var(--text-muted)]">Are there shared facilities? *<textarea rows={2} value={agreementFacilities} onChange={event => {agreementDirty.current=true;setAgreementFacilities(event.target.value);}} placeholder="Describe them, or None" className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-3 text-xs" /></label>
                    <label className="text-[10px] text-[var(--text-muted)] sm:col-span-2">Is there permitted parking, and if so where? *<textarea rows={2} value={agreementParking} onChange={event => {agreementDirty.current=true;setAgreementParking(event.target.value);}} placeholder="Describe it, or None" className="mt-1 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-3 text-xs" /></label>
                  </div>
                  <label className="text-xs">Payment Reference<input aria-label="Payment Reference" value={paymentReference} onChange={e=>{agreementDirty.current=true;setPaymentReference(e.target.value);}} className="block w-full mt-1 rounded-lg p-3 bg-[var(--bg-input)] border border-[var(--border-input)]"/></label>
                  {agreementCompliance?.agreementType === 'client' && <ClientAgreementDetails enquiryId={enquiryId} onReady={setClientDetailsReady}/>}
                  {agreementCompliance?.agreementType==='client'&&<div className="space-y-2"><p className="text-xs font-semibold">Landlord Signing Invitation</p><DeliveryChoices email={landlordSendEmail} sms={landlordSendSms} onEmail={setLandlordSendEmail} onSms={setLandlordSendSms} previewEmail={async()=>{try{const p=await api.post(`/api/tenant-enquiries/${enquiryId}/landlord-agreement-preview`,{tenant_delivery:agreementSendEmail||agreementSendSms});setHoldingEmailPreview(p);}catch(e){setReviewError(String(e));}}} previewSms={async()=>{try{const p=await api.post(`/api/tenant-enquiries/${enquiryId}/landlord-agreement-preview`,{});setSmsPreview(p.sms);}catch(e){setReviewError(String(e));}}}/><p className="text-xs font-semibold pt-2">Tenant Invitation — Sent After the Landlord Signs</p></div>}
                  <DeliveryChoices email={agreementSendEmail} sms={agreementSendSms} onEmail={setAgreementSendEmail} onSms={setAgreementSendSms} previewEmail={()=>void previewAgreementEmail()} previewSms={()=>setSmsPreview(renderSmsPreview(agreementSmsMessage))}/>
                  <Button className="self-start" variant="gradient" size="sm" onClick={issueAgreement} disabled={saving || agreementCompliance?.ready !== true || !agreementDetailsComplete}>{saving ? 'Generating...' : reissuingAgreement ? 'Reissue New Agreement' : 'Generate & Issue Agreement'}</Button>
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
                <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><span className="block text-[10px] text-[var(--text-muted)]">Security Deposit</span><strong>£{Number(enquiry.security_deposit_amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
                <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><span className="block text-[10px] text-[var(--text-muted)]">First month’s rent</span><strong>£{Number(enquiry.monthly_rent_agreed || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
                <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><span className="block text-[10px] text-[var(--text-muted)]">Holding deposit received</span><strong>−£{Number(enquiry.holding_deposit_received_amount || enquiry.holding_deposit_amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
                <div className="rounded-lg bg-[#563F6E] p-3 text-white"><span className="block text-[10px] text-white/70">Remaining balance</span><strong>£{Number(enquiry.balance_due_amount || (Number(enquiry.security_deposit_amount || 0) + Number(enquiry.monthly_rent_agreed || 0) - Number(enquiry.holding_deposit_received_amount || enquiry.holding_deposit_amount || 0))).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
              </div>
              {confirmingBalance&&!enquiry.balance_payment_received&&<DatePicker label="Receipt Date *" value={balanceReceiptDate} onChange={setBalanceReceiptDate}/>}
              {!confirmingBalance&&!enquiry.balance_payment_received && <DatePicker label="Follow-up Date *" value={balanceFollowUpDate} onChange={setBalanceFollowUpDate} />}
              {!enquiry.balance_payment_received && <DeliveryChoices email={balanceSendEmail} sms={balanceSendSms} onEmail={setBalanceSendEmail} onSms={setBalanceSendSms} previewEmail={()=>void previewBalanceEmail()} previewSms={()=>setSmsPreview(confirmingBalance?`Hi ${name}, we confirm receipt of your final tenancy balance of £${Number(enquiry.balance_due_amount||0).toFixed(2)} on ${balanceReceiptDate}. Thank you. Fleming Lettings.`:renderSmsPreview(balanceSmsMessage))}/>}
              {!enquiry.balance_payment_requested ? <Button variant="gradient" size="sm" onClick={requestBalance} disabled={saving || !balanceFollowUpDate}>Request Final Balance</Button>
                : !enquiry.balance_payment_received ? <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={()=>{setConfirmingBalance(false);void requestBalance();}} disabled={saving || !balanceFollowUpDate}>Resend Request</Button><Button variant="gradient" size="sm" onClick={()=>confirmingBalance?void confirmBalance():setConfirmingBalance(true)} disabled={saving||!balanceReceiptDate}>{confirmingBalance?'Save Receipt & Send Selected Notifications':'Confirm Receipt of Funds'}</Button></div>
                : <p className="text-xs text-emerald-400 flex items-center gap-2"><CheckCircle size={14} /> Final balance received{enquiry.balance_payment_received_at ? ` on ${new Date(enquiry.balance_payment_received_at).toLocaleDateString('en-GB')}` : ''}</p>}
              {Boolean(enquiry.balance_payment_requested) && !enquiry.balance_payment_received && enquiry.balance_follow_up_date && <p className="text-xs text-amber-300">Follow-up scheduled for {new Date(`${enquiry.balance_follow_up_date}T00:00:00`).toLocaleDateString('en-GB')}.</p>}
              {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
            </div> : <p className="text-xs text-[var(--text-muted)]">Complete the signed agreement first.</p>}
          </StepCard>

          {/* Step 8: Handover */}
          <StepCard idx={7} step={steps[7]} {...stepCardProps}>
            {allPreviousComplete(7) ? <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <DatePicker label="Handover Date *" value={handoverDate} onChange={setHandoverDate} />
                <TimePicker label="Handover Time *" value={handoverTime} onChange={setHandoverTime} />
              </div>
              <select value={handoverWithLandlord ? '__landlord__' : handoverAssignedTo} onChange={e => { const landlord = e.target.value === '__landlord__'; setHandoverWithLandlord(landlord); setHandoverAssignedTo(landlord ? (agreementCompliance?.landlordName || 'With Landlord') : e.target.value); }} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-xs">
                <option value="">Assign team member…</option>
                <option value="__landlord__">With Landlord</option>
                {users.map(user => <option key={user.id} value={user.name}>{user.name}</option>)}
              </select>
              <DeliveryChoices email={handoverSendEmail} sms={handoverSendSms} onEmail={setHandoverSendEmail} onSms={setHandoverSendSms} previewEmail={()=>void previewHandoverEmail()} previewSms={()=>setSmsPreview(renderSmsPreview(handoverSmsMessage))}/>

              <div className="flex flex-col sm:flex-row gap-3">              <div className="flex-1 [&_button]:w-full [&_button]:h-full">
                {enquiry.handover_not_required ? <p className="text-sm text-emerald-500">No handover required — confirmed by office.</p> : <Button size="sm" variant="outline" disabled={saving} onClick={async()=>{
                  if(!await confirmAction('Confirm no handover is required? Any existing handover calendar task will be completed.'))return;
                  setSaving(true);try{await api.post(`/api/tenant-enquiries/${enquiryId}/no-handover`,{confirmed:true});await onUpdate();setActiveStep(8);}catch(error){setReviewError(error instanceof Error?error.message:'Could not save');}finally{setSaving(false);}
                }}>No Handover Required</Button>}
              </div>
<Button className="flex-1" variant="gradient" size="sm" onClick={scheduleHandover} disabled={saving || !handoverDate || !handoverTime || !handoverAssignedTo}>{enquiry.handover_date ? 'Update Handover' : 'Book Appointment & Add to Calendar'}</Button></div>
              {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
            </div> : <p className="text-xs text-[var(--text-muted)]">Confirm the final balance first.</p>}
          </StepCard>

          {/* Step 9: Convert to Tenant */}
          <StepCard idx={8} step={steps[8]} {...stepCardProps}>
            {allPreviousComplete(8) ? <div className="space-y-3">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20"><p className="text-sm font-medium text-emerald-400">All onboarding stages complete</p><p className="text-xs text-[var(--text-muted)] mt-1">{name} is ready to be converted to a tenant.</p></div>
              <Button variant="gradient" onClick={convertToTenant} disabled={saving}>{saving ? 'Converting...' : 'Convert to Tenant'}</Button>
              {reviewError && <p role="alert" className="text-xs text-red-400">{reviewError}</p>}
            </div> : <p className="text-xs text-[var(--text-muted)]">Complete all previous stages before converting.</p>}
          </StepCard>

        </div>
      </div>

      <EmailPreviewModal
        open={agreementEmailPreview !== null}
        onClose={() => setAgreementEmailPreview(null)}
        onSend={async () => undefined}
        to={enquiry.email_1 || ''}
        from="contact@tenancies.fleminglettings.co.uk"
        initialSubject={agreementEmailPreview?.subject || ''}
        initialBodyHtml={agreementEmailPreview?.bodyHtml || ''}
        previewOnly
      />

      <EmailPreviewModal
        open={handoverEmailPreview !== null}
        onClose={() => setHandoverEmailPreview(null)}
        onSend={async () => undefined}
        to={enquiry.email_1 || ''}
        from="contact@tenancies.fleminglettings.co.uk"
        initialSubject={handoverEmailPreview?.subject || ''}
        initialBodyHtml={handoverEmailPreview?.bodyHtml || ''}
        previewOnly
      />
      <EmailPreviewModal
        open={balanceEmailPreview !== null}
        onClose={() => setBalanceEmailPreview(null)}
        onSend={async () => undefined}
        to={enquiry.email_1 || ''}
        from="contact@tenancies.fleminglettings.co.uk"
        initialSubject={balanceEmailPreview?.subject || ''}
        initialBodyHtml={balanceEmailPreview?.bodyHtml || ''}
        previewOnly
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

      {smsPreview!==null&&<div role="dialog" aria-modal="true" aria-label="Preview SMS" className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4" onClick={()=>setSmsPreview(null)}><div className="w-full max-w-lg rounded-2xl bg-[var(--bg-card)] p-6" onClick={e=>e.stopPropagation()}><h3 className="font-bold mb-4">Preview SMS</h3><p className="text-sm whitespace-pre-wrap">{smsPreview}</p><Button className="mt-4" onClick={()=>setSmsPreview(null)}>Close</Button></div></div>}

      <EmailPreviewModal open={holdingEmailPreview !== null} onClose={() => setHoldingEmailPreview(null)}
        onSend={async () => undefined} to={enquiry.email_1 || ''} from="contact@tenancies.fleminglettings.co.uk"
        initialSubject={holdingEmailPreview?.subject || ''} initialBodyHtml={holdingEmailPreview?.html || ''} previewOnly />

    </div>
  );
}

import GuarantorCreditPanel from '../GuarantorCreditPanel';
import {deliveryFailureReason} from '../../utils/deliveryFailure';
import CreditCheckPanel from '../CreditCheckPanel';
import GuarantorReview from '../GuarantorReview';
import {creditChecksComplete} from '../../utils/creditChecks';
import DeliveryChoices from './DeliveryChoices';
import ApplicationReviewPanel from '../ApplicationReviewPanel';
import FinalBalanceTransactions from '../FinalBalanceTransactions';
import HoldingDepositTransactions from '../HoldingDepositTransactions';
import AgreementSigningProgress from '../AgreementSigningProgress';
import AgreementComplianceDocuments,{type ComplianceDocument} from '../AgreementComplianceDocuments';
import {Link} from 'react-router-dom';
import {applicationReviewSections,missingDocumentRequest,onboardingReviewNotes} from '../../utils/applicationReview';
import ClientAgreementDetails from '../ClientAgreementDetails';
import AgreementPaymentAccountSummary from '../AgreementPaymentAccountSummary';
import AgreementDataPreview from '../AgreementDataPreview';
import {createPortal} from 'react-dom';
import { useNotifications } from '../../context/NotificationContext';
import React, { useState, useEffect, useRef } from 'react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { Button, DatePicker, TimePicker, Select, Input } from './index';
import EmailPreviewModal from './EmailPreviewModal';
import {
  CheckCircle, Clock, Mail, FileText, Shield, CreditCard,
  AlertTriangle, User, ArrowRight, X, Send,
  Eye, Copy, RefreshCw, Download, PoundSterling, FileSignature, CalendarDays
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
  red: { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-[var(--onboarding-danger)]', dot: 'bg-red-500' },
  amber: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-[var(--onboarding-warning)]', dot: 'bg-amber-500' },
  grey: {bg:'bg-slate-500/10',border:'border-slate-400/30',text:'text-[var(--text-muted)]',dot:'bg-slate-400'},
  green: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-[var(--onboarding-success)]', dot: 'bg-emerald-500' },
};

function StagePrerequisite({children}:{children:React.ReactNode}){return <p role="status" className="flex items-start gap-2 text-sm leading-5 text-[var(--text-muted)]"><AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--onboarding-warning)]"/><span>{children}</span></p>;}

function StepCard({ idx, step, children, activeStep, actions, bottom, split = false }: {
  idx: number;
  step: { label: string; icon: React.ElementType; getStatus: () => string; desc: string; readyForApproval?: boolean };
  children: React.ReactNode;
  activeStep: number;
  actions?: React.ReactNode;
  bottom?: React.ReactNode;
  split?: boolean;
}) {
  if (activeStep !== idx) return null;
  const recordedStatus = step.getStatus();
  const status = recordedStatus==='red'?'amber':recordedStatus;
  const s = STATUS[status as keyof typeof STATUS] || STATUS.red;
  const approved = status === 'green' && !step.readyForApproval;
  const showActions = Boolean(actions) || (approved && !split && ![3,8,9].includes(idx));
  return (
    <section aria-labelledby={`onboarding-heading-${idx}`} className={`onboarding-stage ${split ? 'onboarding-deposit-stage' : ''} min-w-0 min-h-0 h-full flex flex-col ${status === 'green' ? 'rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5' : status === 'amber' ? 'rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5' : ''}`}>
      <div className="shrink-0 flex items-start gap-3 border-b border-[var(--border-subtle)] pb-4 mb-4">
        <step.icon size={24} className={`shrink-0 mt-0.5 ${status === 'green' ? s.text : 'text-[var(--text-secondary)]'}`} />
        <div className="flex-1 min-w-0">
          <h4 id={`onboarding-heading-${idx}`} className="text-lg font-semibold">{step.label}</h4>
          <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">{step.desc}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-medium ${s.bg} ${s.text}`}>
          {step.readyForApproval ? 'Ready to Approve' : status === 'green' ? (idx===8?'Completed':'Approved') : ['amber','grey'].includes(status) ? 'Pending' : 'To Do'}
        </span>
      </div>
      <div className={bottom?'flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] content-start gap-4 overflow-y-auto':showActions ? 'flex-1 min-h-0 grid grid-cols-1 grid-rows-[max-content_max-content] xl:grid-rows-1 content-start xl:grid-cols-[minmax(0,1fr)_260px] gap-4 overflow-y-auto xl:overflow-hidden' : 'flex-1 min-h-0 overflow-hidden'}>
        <div className={bottom?'space-y-4 min-w-0':`space-y-4 min-w-0 min-h-0 ${showActions ? 'xl:h-full' : 'h-full'} pr-3 [scrollbar-gutter:stable] ${split && idx !== 4 ? 'overflow-y-auto lg:overflow-hidden' : showActions ? 'xl:overflow-y-auto' : 'overflow-y-auto'}`}>{children}</div>
        {showActions && <aside aria-label="Section actions" className="onboarding-actions [&>button]:w-full [&>button]:min-h-10 rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-3 space-y-3 xl:overflow-y-auto xl:max-h-full self-start"><h5 className="text-base font-semibold">Actions & Previews</h5>{approved && <p className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-[var(--onboarding-success)]"><CheckCircle size={18}/>Approved</p>}{actions}</aside>}
        {bottom&&<div className="xl:col-span-2 min-w-0">{bottom}</div>}
      </div>
    </section>
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

function ReviewPopup({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} aria-label={title} onCancel={event=>{event.preventDefault();onClose();}} className="m-auto w-[calc(100%-2rem)] max-w-3xl max-h-[85dvh] p-0 rounded-2xl border border-[var(--border-input)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xl backdrop:bg-black/60" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[var(--border-subtle)]"><h3 className="font-semibold text-lg">{title}</h3><button autoFocus onClick={onClose} aria-label={`Close ${title}`} className="p-2 rounded-full"><X size={20}/></button></div>
    <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(85dvh-5rem)]">{children}</div>
  </dialog>;
}

export default function OnboardingWizard({ enquiryId, enquiry, properties, users, onClose, onUpdate }: OnboardingWizardProps) {
  const existingTenancy=Boolean(enquiry.existing_tenancy_application);
  const api = useApi();
  const {confirmAction,notify}=useNotifications();
  const { token,user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [requiredProperty, setRequiredProperty] = useState('');
  const [applicationProperty,setApplicationProperty]=useState(String(enquiry.linked_property_id||''));
  const applicationPropertyLocked=Boolean(enquiry.application_form_sent||enquiry.application_form_completed||enquiry.application_form_token);
  const propertySelectionChanged=applicationProperty!==String(enquiry.linked_property_id||'');
  const [activeStep, setActiveStep] = useState(0);
  const [onboardingActivity,setOnboardingActivity]=useState<{last_viewed_at?:string;last_progressed_at?:string;last_progressed_by?:string}>({});
  const viewedEnquiry=useRef<number|null>(null);
  useEffect(()=>{
    if(viewedEnquiry.current===enquiryId)return;
    viewedEnquiry.current=enquiryId;
    void api.post(`/api/tenant-enquiries/${enquiryId}/onboarding-view`,{}).then(setOnboardingActivity).catch(()=>{});
  },[enquiryId]);
  useEffect(()=>{
    if(!saving)void api.get(`/api/tenant-enquiries/${enquiryId}/onboarding-activity`).then(setOnboardingActivity).catch(()=>{});
  },[enquiryId,saving]);

  // Step 1: Holding Deposit Request
  const [hdMonthlyRent, setHdMonthlyRent] = useState('');
  const [hdSecurityDeposit, setHdSecurityDeposit] = useState('');
  const [hdHoldingDeposit, setHdHoldingDeposit] = useState('');
  const [hdFollowUpDate, setHdFollowUpDate] = useState('');
  const [hdRequestSendEmail, setHdRequestSendEmail] = useState(true);
  const [smsPreview,setSmsPreview]=useState<string|null>(null);
  const [holdingEmailPreview, setHoldingEmailPreview] = useState<{subject: string; html: string; to?:string} | null>(null);
  const [hdRequestSendSms, setHdRequestSendSms] = useState(false);

  // Step 2: Holding Deposit Received
  const [hdReceivedDate, setHdReceivedDate] = useState('');
  const [hdReceivedAmount, setHdReceivedAmount] = useState('');
  const [hdReceiptSendEmail, setHdReceiptSendEmail] = useState(true);
  const [hdReceiptSendSms, setHdReceiptSendSms] = useState(false);

  // Step 5: Credit check
  const [agreement, setAgreement] = useState<{ id: number; landlord_signers?:{id:number;name:string;slug:string;signed_at?:string}[]; agreement_type: string; original_name: string; status: string; signing_slug?: string; tenant_slug?:string; joint_tenant_slug?:string; landlord_slug?:string; applicant_signed_at?: string; requires_landlord_signature: number; requires_joint_tenant_signature: number; tenant_name?: string; joint_tenant_name?: string; landlord_name?: string; tenant_signed_at?: string; joint_tenant_signed_at?: string; landlord_signed_at?: string; tenant_opened_at?: string; joint_tenant_opened_at?: string; landlord_opened_at?: string; tenant_delivery_email?: number; tenant_delivery_sms?: number; tenant_delivery_sent_at?: string; agreement_details?: Record<string, any> } | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [agreementCompliance, setAgreementCompliance] = useState<{
    ready: boolean;
    propertyLinked: boolean;
    items: ComplianceDocument[];
    attachments?: Array<{id:number;doc_type:string;original_name:string}>;
    agreementType?: 'internal' | 'client';
    serviceType?: string | null;
    paymentRoute?: 'fleming_operating' | 'fleming_client_money' | 'landlord';
    initialPaymentAccount?: {accountName:string;bankName:string;sortCode:string;accountNumber:string};
    companyAccounts?: {business:{accountName:string;bankName:string;sortCode:string;accountNumber:string};clientMoney:{accountName:string;bankName:string;sortCode:string;accountNumber:string};cmpNumber:string};
    landlordName?: string | null;
    fees?: {setupPercent?:string|number|null;monthlyPercent?:string|number|null};
    jointApplicantsReady?: boolean;
    jointApplicant?: { name: string; applicationComplete: boolean; applicationApproved: boolean; creditCheckComplete: boolean } | null;
    defaults?: { tenancyStartDate?: string; rent?: string | number; deposit?: string | number; permittedOccupiers?: string; sharedFacilities?: string; parking?: string };
  } | null>(null);
  const [complianceLoading,setComplianceLoading]=useState(false);
  const complianceRequest=useRef(0);
  const [agreementDraftKey]=useState(()=>['fleming-agreement-draft',user?.id||'local',enquiryId,enquiry.linked_property_id,new URLSearchParams(location.search).get('scenario')||'',new URLSearchParams(location.search).get('run')||''].join(':'));
  const [initialAgreementDraft]=useState<Record<string,string>|null>(()=>{try{const draft=JSON.parse(localStorage.getItem(agreementDraftKey)||'null');return draft&&typeof draft==='object'&&!Array.isArray(draft)?draft:null;}catch{return null;}});
  const [agreementStartDate, setAgreementStartDate] = useState(initialAgreementDraft?.tenancyStartDate??'');
  const [agreementRent, setAgreementRent] = useState(initialAgreementDraft?.rent??'');
  const [agreementDeposit, setAgreementDeposit] = useState(initialAgreementDraft?.deposit??'');
  const [agreementOccupiers, setAgreementOccupiers] = useState(initialAgreementDraft?.permittedOccupiers??'');
  const [agreementFacilities, setAgreementFacilities] = useState(initialAgreementDraft?.sharedFacilities??'');
  const [agreementParking, setAgreementParking] = useState(initialAgreementDraft?.parking??'');
  const [paymentReference,setPaymentReference]=useState(()=>{if(initialAgreementDraft?.paymentReference)return initialAgreementDraft.paymentReference;const property=properties.find(p=>Number(p.id)===Number(enquiry.linked_property_id));return (String(property?.address||enquiry.property_address||'').match(/^\s*\d+[A-Za-z]?/)?.[0]?.trim()||'PROPERTY')+' '+String(property?.postcode||enquiry.property_postcode||'').replace(/\s/g,'').toUpperCase()+' - '+String(enquiry.last_name_1||'TENANT').toUpperCase();});
  const [showAgreementData,setShowAgreementData]=useState(false);
  const [previewingAgreement,setPreviewingAgreement]=useState(false);
  const [showCompanyAccounts,setShowCompanyAccounts]=useState(false);
  const [clientDetailsReady,setClientDetailsReady]=useState(false);
  const [serviceGate,setServiceGate]=useState<{propertyId:number}|null>(null);
  useEffect(()=>{let active=true;api.get(`/api/tenant-enquiries/${enquiryId}/client-agreement-details`).then(data=>{if(active)setServiceGate(data.enabled&&!(data.serviceAgreementReady??data.serviceAgreementSigned)&&enquiry.status!=='converted'?{propertyId:data.propertyId}:null);}).catch(()=>{});return()=>{active=false;};},[api,enquiryId,enquiry.status]);
  const [landlordSendEmail,setLandlordSendEmail]=useState(true),[landlordSendSms,setLandlordSendSms]=useState(false);
  const [agreementSendEmail, setAgreementSendEmail] = useState(true);
  const [agreementSendSms, setAgreementSendSms] = useState(false);
  const [agreementEmailMessage] = useState('Your tenancy agreement for {{property_address}} is ready to review and sign.');
  const [agreementSmsMessage] = useState('Hi there {{first_name}}, your tenancy agreement is ready to view and for your digital signature. You can access this by clicking here: {{signing_link}}. If you have any questions or are unable to access the link, then please contact us on 01902 212 415.');
  const [editingAgreement, setEditingAgreement] = useState(false);
  const [agreementEmailPreview, setAgreementEmailPreview] = useState<{ subject: string; bodyHtml: string } | null>(null);
  const [balanceDeliveryResult,setBalanceDeliveryResult]=useState<{title:string;message:string}|null>(null);
  const [balanceSendEmail, setBalanceSendEmail] = useState(false);
  const [balanceSendSms, setBalanceSendSms] = useState(false);
  const [balanceEmailMessage] = useState('Your tenancy agreement has been completed. The remaining balance for {{property_address}} is set out below.');
  const [balanceSmsMessage] = useState('Hi {{first_name}}, thank you for signing your tenancy agreement and completing our application and screening process. We have emailed your final payment details so we can arrange a handover date and location. Feel free to reach out to your lettings manager or to contact us on 01902 212 415 to book this in.');
  const [confirmingBalance,setConfirmingBalance]=useState(false);
  const [balanceReceiptDate,setBalanceReceiptDate]=useState('');
  const [balanceReceiptAmount,setBalanceReceiptAmount]=useState('');
  const receiptAmount=balanceReceiptAmount||String(enquiry.balance_bank_amount||'');
  const receiptDate=balanceReceiptDate||String(enquiry.balance_bank_date||'').slice(0,10);
  const bankReceipt=!balanceReceiptAmount&&Number(enquiry.balance_bank_amount)>0;
  const [balanceNotes,setBalanceNotes]=useState(enquiry.balance_internal_notes||'');
  const [balanceFollowUpDate, setBalanceFollowUpDate] = useState(() => dateInputValue(enquiry.balance_follow_up_date)||new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  const [balanceEmailPreview, setBalanceEmailPreview] = useState<{ subject: string; bodyHtml: string } | null>(null);
  const [handoverEmailPreview, setHandoverEmailPreview] = useState<{ subject: string; bodyHtml: string } | null>(null);
  const propertyAddress = (() => {
    const prop = properties.find(p => p.id === enquiry.linked_property_id);
    return prop ? formatPropertyAddress(prop.address, prop.postcode) : '';
  })();
  const [handoverDate, setHandoverDate] = useState(()=>dateInputValue(enquiry.handover_date));
  const [handoverTime, setHandoverTime] = useState(()=>String(enquiry.handover_time||'10:00').slice(0,5));
  const [handoverAssignedTo, setHandoverAssignedTo] = useState(enquiry.handover_assigned_to||'');
  const [handoverWithLandlord, setHandoverWithLandlord] = useState(Boolean(enquiry.handover_with_landlord));
  const [handoverLocationType,setHandoverLocationType]=useState('property');
  const [handoverOtherAddress,setHandoverOtherAddress]=useState('');
  const [handoverOffices,setHandoverOffices]=useState<{id:number;name:string;office_address?:string}[]>([]);
  useEffect(()=>{api.get('/api/departments').then(setHandoverOffices).catch(()=>{});},[api]);
  const handoverLocationAddress=handoverLocationType==='property'?propertyAddress:handoverLocationType==='office'?'Creative Industries Centre, Wolverhampton Science Park, Wolverhampton, WV10 9TG':handoverLocationType==='other'?handoverOtherAddress.trim():handoverOffices.find(office=>'office:'+office.id===handoverLocationType)?.office_address||'';
  useEffect(()=>{if(agreementCompliance?.agreementType==='internal'&&handoverWithLandlord){setHandoverWithLandlord(false);setHandoverAssignedTo('');}},[agreementCompliance?.agreementType,handoverWithLandlord]);
  const [handoverSendEmail, setHandoverSendEmail] = useState(false);
  const [handoverSendSms, setHandoverSendSms] = useState(false);
  const [handoverLandlordEmail,setHandoverLandlordEmail]=useState(false);
  const [handoverLandlordSms,setHandoverLandlordSms]=useState(false);
  const [conversionComplete,setConversionComplete]=useState(false);
  const onboardingComplete=conversionComplete||enquiry.status==='converted';
  const [handoverEmailMessage] = useState('Finally, we’re nearly there! Your move in and handover appointment is confirmed. We will meet you at {{handover_location}} to hand over the keys and answer any final questions that you may have.');
  const [handoverSmsMessage] = useState('Hi {{first_name}}, your move in and handover appointment is confirmed for {{handover_date}} at {{handover_time}} at {{handover_location}} with {{appointment_with}}. If you are running late or need to rearrange then please contact us on 01902 212 415.');
  const renderSmsPreview=(template:string)=>template.replace(/{{(\w+)}}/g,(_,key:string)=>({
    first_name:enquiry.first_name_1||'there', property_address:propertyAddress,
    signing_link:agreement?.signing_slug?`https://apply.fleminglettings.co.uk/${agreement.signing_slug}`:'[Signing link created when the agreement is issued]',
    handover_date:handoverDate.split('-').reverse().join('/'), handover_time:handoverTime,
    handover_location:handoverLocationAddress, appointment_with:handoverWithLandlord?(agreementCompliance?.landlordName||'the landlord'):handoverAssignedTo,
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
  const [applicationSendEmail,setApplicationSendEmail]=useState(true),[applicationSendSms,setApplicationSendSms]=useState(false);

  // Holding deposit email preview modal

  // Documents for ID verification step
  const [enquiryDocs, setEnquiryDocs] = useState<{ id: number; doc_type: string; original_name: string; mime_type: string; size: number; uploaded_at: string; review_status?: string; review_notes?: string; reviewed_at?: string }[]>([]);
  const [emailMessages, setEmailMessages] = useState<{ id: number; template: string; status: string; error_message?: string; created_at: string;opened_at?:string;clicked_at?:string;body_html?:string;subject?:string }[]>([]);

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

  const agreementDirty=useRef(!!initialAgreementDraft);
  useEffect(()=>{if(!agreementDirty.current)return;try{localStorage.setItem(agreementDraftKey,JSON.stringify({tenancyStartDate:agreementStartDate,rent:agreementRent,deposit:agreementDeposit,permittedOccupiers:agreementOccupiers,sharedFacilities:agreementFacilities,parking:agreementParking,paymentReference}));}catch{setReviewError('Your changes could not be saved in this browser. Keep this screen open until the agreement is issued.');}},[agreementDraftKey,agreementStartDate,agreementRent,agreementDeposit,agreementOccupiers,agreementFacilities,agreementParking,paymentReference]);
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
        setPaymentReference(current=>current||String(details.paymentReference||''));

      }
      return data || null;
    } catch { setAgreement(null); return null; }
  };

  useEffect(()=>{if(!agreement||agreement.status==='completed')return;const timer=setInterval(()=>void fetchAgreement(),15000);return()=>clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[enquiryId,agreement?.id,agreement?.status]);

  const fetchAgreementCompliance = async () => {
    const requestId=++complianceRequest.current;
    setComplianceLoading(true);
    try {
      const data = await api.get(`/api/tenant-enquiries/${enquiryId}/tenancy-agreement-compliance`);
      if(requestId!==complianceRequest.current)return false;
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
      return true;
    } catch { if(requestId===complianceRequest.current)setReviewError('Property compliance could not be refreshed. Please reopen this stage.');return false; }
    finally {if(requestId===complianceRequest.current)setComplianceLoading(false);}
  };

  // Fetch documents for this enquiry
  useEffect(() => { fetchDocs(); fetchEmailHistory(); fetchAgreement(); fetchAgreementCompliance(); }, [enquiryId, token, enquiry.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    if (documentPreview) URL.revokeObjectURL(documentPreview.url);
  }, [documentPreview]);

  const [documentReasons,setDocumentReasons]=useState<Record<number,string>>({});
  const [jointApplication,setJointApplication]=useState<{id:number;record:Record<string,any>;email:typeof latestApplicationEmail;documents:typeof enquiryDocs}|null>(null);
  const [viewApplication,setViewApplication]=useState(false);
  const [rejectDocument,setRejectDocument]=useState<number|null>(null);
  const [rejectSection,setRejectSection]=useState<string|null>(null);
  const [sectionReason,setSectionReason]=useState('');
  const sectionReviews=(enquiry.application_section_reviews||{}) as Record<string,{status:string;reason?:string;reviewed_at?:string}>;
  const saveSection=async(section:string,status:'pending'|'approved'|'rejected')=>{setSaving(true);setReviewError('');try{await api.put(`/api/tenant-enquiries/${enquiryId}/section-review`,{section,status,reason:sectionReason});setReviewStatusOverride(null);setRejectSection(null);setSectionReason('');await onUpdate();}catch(e){setReviewError(e instanceof Error?e.message:'Review failed');}finally{setSaving(false);}};
  const [documentDecisions, setDocumentDecisions] = useState<Record<number, 'approved' | 'rejected'>>({});
  const rejectedReviews = [...Object.values(sectionReviews), ...enquiryDocs.map(doc => ({status: documentDecisions[doc.id] || doc.review_status, reviewed_at: doc.reviewed_at}))].filter(review => review.status === 'rejected');
  const hasUnsentRejection = rejectedReviews.some(review => !enquiry.application_changes_sent_at || !review.reviewed_at || Date.parse(enquiry.application_changes_sent_at) < Date.parse(review.reviewed_at));
  const reviewColour=(status:string|undefined,at?:string)=>status==='approved'?'bg-emerald-500/15 border-emerald-500/30':status==='rejected'?(enquiry.application_changes_sent_at&&at&&Date.parse(enquiry.application_changes_sent_at)>=Date.parse(at)?'bg-amber-500/15 border-amber-500/30':'bg-red-500/15 border-red-500/30'):'bg-[var(--bg-subtle)] border-[var(--border-subtle)]';
  const reviewDocument = async (docId: number, status: 'pending' | 'approved' | 'rejected',saveRejection=false) => {
    if (status === 'rejected'&&!saveRejection) {
      setRejectDocument(docId);
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
      setRejectDocument(null);
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

  const openAgreementCopy=async(download=false)=>{
    try{
      const response=await fetch(`${API_URL}/api/tenant-enquiries/${enquiryId}/tenancy-agreement/pdf${download?'?download=1':''}`,{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)throw Error((await response.json()).error||'Agreement could not be opened');
      const blob=await response.blob(),url=URL.createObjectURL(blob),name=agreement?.original_name||'Tenancy Agreement.pdf';
      if(download){const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
      else setDocumentPreview({url,name,mimeType:blob.type});
    }catch(e){setReviewError(e instanceof Error?e.message:'Agreement could not be opened');}
  };
  const previewProposedAgreement=async()=>{
    if(!token)return;
    setPreviewingAgreement(true);setReviewError('');
    try{
      const response=await fetch(`${API_URL}/api/tenant-enquiries/${enquiryId}/tenancy-agreement/preview-pdf`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({tenancy_start_date:agreementStartDate,rent:agreementRent,deposit:agreementDeposit,permitted_occupiers:agreementOccupiers,shared_facilities:agreementFacilities,parking:agreementParking,payment_reference:paymentReference})});
      if(!response.ok){const data=await response.json().catch(()=>null);throw Error(data?.error||'The proposed agreement could not be previewed');}
      const blob=await response.blob();setDocumentPreview({url:URL.createObjectURL(blob),name:'Proposed Assured Periodic Tenancy.pdf',mimeType:blob.type});
    }catch(error){setReviewError(error instanceof Error?error.message:'The proposed agreement could not be previewed');}
    finally{setPreviewingAgreement(false);}
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
      setReviewNotes('');
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
  const handoverSnapshot = JSON.stringify([enquiryId, enquiry.handover_date, enquiry.handover_time, enquiry.handover_assigned_to, enquiry.handover_with_landlord, enquiry.handover_location_type, enquiry.handover_location_address]);
  useEffect(() => {
    if (lastHydrated.current === handoverSnapshot) return;
    lastHydrated.current = handoverSnapshot;
    setHandoverDate(enquiry.handover_date ? String(enquiry.handover_date).slice(0, 10) : '');
    setHandoverTime(enquiry.handover_time ? String(enquiry.handover_time).slice(0, 5) : '10:00');
    setHandoverAssignedTo(enquiry.handover_assigned_to || '');
    setHandoverWithLandlord(Boolean(enquiry.handover_with_landlord));
    setHandoverLocationType(enquiry.handover_location_type||'property');setHandoverOtherAddress(enquiry.handover_location_address||'');
  }, [handoverSnapshot, enquiry.handover_date, enquiry.handover_time, enquiry.handover_assigned_to, enquiry.handover_with_landlord, enquiry.handover_location_type, enquiry.handover_location_address]);

  // Hydrate once per opened record; focus, previews and uploads must preserve drafts.
  const initialisedEnquiry = useRef<number | null>(null);
  useEffect(() => {
    if (initialisedEnquiry.current === enquiryId) return;
    initialisedEnquiry.current = enquiryId;
    const prop = properties.find(p => p.id === Number(enquiry.linked_property_id));
    const rent = enquiry.monthly_rent_agreed || prop?.rent_amount || 0;
    setHdMonthlyRent(String(rent || ''));
    setHdSecurityDeposit(String(enquiry.security_deposit_amount ?? ''));
    setHdHoldingDeposit(String(enquiry.holding_deposit_amount || (rent ? Math.round(rent * 12 / 52) : '')));
    setHdReceivedAmount(enquiry.holding_deposit_received_amount ? String(enquiry.holding_deposit_received_amount) : '');
    setReviewNotes('');
    setReviewStatusOverride(null);

  // Seed the editable values only when opening a different enquiry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiryId]);

  const [guarantorChecks,setGuarantorChecks]=useState<Record<number,Record<string,any>>>({});
  const [guarantorError,setGuarantorError]=useState('');
  const guarantorRecord=useRef(enquiryId);guarantorRecord.current=enquiryId;
  const refreshGuarantors=async()=>{
    const ids=[enquiryId,...enquiry.joint_partner_id?[Number(enquiry.joint_partner_id)]:[]];
    const values=await Promise.all(ids.map(async id=>[id,await api.get(`/api/tenant-enquiries/${id}/guarantor`)] as const));
    if(guarantorRecord.current!==enquiryId)return;
    setGuarantorChecks(Object.fromEntries(values));setGuarantorError('');
  };
  useEffect(()=>{
    let cancelled=false;
    const refresh=()=>{if(!cancelled)void refreshGuarantors().catch(error=>{if(!cancelled)setGuarantorError(error instanceof Error?error.message:'Guarantor progress could not be loaded');});};
    setGuarantorChecks({});refresh();window.addEventListener('focus',refresh);
    return()=>{cancelled=true;window.removeEventListener('focus',refresh);};
  },[enquiryId,enquiry.joint_partner_id]);
  // Existing issued agreements keep their recorded journey. New agreements
  // require an explicit decision and completed checks for each applicant.
  const guarantorApplicantIds=[enquiryId,...enquiry.joint_partner_id?[Number(enquiry.joint_partner_id)]:[]];
  const guarantorDecisionsComplete=guarantorApplicantIds.every(id=>typeof guarantorChecks[id]?.required==='boolean');
  const hasRequiredGuarantor=guarantorApplicantIds.some(id=>guarantorChecks[id]?.required===true);
  const [guarantorDecisionSaving,setGuarantorDecisionSaving]=useState(false);
  const chooseGuarantor=async(id:number,value:boolean)=>{
    setGuarantorDecisionSaving(true);setGuarantorError('');
    try{await api.post('/api/tenant-enquiries/'+id+'/guarantor',{action:'require',value});await refreshGuarantors();}
    catch(error){setGuarantorError(error instanceof Error?error.message:'The guarantor decision could not be saved.');}
    finally{setGuarantorDecisionSaving(false);}
  };
  const resetGuarantor=async(id:number)=>{setGuarantorDecisionSaving(true);setGuarantorError('');try{await api.post('/api/tenant-enquiries/'+id+'/guarantor',{action:'reset'});await refreshGuarantors();setActiveStep(3);}catch(error){setGuarantorError(error instanceof Error?error.message:'The guarantor decision could not be reset.');}finally{setGuarantorDecisionSaving(false);}};
  const allGuarantorReviewsComplete=Boolean(agreement)||guarantorApplicantIds.every(id=>{const g=guarantorChecks[id];return g?.required===false||(g?.required===true&&g.signed&&g.witnessed&&!g.deedNeedsResigning&&g.record?.application_review_status==='approved');});
  const allGuarantorsComplete=Boolean(agreement)||[enquiryId,...enquiry.joint_partner_id?[Number(enquiry.joint_partner_id)]:[]].every(id=>guarantorChecks[id]?.required===false||(guarantorChecks[id]?.required===true&&guarantorChecks[id]?.status==='verified'));
  useEffect(() => {
    // Advance when a recorded milestone changes; saving a review must not reset inputs.
    if (!existingTenancy&&!enquiry.holding_deposit_requested) setActiveStep(0);
    else if (!existingTenancy&&!enquiry.holding_deposit_received) setActiveStep(1);
    else if (!enquiry.application_form_completed) setActiveStep(2);
    else if (enquiry.application_review_status !== 'approved' || (enquiry.joint_partner_id && jointApplication?.record.application_review_status !== 'approved')) setActiveStep(3);
    else if (!agreement&&!guarantorDecisionsComplete) setActiveStep(3);
    else if (!allGuarantorReviewsComplete) setActiveStep(9);
    else if (!creditChecksComplete(enquiry,jointApplication?.record)||!allGuarantorsComplete) setActiveStep(4);
    else if (agreement?.status !== 'completed') setActiveStep(5);
    else if (!existingTenancy&&!enquiry.balance_payment_received) setActiveStep(6);
    else if (!existingTenancy&&!enquiry.handover_date && !enquiry.handover_not_required) setActiveStep(7);
    else setActiveStep(8);
  }, [enquiryId,guarantorDecisionsComplete,allGuarantorReviewsComplete,allGuarantorsComplete,jointApplication?.record.credit_check_completed,jointApplication?.record.application_review_status,enquiry.holding_deposit_requested,enquiry.holding_deposit_received,enquiry.application_form_completed,enquiry.application_review_status,enquiry.credit_check_completed,enquiry.balance_payment_received,enquiry.handover_date,enquiry.handover_not_required,agreement?.status]);

  const formatMoneyInput=(value:string)=>{const [whole,fraction]=value.split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction!==undefined?'.'+fraction:'');};
  const name = [enquiry.first_name_1, enquiry.last_name_1].filter(Boolean).join(' ');
  const prop = properties.find(p => p.id === Number(enquiry.linked_property_id));
  const allCreditChecksComplete = creditChecksComplete(enquiry,jointApplication?.record)&&allGuarantorsComplete;
  useEffect(()=>{if(activeStep===3&&enquiry.application_review_status==='approved'&&!guarantorDecisionsComplete){const frame=requestAnimationFrame(()=>document.querySelector('[aria-label="Guarantor requirement"]')?.scrollIntoView({block:'end'}));return()=>cancelAnimationFrame(frame);}},[activeStep,enquiry.application_review_status,guarantorDecisionsComplete]);
  const applicationReviewStatus = reviewStatusOverride || enquiry.application_review_status;
  const waitingOnTenant = enquiry.application_review_status === 'changes_requested' && Boolean(enquiry.application_changes_sent_at);
  useEffect(()=>{setReviewStatusOverride(null);},[enquiry.application_review_status,enquiry.application_form_completed_at]);
  useEffect(()=>{
    if(!waitingOnTenant)return;
    const refresh=()=>{void onUpdate();void fetchDocs();};
    const timer=window.setInterval(refresh,15000);
    window.addEventListener('focus',refresh);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[waitingOnTenant,enquiryId]);
  const answerSection=(key:string)=> /^(bank|sort_code|account_)/.test(key)?'Bank Details':/^(nok|next_of_kin)/.test(key)?'Next of Kin':/^(guarantor)/.test(key)?'Guarantor':/^(employ|income|job|student)/.test(key)?'Employment & Income':/^(landlord|agent|current_|previous_)/.test(key)?'Address & Landlord':/^(rent|deposit|preferred|tenancy|forwarding|parking|pet|smok)/.test(key)?'Tenancy Details':/^(declar|sign|consent)/.test(key)?'Declaration':'Personal Details';
  const applicationData = (enquiry.app_form_data || {}) as Record<string, unknown>;
  const requiredReviewDocumentTypes = ['Primary Identification', 'Secondary Identification', 'Bank Statements'];
  if (!['Student', 'Unemployed'].includes(String(applicationData.employment_status || ''))) {
    requiredReviewDocumentTypes.push('Proof of Income or Employment');
  }
  const allRequiredDocsApproved = requiredReviewDocumentTypes.every(docType =>
    enquiryDocs.some(doc => doc.doc_type === docType && (documentDecisions[doc.id] || doc.review_status) === 'approved')
  );
  const visibleSections=applicationReviewSections(enquiry).map(section=>section.title);
  const allSectionsApproved=sectionReviews['Application Details'] ? sectionReviews['Application Details'].status==='approved' : enquiry.application_review_status==='approved'||(visibleSections.length>0&&visibleSections.every(section=>sectionReviews[section]?.status==='approved'));
  const allUploadedReviewDocsApproved=enquiryDocs.filter(doc=>!['Completed Tenancy Application','Tenancy Agreement','Signed Tenancy Agreement','Signed Deed of Guarantee','Credit Check Report'].includes(doc.doc_type)).every(doc=>(documentDecisions[doc.id]||doc.review_status)==='approved');
  const reviewReadyForApproval=allUploadedReviewDocsApproved&&Boolean(enquiry.application_form_completed)&&!waitingOnTenant&&applicationReviewStatus!=='approved'&&allSectionsApproved&&allRequiredDocsApproved&&!enquiryDocs.some(doc=>doc.review_status==='rejected')&&!Object.values(documentDecisions).includes('rejected');
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
      readyForApproval: reviewReadyForApproval,
      getStatus: () => applicationReviewStatus === 'approved' || reviewReadyForApproval
        ? 'green'
        : hasUnsentRejection ? 'red' : enquiry.application_form_completed ? 'amber' : 'red',
      desc: applicationReviewStatus === 'approved'
        ? 'Application and evidence approved'
        : reviewReadyForApproval ? 'All required items approved — ready to confirm and continue'
        : applicationReviewStatus === 'changes_requested'
          ? enquiry.application_changes_sent_at && !hasUnsentRejection ? 'Changes sent — waiting for tenant' : 'Changes saved — not yet sent'
          : 'Review the submitted form and evidence',
    },
    {
      label: 'Run Credit Check',
      icon: CreditCard,
      getStatus: () => allCreditChecksComplete ? 'green' : applicationReviewStatus === 'approved' ? 'amber' : 'red',
      desc: allCreditChecksComplete ? (enquiry.joint_partner_id ? 'Both applicants’ credit checks completed' : 'Credit check completed') : enquiry.joint_partner_id ? 'Enter a credit score and upload a report for each applicant' : 'Enter the credit score and upload the report',
    },
    {
      label: agreementCompliance?.agreementType === 'client' ? 'Client Tenancy Agreement' : 'Tenancy Agreement for Fleming Lettings Properties',
      icon: FileSignature,
      getStatus: () => agreement?.status === 'completed' ? 'green' : agreement || allCreditChecksComplete ? 'amber' : 'red',
      desc: agreement?.status === 'completed' ? 'Agreement signed and stored' : agreement ? 'Waiting for required signatures' : 'Generate and issue the agreement for e-signature',
    },
    {
      label: 'Final Balance',
      icon: PoundSterling,
      getStatus: () => enquiry.balance_payment_received ? 'green' : enquiry.balance_payment_requested || agreement?.status === 'completed' ? 'amber' : 'red',
      desc: enquiry.balance_payment_received
        ? `Payment received${enquiry.balance_payment_received_at ? ` on ${new Date(enquiry.balance_payment_received_at).toLocaleDateString('en-GB')}` : ''}`
        : enquiry.balance_payment_requested ? `Waiting for £${Number(enquiry.balance_due_amount || 0).toLocaleString()}` : 'Request deposit and first rent balance',
    },
    {
      label: 'Schedule Handover',
      icon: CalendarDays,
      getStatus: () => enquiry.handover_date || enquiry.handover_not_required ? 'green' : enquiry.balance_payment_received ? 'amber' : 'red',
      desc: enquiry.handover_not_required ? 'No handover required — confirmed by office' : enquiry.handover_date ? `${String(enquiry.handover_date).slice(0, 10)} at ${String(enquiry.handover_time || '').slice(0, 5)}` : handoverWithLandlord ? 'Arrange the handover directly with the landlord' : 'Assign the property handover to the team calendar',
    },
    {
      label: 'Onboarding Completed',
      icon: User,
      getStatus: () => onboardingComplete ? 'green' : 'red',
      desc: existingTenancy ? (onboardingComplete?'New tenancy scheduled; previous tenancy retained':'Complete the application, checks and agreement to finish onboarding') : onboardingComplete ? 'Tenant records created successfully' : 'Complete the handover stage to finish onboarding',
    },
    {
      label:'Guarantor Review',icon:Shield,getStatus:()=>allGuarantorReviewsComplete?'green':applicationReviewStatus==='approved'?'amber':'red',
      desc:allGuarantorReviewsComplete?'Guarantor application and witnessed deed reviewed':'Confirm the requirement, then review the application and witnessed deed',
    },
  ];

  const allPreviousComplete = (stepIdx: number) => {
    if(stepIdx===9)return Boolean(enquiry.application_form_completed)&&applicationReviewStatus==='approved'&&(!enquiry.joint_partner_id||jointApplication?.record.application_review_status==='approved');
    if(stepIdx===4&&!allGuarantorReviewsComplete)return false;
    if([5,6,7,8].includes(stepIdx)&&!allGuarantorsComplete)return false;
    for (let i = 0; i < stepIdx; i++) {
      if(existingTenancy&&[0,1,6,7].includes(i))continue;
      if (steps[i].getStatus() !== 'green' || steps[i].readyForApproval) return false;
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

  const retryFailedHoldingEmail = async () => {
    const failedEmail=emailMessages.find(message=>message.template==='holding_deposit_request');
    if(!failedEmail || failedEmail.status!=='failed')return;
    const paidNote=enquiry.holding_deposit_received?' The deposit is already recorded as received; this resends the original request email without changing the payment record.':'';
    if(!await confirmAction('Resend the failed holding deposit email?'+paidNote))return;
    setSaving(true);setReviewError('');
    try{
      const result=await api.post('/api/tenant-enquiries/'+enquiryId+'/retry-holding-deposit-email',{message_id:failedEmail.id});
      if(!result.success)setReviewError('Email retry failed: '+(result.error||'Please check delivery status.'));
      await fetchEmailHistory();
    }catch(error){setReviewError(error instanceof Error?error.message:'Email retry failed');await fetchEmailHistory();}
    finally{setSaving(false);}
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

  const completeOnboarding = async () => {
    if (!onboardingComplete) {
      await api.post(`/api/tenant-enquiries/${enquiryId}/convert`, {
        property_id: enquiry.linked_property_id,
        tenancy_start_date: agreement?.agreement_details?.tenancyStartDate || agreementStartDate || handoverDate,
        tenancy_type: 'Assured Periodic Tenancy',
      });
      setConversionComplete(true);
    }
    await onUpdate();
    setActiveStep(8);
  };
  const completingExisting=useRef(false);
  useEffect(()=>{
    if(!existingTenancy||onboardingComplete||agreement?.status!=='completed'||!allPreviousComplete(8)||completingExisting.current)return;
    completingExisting.current=true;
    void completeOnboarding().catch(error=>setReviewError(error instanceof Error?error.message:'Could not complete the new tenancy. Please retry.'));
  },[existingTenancy,onboardingComplete,agreement?.status,enquiry.application_review_status,enquiry.credit_check_completed]);

  const issueAgreement = async () => {
    if (!token) return;
    if (!await confirmAction(agreement ? 'Save these agreement changes and notify every party? Everyone must sign the revised agreement again. Previous signatures will remain only on the earlier version.' : 'Please confirm that you wish for the tenancy agreement to be issued and all automations to be sent out.')) return;
    const previousAgreementId = agreement?.id;
    setSaving(true); setReviewError('');
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/tenancy-agreement`, {
        editing_agreement_id: agreement?.id,
        tenancy_start_date: agreementStartDate,
        rent: agreementRent,
        deposit: agreementDeposit,
        permitted_occupiers: agreementOccupiers,
        shared_facilities: agreementFacilities,
        parking: agreementParking,
        payment_reference:paymentReference,
        landlord_send_email:editingAgreement||landlordSendEmail,landlord_send_sms:landlordSendSms,
        send_email: editingAgreement||agreementSendEmail,
        send_sms: agreementSendSms,
        email_message: agreementEmailMessage,
        sms_message: agreementSmsMessage,
      });
      const failures = Object.values(result.delivery || {}).filter((item: any) => item && item.success === false); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (failures.length) setReviewError(`Agreement issued, but ${failures.length} communication${failures.length === 1 ? '' : 's'} failed. Check the email/SMS history.`);
      agreementDirty.current=false;try{localStorage.removeItem(agreementDraftKey);}catch{/* The issued agreement is already saved. */}
      setEditingAgreement(false);
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
      const preview = await api.post(`/api/tenant-enquiries/${enquiryId}/${(confirmingBalance||bankReceipt)?'confirm-balance':'request-balance'}/email-preview`, { email_message: balanceEmailMessage,received_date:receiptDate,received_amount:Number(receiptAmount),bank_only:bankReceipt });
      setBalanceEmailPreview({ subject: preview.subject, bodyHtml: preview.body_html });
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Balance email preview could not be prepared');
    }
  };

  const saveBalanceDraft = async (date=balanceFollowUpDate,notes=balanceNotes) => {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||enquiry.balance_payment_requested)return;
    try{await api.post('/api/tenant-enquiries/'+enquiryId+'/balance-follow-up',{follow_up_date:date,internal_notes:notes});}
    catch(error){setReviewError(error instanceof Error?error.message:'Could not save the follow-up');}
  };
  const requestBalance = async () => {
    if(!balanceSendEmail&&!balanceSendSms){setReviewError('Select Email or SMS before sending the request.');return;}
    setSaving(true); setReviewError('');
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/request-balance`, {
        send_email: balanceSendEmail, send_sms: balanceSendSms,
        email_message: balanceEmailMessage, sms_message: balanceSmsMessage,
        follow_up_date: balanceFollowUpDate, internal_notes: balanceNotes,
      });
      const failures = Object.values(result?.delivery || {}).filter((item: any) => item && item.success === false); // eslint-disable-line @typescript-eslint/no-explicit-any
      const deliveries=Object.values(result?.delivery||{}) as {success?:boolean;simulated?:boolean;error?:string}[];
      const channels=[balanceSendEmail?'email':'',balanceSendSms?'SMS':''].filter(Boolean).join(' and ');
      if(failures.length)setBalanceDeliveryResult({title:'Delivery failed',message:[...new Set(failures.map((item:any)=>deliveryFailureReason(item.error)))].join(' ')});
      else if(deliveries.length)notify(result.simulated||deliveries.every(item=>item.simulated)?'Test request simulated. No real message was sent.':'Balance request sent by '+channels+'. Delivery updates are available in Communications.',result.simulated||deliveries.every(item=>item.simulated)?'info':'success');
      else setBalanceDeliveryResult({title:'No message sent',message:'The balance request was saved, but no messages were sent. Check recipient contact details.'});
      await Promise.all([fetchEmailHistory(), onUpdate()]);
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Balance request could not be saved'); }
    finally { setSaving(false); }
  };

  const confirmBalance = async () => {
    setSaving(true); setReviewError('');
    try {
      const result=await api.post(`/api/tenant-enquiries/${enquiryId}/confirm-balance`, {received_date:receiptDate,received_amount:Number(receiptAmount),bank_only:bankReceipt,send_email:balanceSendEmail,send_sms:balanceSendSms});
      if(Object.values(result.delivery||{}).some(v=>(v as {success?:boolean}).success===false))setReviewError('Receipt saved, but a notification failed. Check communications history.');
      setConfirmingBalance(false);
      await onUpdate();
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Balance receipt could not be saved'); }
    finally { setSaving(false); }
  };

  const previewHandoverEmail = async (landlord = false, sms = false) => {
    setReviewError('');
    try {
      const preview = await api.post(`/api/tenant-enquiries/${enquiryId}/schedule-handover/email-preview`, {
        handover_date: handoverDate, handover_time: handoverTime, assigned_to: handoverAssignedTo, location_type:handoverLocationType, location_address:handoverOtherAddress,
        with_landlord: handoverWithLandlord, recipient:landlord?'landlord':'tenant', email_message: handoverEmailMessage,
      });
      if(sms)setSmsPreview(preview.sms_body);else setHandoverEmailPreview({ subject: preview.subject, bodyHtml: preview.body_html });
    } catch (error) { setReviewError(error instanceof Error ? error.message : 'Email preview could not be prepared'); }
  };

  const scheduleHandover = async () => {
    setSaving(true); setReviewError('');
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/schedule-handover`, {
        handover_date: handoverDate, handover_time: handoverTime, assigned_to: handoverAssignedTo, location_type:handoverLocationType, location_address:handoverOtherAddress,
        send_email: handoverSendEmail, send_sms: handoverSendSms,
        landlord_send_email:handoverWithLandlord&&handoverLandlordEmail, landlord_send_sms:handoverWithLandlord&&handoverLandlordSms,
        with_landlord: handoverWithLandlord,
        email_message: handoverEmailMessage, sms_message: handoverSmsMessage,
      });
      const failures = Object.values(result?.delivery || {}).filter((item: any) => item && item.success === false); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (failures.length) setReviewError(`Delivery failed: ${failures.map((item:any)=>item.error||'Message could not be delivered').join('; ')}`); // eslint-disable-line @typescript-eslint/no-explicit-any
      await completeOnboarding();
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Handover could not be scheduled'); }
    finally { setSaving(false); }
  };



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

  const applicationAmountsLocked=Boolean(enquiry.application_form_sent||enquiry.application_form_completed);
  const applicationAmountsSaved=enquiry.security_deposit_amount!=null&&String(enquiry.security_deposit_amount).trim()!==''&&Number(enquiry.monthly_rent_agreed)>0&&Number(enquiry.security_deposit_amount)>=0;
  const applicationAmountsDirty=Number(hdMonthlyRent)!==Number(enquiry.monthly_rent_agreed)||hdSecurityDeposit.trim()===''||Number(hdSecurityDeposit)!==Number(enquiry.security_deposit_amount);
  const applicationAmountsReady=applicationAmountsSaved&&(applicationAmountsLocked||!applicationAmountsDirty);
  const saveApplicationAmounts=async()=>{
    setSaving(true);setReviewError('');
    try{await api.post(`/api/tenant-enquiries/${enquiryId}/application-amounts`,{monthly_rent:hdMonthlyRent,security_deposit:hdSecurityDeposit});await onUpdate();notify('New tenancy amounts confirmed.','success');}
    catch(error){setReviewError(error instanceof Error?error.message:'Could not save the new tenancy amounts');}
    finally{setSaving(false);}
  };

  const sendApplicationEmail = async (_preview: { subject: string; bodyHtml: string }) => {
    void _preview;
    if(existingTenancy&&!applicationAmountsReady){setReviewError('Confirm the new tenancy amounts before sending the application.');return;}
    if(existingTenancy&&!applicationSendEmail&&!applicationSendSms){setReviewError('Select Email or SMS before sending.');return;}
    setSendingEmail(true);
    try {
      const result = await api.post(`/api/tenant-enquiries/${enquiryId}/send-application-email`, {send_email:existingTenancy?applicationSendEmail:true,send_sms:existingTenancy&&applicationSendSms});
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

  const stepCardProps = { activeStep };
  const latestApplicationEmail = emailMessages.find(message =>
    message.template === 'tenancy_application' || message.template === 'holding_deposit_request'
  );
  const [trackingRefreshing,setTrackingRefreshing]=useState(false);
  const [trackingVersion,setTrackingVersion]=useState(0);
  const refreshTracking=async()=>{setTrackingRefreshing(true);setTrackingVersion(v=>v+1);try{await Promise.all([onUpdate(),fetchEmailHistory()]);}catch{setReviewError('Tracking could not be refreshed. Please try again.');}finally{setTrackingRefreshing(false);}};
  const trackingBubble=(opened?:string,firstName=enquiry.first_name_1 || 'Applicant')=><div className="flex w-full items-center justify-between gap-2 rounded-full border border-[var(--border-input)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"><span>{opened?`${firstName} last opened the form: `+new Date(opened).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):`${firstName} has not opened the form yet`}</span><button type="button" title="Refresh application tracking" aria-label="Refresh application tracking" disabled={trackingRefreshing} onClick={()=>void refreshTracking()} className="shrink-0 rounded-full p-1 hover:bg-[var(--bg-hover)]"><RefreshCw size={14} className={trackingRefreshing?'animate-spin':''}/></button></div>;
  const [jointApplicationError,setJointApplicationError]=useState('');
  useEffect(()=>{
    const partnerId=Number(enquiry.joint_partner_id);if(!partnerId){setJointApplication(null);return;}
    let active=true;
    const refreshPartner=async()=>{try{const [record,messages,documents]=await Promise.all([api.get(`/api/tenant-enquiries/${partnerId}`),api.get(`/api/email-history/tenant_enquiry/${partnerId}`),api.get(`/api/documents/tenant_enquiry/${partnerId}`)]);if(active){setJointApplication({id:partnerId,record,email:messages.find((message:typeof emailMessages[number])=>['tenancy_application','holding_deposit_request'].includes(message.template)),documents});setJointApplicationError('');}}catch{if(active)setJointApplicationError('The other applicant’s progress could not be loaded. Reopen onboarding to retry.');}};
    void refreshPartner();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refreshPartner();},15000);
    return()=>{active=false;clearInterval(timer);};
  },[api,enquiry.joint_partner_id,enquiry.application_form_sent,sendingEmail,trackingVersion]);
  if(enquiry.joint_partner_id&&jointApplication?.record.application_review_status!=='approved'){
    steps[3]={...steps[3],readyForApproval:false,getStatus:()=> 'amber',desc:'Review both applicants’ submitted forms and evidence'};
  }
  const latestHoldingEmail = emailMessages.find(message => message.template === 'holding_deposit_request');
  const applicationUrl = `https://apply.fleminglettings.co.uk/${enquiry.application_form_slug || enquiry.application_form_token || ''}`;
  const reviewSmsPreview = `Hi there ${enquiry.first_name_1 || 'there'}, thank you for completing your application forms with Fleming Lettings. We have reviewed your application and still require further information or documentation from you. Please click on this link to jump back in: ${applicationUrl}. If you need any help, then please contact our office on 01902 212 415.`;
  const answerDecision=sectionReviews['Application Details'] || (allSectionsApproved?{status:'approved'}:Object.values(sectionReviews).find(r=>r.status==='rejected'));
  const rejectionReasons=JSON.stringify([...Object.entries(sectionReviews).filter(([,r])=>r.status==='rejected').map(([section,r])=>r.reason?`${section}: ${r.reason}`:''),...enquiryDocs.filter(d=>d.review_status==='rejected').map(d=>d.review_notes?`${d.doc_type}: ${d.review_notes}`:'')]);
  const missingReviewDocuments=requiredReviewDocumentTypes.filter(type=>!enquiryDocs.some(doc=>doc.doc_type===type));
  const combinedChanges=[...(JSON.parse(rejectionReasons) as string[]).filter(Boolean),...missingReviewDocuments.map(type=>missingDocumentRequest[type])].join('\n\n');
  const waitingItems: {kind:string;label:string;reason:string}[] = enquiry.application_review_request?.items || [
    ...Object.entries(sectionReviews).filter(([,r])=>r.status==='rejected').map(([label,r])=>({kind:'section',label,reason:r.reason||''})),
    ...enquiryDocs.filter(d=>d.review_status==='rejected').map(d=>({kind:'document',label:d.doc_type,reason:d.review_notes||''})),
    ...missingReviewDocuments.map(label=>({kind:'missing_document',label,reason:missingDocumentRequest[label]})),
  ];
  const savedReviewNote = enquiry.application_review_request?.internal_notes || '';
  const reviewDocs=enquiryDocs.filter(doc=>!['Completed Tenancy Application','Tenancy Agreement','Signed Tenancy Agreement'].includes(doc.doc_type));
  const pendingReviewDocs=reviewDocs.filter(doc=>doc.review_status!=='approved');
  const approvedReviewDocs=reviewDocs.filter(doc=>doc.review_status==='approved');
  const previousReviewNotes=onboardingReviewNotes(enquiry.notes,enquiry.application_review_request);
  const applicationDetailsRow=(<div className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 ${answerDecision?.status==='approved' ? 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-secondary)]' : reviewColour(answerDecision?.status,answerDecision?.reviewed_at)}`}>
                    <FileText size={18} className="shrink-0"/>
                    <div className="min-w-0 flex-1"><p className="font-semibold text-sm">Application Details</p><p className="text-xs text-[var(--text-muted)]">{answerDecision?.status==='approved'?'Approved':answerDecision?.status==='rejected'?'Changes Required':'Needs Review'}</p></div>
                    <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
                      <Button size="sm" variant="outline" onClick={()=>setViewApplication(true)}>View Application</Button>
                      {answerDecision?.status==='approved' ? <Button size="sm" variant="outline" disabled={saving} onClick={()=>saveSection('Application Details','pending')}>Reset</Button> : <>
                      <Button size="sm" variant="outline" className="review-approve" disabled={saving} onClick={()=>saveSection('Application Details','approved')}>Approve</Button>
                      <Button size="sm" variant="outline" className="review-reject" disabled={saving} onClick={()=>{setRejectSection('Application Details');setSectionReason(answerDecision?.reason||'');}}>Reject</Button></>}
                    </div>
                  </div>);
  const previewReviewEmail=async()=>{try{const preview=await api.post(`/api/tenant-enquiries/${enquiryId}/application-review/email-preview`,{changes_required:combinedChanges});setHoldingEmailPreview(preview);}catch(e){setReviewError(String(e));}};
  const landlordBankComplete = agreementCompliance?.agreementType !== 'client' || clientDetailsReady;
  const agreementServiceComplete = agreementCompliance?.agreementType !== 'client' || ['let_only', 'rent_collection', 'full_management'].includes(String(agreementCompliance?.serviceType || ''));
  const agreementDetailsComplete = Boolean(agreementStartDate && agreementRent && agreementDeposit !== ''
    && agreementOccupiers.trim() && agreementFacilities.trim() && agreementParking.trim()
    && landlordBankComplete && agreementServiceComplete);

  const showAgreementForm = !agreement || editingAgreement;

  // Combine receipt and application tracking visually; keep the request and progression checks separate.
  const initialStage = {
    ...steps[1],
    label: 'Deposit Received & Application',
    desc: 'Confirm the holding deposit and track the tenant’s application.',
    getStatus: () => steps.slice(1,3).every(step=>step.getStatus()==='green') ? 'green' : enquiry.holding_deposit_requested ? 'amber' : 'red',
  };
  const displayedStep = existingTenancy&&[0,1,2].includes(activeStep)?2:activeStep === 2 ? 1 : activeStep;
  useEffect(()=>{
    if(displayedStep!==5)return;
    void fetchAgreementCompliance();
    const timer=setInterval(()=>void fetchAgreementCompliance(),15000);
    const refresh=()=>void fetchAgreementCompliance();window.addEventListener('focus',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[displayedStep,enquiryId,trackingVersion,enquiry.credit_check_completed,jointApplication?.record.credit_check_completed]);
  const cancelApplication=async()=>{
    if(!await confirmAction('Cancel this new application? Its history will be retained, its application links will close, and the current tenancy will stay unchanged.','Cancel Application'))return;
    setSaving(true);try{await api.post('/api/tenant-enquiries/'+enquiryId+'/cancel-new-application',{});await onUpdate();onClose();notify('Application cancelled. The current tenancy is unchanged.','success');}catch(error){notify(error instanceof Error?error.message:'Could not cancel the application','error');}finally{setSaving(false);}
  };
  const cancelControl=existingTenancy&&enquiry.status!=='converted'?<button type="button" disabled={saving} onClick={()=>void cancelApplication()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"><X size={17}/>{saving?'Please wait…':'Cancel Application'}</button>:null;
  const navigationSteps = existingTenancy ? [2,3,...hasRequiredGuarantor?[9]:[],4,5,8].map(index=>({...steps[index],index,label:index===5?'Tenancy Agreement':steps[index].label})) : [{...steps[0],index:0},{...initialStage,index:1},...[3,...hasRequiredGuarantor?[9]:[],4,5,6,7,8].map(index=>({...steps[index],index,label:index===5?'Tenancy Agreement':steps[index].label}))];
  const depositRequestContent = <>
            {enquiry.holding_deposit_requested ? (
              <div className="space-y-3">
                {/* Email sent confirmation */}
                <div className="text-sm text-[var(--onboarding-success)] flex items-center gap-2">
                  <CheckCircle size={14} /> Request recorded for {enquiry.email_1} · {enquiry.onboarding_email_sent_at ? new Date(enquiry.onboarding_email_sent_at as string | number).toLocaleDateString('en-GB') : 'Delivery shown below'}
                </div>
                {latestHoldingEmail && (
                  <div className={`rounded-lg px-3 py-2 text-sm border ${['failed', 'bounced', 'complained'].includes(latestHoldingEmail.status)
                    ? 'bg-red-500/10 border-red-500/20 text-[var(--onboarding-danger)]'
                    : latestHoldingEmail.status === 'delivered'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-[var(--onboarding-success)]'
                      : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                    Delivery: <strong>{latestHoldingEmail.status === 'sent' ? 'accepted by provider' : latestHoldingEmail.status}</strong>
                    {latestHoldingEmail.error_message && <span> — {latestHoldingEmail.error_message}</span>}
                  </div>
                )}

                {/* Financial summary */}
                <div className="bg-[var(--bg-subtle)] rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Boolean(enquiry.monthly_rent_agreed) && (
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Monthly Rent</p>
                      <p className="text-sm font-medium text-[var(--text-primary)]">£{Number(enquiry.monthly_rent_agreed).toLocaleString()}</p>
                    </div>
                  )}
                  {Boolean(enquiry.security_deposit_amount) && (
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Security Deposit</p>
                      <p className="text-sm font-medium text-[var(--text-primary)]">£{Number(enquiry.security_deposit_amount).toLocaleString()}</p>
                    </div>
                  )}
                  {Boolean(enquiry.holding_deposit_amount) && (
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Holding Deposit</p>
                      <p className="text-sm font-medium text-[var(--text-primary)]">£{Number(enquiry.holding_deposit_amount).toLocaleString()}</p>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm text-[var(--text-muted)] mb-1 font-medium">Monthly Rent (£)</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdMonthlyRent.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} onChange={e => {
                      const v = e.target.value.replace(/[^0-9.]/g, '');
                      setHdMonthlyRent(v);
                      const r = Number(v);
                      if (r > 0) { setHdHoldingDeposit(String(Math.round(r * 12 / 52))); }
                    }} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-muted)] mb-1 font-medium">Security Deposit (£)</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdSecurityDeposit.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} onChange={e => setHdSecurityDeposit(e.target.value.replace(/[^0-9.]/g, ''))} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-muted)] mb-1 font-medium">Holding Deposit (£)</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={hdHoldingDeposit.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} onChange={e => setHdHoldingDeposit(e.target.value.replace(/[^0-9.]/g, ''))} className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                  </div>
                </div>
                <DatePicker label="Follow-up Date" value={hdFollowUpDate} onChange={setHdFollowUpDate} />
              </>
            )}
</>;
  const depositReceiptContent = <>
            {enquiry.holding_deposit_received ? (
              <div className="space-y-3">
                <div className="text-sm text-[var(--onboarding-success)] flex items-center gap-2">
                  <CheckCircle size={14} /> Deposit received and confirmed
                </div>

                {/* Tracking timeline */}
                <div className="bg-[var(--bg-subtle)] rounded-lg p-3 space-y-3">
                  <p className="text-sm text-[var(--text-muted)] font-medium uppercase tracking-wider">Deposit Tracking</p>
                  <div className="space-y-2">
                    {/* Email sent row */}
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                          <Mail size={10} className="text-[var(--onboarding-success)]" />
                        </div>
                        <div className="w-px h-full bg-emerald-500/30 min-h-[16px]" />
                      </div>
                      <div className="pb-2">
                        <p className="text-sm text-[var(--text-primary)] font-medium">Confirmation for {enquiry.email_1}</p>
                        <p className="text-sm text-[var(--text-muted)]">{enquiry.onboarding_email_sent_at ? new Date(enquiry.onboarding_email_sent_at as string | number).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                      </div>
                    </div>
                    {/* Deposit received row */}
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                          <CheckCircle size={10} className="text-[var(--onboarding-success)]" />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-[var(--text-primary)] font-medium">£{Number(enquiry.holding_deposit_received_amount || enquiry.holding_deposit_amount).toLocaleString()} received</p>
                        <p className="text-sm text-[var(--text-muted)]">{enquiry.holding_deposit_received_date ? new Date(enquiry.holding_deposit_received_date).toLocaleDateString('en-GB') : '—'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Date Deposit Received */}
                <div className="rounded-lg border border-[var(--border-input)] p-3 space-y-3">
                  <p className="text-sm text-[var(--text-secondary)] font-medium">Confirm Payment</p>
                  <div className="deposit-payment-fields grid grid-cols-1 xl:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-[var(--text-muted)] mb-1 font-medium">Amount Received (£)</label>
                      <input aria-label="Amount Received (£)" type="text" inputMode="decimal" value={hdReceivedAmount.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} onChange={e => setHdReceivedAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={String(enquiry.holding_deposit_amount || '')}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none" />
                    </div>
                    <DatePicker className="deposit-payment-date" label="Date Deposit Received" value={hdReceivedDate} onChange={setHdReceivedDate} />
                  </div>
                </div>
              </div>
            )}
            <HoldingDepositTransactions enquiryId={enquiryId} enquiry={enquiry} onChanged={onUpdate}/>
</>;
  const applicationContent = <>
            {/* Current application stage */}
            {(() => {
              const sent = !!enquiry.application_form_sent;
              const completed = !!enquiry.application_form_completed;
              const started = !!enquiry.application_form_last_saved_at;
              const viewed = !!enquiry.application_form_last_viewed_at;
              const stageLabel = completed ? 'Completed' : started ? 'In Progress' : viewed ? 'Opened — Awaiting Completion' : sent ? 'Sent — Awaiting Completion' : 'Not Sent';
              const StageIcon = completed ? CheckCircle : started ? FileText : viewed ? Eye : sent ? Clock : Mail;
              const issuedAt = enquiry.onboarding_email_sent_at || latestApplicationEmail?.created_at;
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className={`shrink-0 rounded-full p-2 ${completed ? 'bg-emerald-500/15 text-[var(--onboarding-success)]' : sent || viewed || started ? 'bg-amber-500/15 text-[var(--onboarding-warning)]' : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'}`}><StageIcon size={22}/></span>
                    <div className="min-w-0"><p className="font-semibold text-sm">{stageLabel}</p>{issuedAt && <p className="text-sm text-[var(--text-secondary)] mt-1">Issued {new Date(issuedAt).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</p>}</div>
                  </div>

                  {latestApplicationEmail && (
                    <div className={`rounded-lg px-3 py-2 text-sm border ${['failed', 'bounced', 'complained'].includes(latestApplicationEmail.status)
                      ? 'bg-red-500/10 border-red-500/20 text-[var(--onboarding-danger)]'
                      : latestApplicationEmail.status === 'delivered'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-[var(--onboarding-success)]'
                        : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                      Latest email: <strong>{latestApplicationEmail.status === 'sent' ? 'Accepted by provider' : latestApplicationEmail.status.charAt(0).toUpperCase() + latestApplicationEmail.status.slice(1)}</strong>
                      {latestApplicationEmail.error_message && <span> — {latestApplicationEmail.error_message}</span>}
                    </div>
                  )}

                  {trackingBubble(enquiry.application_form_last_viewed_at)}

                  {/* Contextual content below the tracker */}
                  {completed ? (
                    <div className="space-y-2">
                      {(() => {
                        const completedApplication = enquiryDocs.find(doc => doc.doc_type === 'Completed Tenancy Application');
                        return completedApplication ? (
                          <Button variant="outline" onClick={() => downloadDocument(completedApplication.id, completedApplication.original_name)} className="flex items-center gap-2">
                            <Download size={14} /> Download Completed Application Form
                          </Button>
                        ) : <p className="text-sm text-[var(--onboarding-warning)]">The completed application PDF is being prepared.</p>;
                      })()}
                    </div>
                  ) : (sent || !!enquiry.application_form_token) ? (
                    <div className="space-y-3">
                      {enquiry.application_form_token && (
                        <div className="bg-[var(--bg-subtle)] rounded-lg p-3">
                          <div className="flex justify-between gap-3"><p className="text-sm text-[var(--text-muted)] mb-1">{enquiry.first_name_1 || name}’s Application Form Link:</p><button className="shrink-0 rounded-lg p-1.5 hover:bg-[var(--bg-hover)]" title="Copy application link" aria-label={`Copy ${name} application link`} onClick={async()=>{try{await navigator.clipboard.writeText(`https://apply.fleminglettings.co.uk/${enquiry.application_form_slug || enquiry.application_form_token}`);notify('Application link copied','success');}catch{setReviewError('Copy failed. Select the application link to copy it.');}}}><Copy size={16}/></button></div>
                          <p className="text-sm text-[var(--accent-orange)] break-all">
                            https://apply.fleminglettings.co.uk/{enquiry.application_form_slug || enquiry.application_form_token}
                          </p>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {latestApplicationEmail?.body_html && <Button variant="outline" className="gap-2" onClick={()=>setHoldingEmailPreview({subject:latestApplicationEmail.subject || 'Tenancy Application',html:latestApplicationEmail.body_html!,to:enquiry.email_1})}><Eye size={16}/> View Email</Button>}
                      <Button variant="outline" onClick={async() => { if (await confirmAction('Send each applicant their own application link?')) void sendApplicationEmail({subject:'',bodyHtml:''}); }} disabled={sendingEmail} className="flex items-center gap-2">
                        <Send size={14} /> Resend Email
                      </Button>
                      </div>
                    </div>
                  ) : (
                    !existingTenancy&&<div className="text-sm text-[var(--text-muted)]">
                      <AlertTriangle size={14} className="inline mr-1 text-[var(--onboarding-warning)]" />
                      Application form link will be sent with the holding deposit email (Step 1)
                    </div>
                  )}
                </div>
              );
            })()}
</>;
  const jointApplicationResend=<Button size="sm" variant="outline" className="joint-application-resend gap-1" disabled={sendingEmail} onClick={async()=>{if(await confirmAction('Send both applicants their own application links?'))void sendApplicationEmail({subject:'',bodyHtml:''});}}><Send size={14}/>Resend Both Emails</Button>;
  const jointApplicationContent=<div className="joint-application-panels space-y-2">{[{id:enquiryId,record:enquiry,email:latestApplicationEmail,documents:enquiryDocs},...(jointApplication?.id===Number(enquiry.joint_partner_id)?[jointApplication]:[])].map(applicant=>{
    const row=applicant.record,completed=!!row.application_form_completed,started=!!row.application_form_last_saved_at,viewed=!!row.application_form_last_viewed_at,sent=!!row.application_form_sent;
    const label=completed?'Completed':started?'In Progress':viewed?'Opened — Awaiting Completion':sent?'Sent — Awaiting Completion':'Not Sent';
    const link=row.application_form_slug||row.application_form_token,issued=row.onboarding_email_sent_at||applicant.email?.created_at;
    const fullName=[row.first_name_1,row.last_name_1].filter(Boolean).join(' ');
    const document=applicant.documents.find(d=>d.doc_type==='Completed Tenancy Application');
    return <section key={applicant.id} aria-label={fullName+' application progress'} className={`joint-application-panel rounded-xl border p-2.5 space-y-1.5 ${completed?'border-emerald-500/30 bg-emerald-500/5':'border-[var(--border-input)] bg-[var(--bg-subtle)]'}`}>
      <div className="flex items-center justify-between gap-2"><h6 className="text-sm font-semibold">{fullName}</h6>{applicant.email?.body_html&&<Button size="sm" variant="outline" className="gap-1 !text-xs" onClick={()=>setHoldingEmailPreview({subject:applicant.email!.subject||'Tenancy Application',html:applicant.email!.body_html!,to:row.email_1})}><Eye size={13}/>View Email</Button>}</div>
      <p className="flex items-center gap-2 text-xs font-medium">{completed?<CheckCircle size={16} className="text-emerald-600"/>:<Clock size={16} className="text-amber-600"/>}{label}</p>
      <div className="flex flex-wrap justify-between gap-x-2 text-xs text-[var(--text-secondary)]">{issued&&<p>Issued {new Date(issued).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</p>}{applicant.email&&<p>Email: <strong>{applicant.email.status==='sent'?'accepted by provider':applicant.email.status}</strong></p>}</div>
      {trackingBubble(row.application_form_last_viewed_at,row.first_name_1 || fullName)}
      {link?<div className="application-link-card rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5"><div className="flex items-center justify-between gap-2"><p className="text-xs text-[var(--text-muted)]">{row.first_name_1 || fullName}’s Application Form Link:</p><button type="button" className="shrink-0 rounded-lg p-1.5 hover:bg-[var(--bg-hover)]" title="Copy application link" aria-label={'Copy '+fullName+' application link'} onClick={async()=>{try{await navigator.clipboard.writeText('https://apply.fleminglettings.co.uk/'+link);notify('Application link copied','success');}catch{setReviewError('Copy failed. Select the application link to copy it.');}}}><Copy size={15}/></button></div><p className="min-w-0 flex-1 break-all text-xs leading-4 text-[var(--accent-orange)]">https://apply.fleminglettings.co.uk/{link}</p></div>:<p className="text-xs text-[var(--text-muted)]">Application link not issued yet.</p>}
      {document&&<Button size="sm" variant="outline" className="gap-1 !text-xs" onClick={()=>downloadDocument(document.id,document.original_name)}><Download size={13}/>Completed Application</Button>}
    </section>;
  })}{!jointApplication&&<p className="text-xs text-[var(--text-muted)]">{jointApplicationError||'Loading joint applicant…'}</p>}{jointApplicationError&&jointApplication&&<p role="alert" className="text-xs text-red-600">{jointApplicationError}</p>}</div>;
  const initialActions = !enquiry.holding_deposit_requested ? <>
                <DeliveryChoices email={hdRequestSendEmail} sms={hdRequestSendSms} onEmail={setHdRequestSendEmail} onSms={setHdRequestSendSms} previewEmail={()=>void previewHoldingEmail()} previewSms={()=>setSmsPreview(`Hi ${enquiry.first_name_1}, we have just emailed you the details to pay and place your holding deposit on ${propertyAddress}. Please ensure that you contact your lettings manager once the funds have been transferred so we can confirm receipt and continue with your application screening.`)}/>
                {Boolean(enquiry.joint_partner_id) && <p className="text-xs leading-4 text-[var(--text-muted)]">Joint applications receive unique application links.</p>}
                <Button variant="gradient" className="onboarding-progress-action" onClick={requestHoldingDeposit} disabled={saving || !hdMonthlyRent || !hdHoldingDeposit}>
                  {saving ? 'Sending...' : 'Send Automations & Progress'}
                </Button>
                {reviewError && <p className="text-sm text-[var(--onboarding-danger)]">{reviewError}</p>}
</> : !enquiry.holding_deposit_received ? <>
                  <DeliveryChoices email={hdReceiptSendEmail} sms={hdReceiptSendSms} onEmail={setHdReceiptSendEmail} onSms={setHdReceiptSendSms} previewEmail={()=>void previewHoldingEmail(true)} previewSms={()=>setSmsPreview(`Hi ${enquiry.first_name_1}, we are pleased to confirm receipt of your holding deposit payment of £${Number(hdReceivedAmount || enquiry.holding_deposit_amount).toLocaleString('en-GB',{minimumFractionDigits:2})}. These funds are now held on account and you can now proceed with your tenancy application of which has been issued to you on email.`)}/>

                  <Button variant="gradient" onClick={confirmDepositReceived} disabled={saving}>
                    {saving ? 'Saving...' : 'Confirm Deposit Received'}
                  </Button>
                  {reviewError && <p className="text-sm text-[var(--onboarding-danger)]">{reviewError}</p>}
</> : null;
  return (
    <div className="fixed inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={event => { if(event.target===event.currentTarget)onClose(); }}>
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-input)] onboarding-dialog w-full max-w-[1400px] max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col" style={{height:'calc(100dvh - 2rem)'}} onClick={e => e.stopPropagation()}>
        {serviceGate&&<div role="note" className="shrink-0 flex flex-wrap xl:flex-nowrap items-center justify-center gap-x-3 gap-y-2 px-4 py-2 bg-red-500/10 text-[13px] leading-5 text-red-700 dark:text-red-400 border-b border-red-500/20"><AlertTriangle size={18} className="shrink-0" aria-hidden="true"/><p className="min-w-0 text-center xl:whitespace-nowrap">Landlord service contract needs signing before onboarding can be completed or a tenancy agreement issued.</p><Link className="shrink-0 xl:ml-auto whitespace-nowrap rounded-full border border-red-500/30 bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600" to={`/properties/${serviceGate.propertyId}`} onClick={onClose}>Click to open the properties contract</Link></div>}
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
            {[enquiry.first_name_1,enquiry.last_name_1].filter(Boolean).map(part=>String(part).trim().charAt(0)).join('').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="text-lg font-bold">{name}</h3>{Boolean(enquiry.joint_partner_id||enquiry.is_joint_application)&&<span className="inline-flex items-center rounded-full bg-purple-500/15 px-3 py-1 text-xs font-semibold text-purple-600 dark:text-purple-300">Joint Application{[enquiry.partner_first_name||enquiry.first_name_2,enquiry.partner_last_name||enquiry.last_name_2].filter(Boolean).join(' ')?' with '+[enquiry.partner_first_name||enquiry.first_name_2,enquiry.partner_last_name||enquiry.last_name_2].filter(Boolean).join(' '):''}</span>}</div>
            <p className="text-sm text-[var(--text-muted)]">
              {prop ? formatPropertyAddress(prop.address, prop.postcode) : 'No property linked'}
            </p>
          </div>
          {/* Progress */}
          <div className="text-right">
            <p className="text-sm text-[var(--text-muted)]">Progress</p>
            <p className="text-sm font-bold text-[var(--onboarding-success)]">
              {navigationSteps.filter(s => s.index!==8&&s.getStatus() === 'green' && !s.readyForApproval).length}/{navigationSteps.filter(s=>s.index!==8).length}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close tenant onboarding" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 grid place-items-center w-10 h-10 rounded-full border border-[var(--border-input)]"><X size={18} /></button>
        </div>

        {/* Steps */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">

          {!prop ? <div className="space-y-4 p-5 sm:p-6 w-full overflow-y-auto"><h4 className="text-lg font-semibold">Select a Property</h4><p className="text-sm">Link a property before starting tenant onboarding so all documents and messages include the correct address.</p><Select label="Property *" searchable value={requiredProperty} onChange={setRequiredProperty} options={[{value:'',label:'Choose a property'},...properties.map(p=>({value:String(p.id),label:formatPropertyAddress(p.address,p.postcode)}))]}/><Button disabled={saving||!requiredProperty} onClick={async()=>{setSaving(true);try{await api.put(`/api/tenant-enquiries/${enquiryId}`,{linked_property_id:Number(requiredProperty)});await onUpdate();}catch(e){setReviewError(e instanceof Error?e.message:'Property could not be linked');}finally{setSaving(false);}}}>Link Property & Continue</Button>{reviewError&&<p role="alert">{reviewError}</p>}</div> : <>
          <nav aria-label="Onboarding sections" className="onboarding-section-nav hidden md:flex md:w-56 lg:w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3">
            {navigationSteps.map(step => {
              const idx = step.index;
              const selected = displayedStep === idx;
              const recordedStatus = step.getStatus();
              const status = selected&&recordedStatus==='red'?'amber':recordedStatus;
              return <button key={step.label} type="button" style={{height:52,minHeight:52,width:'100%'}} aria-current={selected ? 'step' : undefined} onClick={()=>setActiveStep(idx)} className={`shrink-0 flex items-center gap-3 rounded-xl border px-3 py-1.5 text-left transition-colors ${status === 'green' ? `bg-emerald-500/10 ${selected ? 'border-emerald-500/60 shadow-sm' : 'border-emerald-500/20 hover:bg-emerald-500/15'}` : status === 'amber' ? `bg-amber-500/10 ${selected ? 'border-amber-500/60 shadow-sm' : 'border-amber-500/30 hover:bg-amber-500/15'}` : selected ? 'border-[var(--border-input)] bg-[var(--bg-card)] shadow-sm' : 'border-[var(--border-input)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]'}`}>
                <step.icon size={20} className={`shrink-0 ${status === 'green' ? 'text-[var(--onboarding-success)]' : status === 'amber' ? 'text-[var(--onboarding-warning)]' : selected ? 'text-[var(--accent-orange)]' : 'text-[var(--text-secondary)]'}`} />
                <span className="min-w-0 flex-1"><span className={`block text-[13px] leading-snug ${selected ? 'font-semibold' : 'font-medium'}`}>{step.label}</span></span>
              </button>;
            })}
            <div className="mt-auto shrink-0 pt-5 pb-3">{cancelControl}</div>
            <dl className="shrink-0 border-t border-[var(--border-input)] pt-3 px-3 text-xs space-y-2">
              <div><dt className="text-[var(--text-muted)]">Last Viewed</dt><dd className="mt-0.5">{onboardingActivity.last_viewed_at ? new Date(onboardingActivity.last_viewed_at).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Not Recorded'}</dd></div>
              <div><dt className="text-[var(--text-muted)]">Last Progressed By</dt><dd className="mt-0.5 break-words">{onboardingActivity.last_progressed_by || 'Not Recorded'}</dd></div>
            </dl>
          </nav>
          <div className="onboarding-section-select md:hidden border-b border-[var(--border-subtle)] p-4 shrink-0"><label className="block text-sm font-medium mb-2" htmlFor="onboarding-section">Onboarding Section</label><select id="onboarding-section" value={displayedStep} onChange={e=>setActiveStep(Number(e.target.value))} className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2">{navigationSteps.map((step,idx)=><option key={step.label} value={step.index}>{idx+1}. {step.label}</option>)}</select>{cancelControl&&<div className="mt-3">{cancelControl}</div>}</div>
          <div key={displayedStep} className="flex-1 min-w-0 min-h-0 overflow-hidden p-4 sm:p-5">
          {/* Step 1: Request Holding Deposit */}
          <StepCard idx={0} step={steps[0]} activeStep={displayedStep} actions={!enquiry.holding_deposit_requested ? initialActions : <><Button variant="outline" className="gap-2" onClick={()=>previewHoldingEmail()}><Eye size={16}/>View Email</Button><Button variant="outline" className="gap-2" onClick={latestHoldingEmail?.status==='failed'?retryFailedHoldingEmail:requestHoldingDeposit} disabled={saving || !enquiry.email_1 || (!!enquiry.holding_deposit_received && latestHoldingEmail?.status!=='failed')}><Send size={16}/>{saving?'Sending...':'Resend Email'}</Button></>}>
            {depositRequestContent}
            {Boolean(enquiry.holding_deposit_requested)&&<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm rounded-xl bg-[var(--bg-subtle)] p-4"><p><span className="block text-[var(--text-secondary)]">Sent</span>{latestHoldingEmail&&['sent','delivered','delayed'].includes(latestHoldingEmail.status)?new Date(latestHoldingEmail.created_at).toLocaleString('en-GB'):'Not Recorded'}</p><p><span className="block text-[var(--text-secondary)]">Email Opened</span>{latestHoldingEmail?.opened_at?new Date(latestHoldingEmail.opened_at).toLocaleString('en-GB'):'No Open Recorded'}</p></div>}
          </StepCard>
          <StepCard idx={1} step={initialStage} activeStep={displayedStep} split>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:h-full min-h-0 items-start">
              <section aria-label="Holding deposit" className={`min-w-0 lg:h-full min-h-0 lg:overflow-y-auto rounded-xl border p-4 space-y-4 ${enquiry.holding_deposit_received ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[var(--border-input)]'}`}><h5 className="font-semibold text-base">Holding Deposit Received</h5>{depositReceiptContent}{Boolean(enquiry.holding_deposit_requested)&&initialActions&&<aside aria-label="Deposit actions" className="onboarding-actions space-y-3 border-t border-[var(--border-input)] pt-4"><h5 className="font-semibold">{enquiry.holding_deposit_requested ? 'Confirm Deposit Receipt' : 'Send Deposit & Application'}</h5>{initialActions}</aside>}</section>
              <section aria-label="Application form progress" className={`min-w-0 lg:h-full min-h-0 lg:overflow-y-auto rounded-xl border p-4 space-y-4 ${enquiry.application_form_completed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[var(--border-input)]'}`}><div className="flex items-center justify-between gap-2"><h5 className="font-semibold text-base">{enquiry.joint_partner_id?'Application Forms':'Application Form'}</h5>{Boolean(enquiry.joint_partner_id)&&jointApplicationResend}</div>{enquiry.joint_partner_id?jointApplicationContent:applicationContent}</section>
            </div>
          </StepCard>

          {/* Step 2: Holding Deposit Received */}
          {/* merged initial section 1 */}

          {/* Step 3: Application Form */}
          {existingTenancy&&<StepCard idx={2} step={steps[2]} {...stepCardProps} actions={<><DeliveryChoices email={applicationSendEmail} sms={applicationSendSms} onEmail={setApplicationSendEmail} onSms={setApplicationSendSms} disabled={sendingEmail||saving||propertySelectionChanged||!applicationAmountsReady} previewEmail={async()=>{try{setHoldingEmailPreview(await api.post('/api/tenant-enquiries/'+enquiryId+'/send-application-email/email-preview',{}));}catch(error){setReviewError(error instanceof Error?error.message:'Preview unavailable');}}} previewSms={async()=>{try{const preview=await api.post('/api/tenant-enquiries/'+enquiryId+'/send-application-email/email-preview',{});setSmsPreview(preview.sms);}catch(error){setReviewError(error instanceof Error?error.message:'Preview unavailable');}}}/><Button disabled={saving||propertySelectionChanged||sendingEmail||!applicationAmountsReady||(!applicationSendEmail&&!applicationSendSms)} onClick={()=>void sendApplicationEmail({subject:'',bodyHtml:''})}><Send size={16}/>{sendingEmail?'Sending…':'Send New Application'}</Button>{reviewError&&<p role="alert" className="text-sm text-red-600">{reviewError}</p>}</>} >
            <section aria-label="Application property" className="rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-4 space-y-3">
              <h5 className="font-semibold">Property for This Application</h5>
              {applicationPropertyLocked?<p className="text-sm">{formatPropertyAddress(prop.address,prop.postcode)}<br/><span className="text-[var(--text-muted)]">This property is fixed once the application is prepared or sent. Start a new application to choose another property.</span></p>:<><Select label="Search/Link Property" searchable value={applicationProperty} onChange={setApplicationProperty} options={[{value:'',label:'Search by address or postcode'},...properties.map(p=>({value:String(p.id),label:formatPropertyAddress(p.address,p.postcode)}))]}/><Button variant="gradient" disabled={saving||!applicationProperty||!propertySelectionChanged} onClick={()=>void(async()=>{setSaving(true);setReviewError('');try{await api.post('/api/tenant-enquiries/'+enquiryId+'/application-property',{property_id:Number(applicationProperty)});await onUpdate();}catch(e){setReviewError(e instanceof Error?e.message:'Property could not be linked');}finally{setSaving(false);}})()}>{saving?'Linking…':'Link Property'}</Button></>}
              <p className="text-sm text-[var(--text-secondary)]">The tenant’s current tenancy and billing stay unchanged while this new application is completed.</p>
            </section>
            <section aria-label="New tenancy amounts" className="rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-4 space-y-3">
              <h5 className="font-semibold">New Tenancy Amounts</h5>
              <p className="text-sm text-[var(--text-secondary)]">Confirm the agreed rent and security deposit for this new tenancy before sending the application. These amounts will appear on the tenant’s form.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="space-y-1 text-sm"><span className="block">Monthly Rent (£) *</span><input type="number" min="0.01" step="0.01" required disabled={applicationAmountsLocked||saving} value={hdMonthlyRent} onChange={e=>setHdMonthlyRent(e.target.value)} className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 disabled:opacity-70"/></label>
                <label className="space-y-1 text-sm"><span className="block">Security Deposit (£) *</span><input type="number" min="0" step="0.01" required disabled={applicationAmountsLocked||saving} value={hdSecurityDeposit} onChange={e=>setHdSecurityDeposit(e.target.value)} className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 disabled:opacity-70"/></label>
              </div>
              {!applicationAmountsLocked&&<><p className="text-sm text-[var(--text-muted)]">Enter 0 only if no security deposit is required. The current tenancy’s deposit and billing remain unchanged.</p><Button disabled={saving||propertySelectionChanged||(!applicationAmountsDirty&&applicationAmountsSaved)} onClick={()=>void saveApplicationAmounts()}>{saving?'Saving…':applicationAmountsReady?'Amounts Confirmed':'Confirm Tenancy Amounts'}</Button></>}
            </section>
            {enquiry.joint_partner_id?jointApplicationContent:applicationContent}
          </StepCard>}

          {/* Each applicant owns their answers, documents and review decisions. */}
          <StepCard idx={3} step={steps[3]} {...stepCardProps}>
            <div className={enquiry.joint_partner_id?'grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0':'min-h-0'}>
              <ApplicationReviewPanel key={enquiryId} enquiry={enquiry} documents={enquiryDocs} onView={viewDocument} onDownload={downloadDocument} onChange={async()=>{await Promise.all([onUpdate(),fetchDocs()]);setTrackingVersion(v=>v+1);}}/>
              {Boolean(enquiry.joint_partner_id)&&(jointApplication?<ApplicationReviewPanel key={jointApplication.id} enquiry={jointApplication.record} documents={jointApplication.documents} onView={viewDocument} onDownload={downloadDocument} onChange={async()=>{await onUpdate();setTrackingVersion(v=>v+1);}}/>:<p role="status">{jointApplicationError||'Loading joint applicant review…'}</p>)}
            </div>
            {Boolean(enquiry.application_form_completed)&&!agreement&&<section aria-label="Guarantor requirement" className="mt-4 space-y-3">
              {guarantorApplicantIds.map(id=>{const state=guarantorChecks[id];const applicant=id===enquiryId?enquiry:jointApplication?.record;const decided=typeof state?.required==='boolean';const locked=!!state&&state.status!=='draft'&&state.required===true;return <div key={id} className={'rounded-xl border p-4 space-y-3 '+(decided?'border-emerald-500/30 bg-emerald-500/10':'border-amber-500/30 bg-amber-500/10')}>
                <div className="flex items-center justify-between gap-3"><h5 className="font-semibold">Is a Guarantor Required? <span className="text-red-600">*</span></h5><span role="status" className={'shrink-0 rounded-full px-2.5 py-1 text-sm font-medium '+(decided?'bg-emerald-500/15 text-[var(--onboarding-success)]':'bg-amber-500/15 text-[var(--onboarding-warning)]')}>{decided?'Completed':'Pending'}</span></div>
                {guarantorApplicantIds.length>1&&<p className="font-medium">{[applicant?.first_name_1,applicant?.last_name_1].filter(Boolean).join(' ')}</p>}
                <p className="text-sm text-[var(--text-secondary)]">{allPreviousComplete(9)?'Tenant application reviews are complete. Choose Yes or No to continue.':'Choose Yes or No now. Approve the tenant application before continuing to the next stage.'}</p>
                <div className="flex flex-wrap items-center gap-3">{[true,false].map(value=><button key={String(value)} type="button" aria-pressed={state?.required===value} style={{fontWeight:state?.required===value?700:400}} disabled={guarantorDecisionSaving||!state||locked} onClick={()=>void chooseGuarantor(id,value)} className={'inline-flex items-center justify-center rounded-full border px-6 py-2.5 text-sm transition-all disabled:cursor-not-allowed '+(state?.required===value?'border-emerald-500/50 bg-emerald-500/20 font-bold text-[var(--onboarding-success)] ring-1 ring-emerald-500/30':'border-[var(--border-input)] font-normal hover:bg-[var(--bg-hover)]')}>{value?'Yes — Guarantor Required':'No — Guarantor Not Required'}</button>)}{decided&&<button type="button" disabled={guarantorDecisionSaving||locked} onClick={()=>void resetGuarantor(id)} className="inline-flex items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 px-6 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-500/20 disabled:opacity-50">Reset</button>}</div>
              </div>})}
              {guarantorError&&<p role="alert" className="text-red-600">{guarantorError}</p>}
            </section>}
          </StepCard>

          {/* Step 5: Run Credit Check */}
          <StepCard idx={9} step={steps[9]} {...stepCardProps}>
            {allPreviousComplete(9)?<div className="min-w-0 space-y-5">

              {guarantorChecks[enquiryId]?.required===true&&<GuarantorReview key={enquiryId} enquiryId={enquiryId} onChange={async()=>{await refreshGuarantors();await onUpdate();}} onContinue={()=>void refreshGuarantors()}/>}
              {Boolean(enquiry.joint_partner_id)&&guarantorChecks[Number(enquiry.joint_partner_id)]?.required===true&&<GuarantorReview key={Number(enquiry.joint_partner_id)} enquiryId={Number(enquiry.joint_partner_id)} onChange={async()=>{await refreshGuarantors();await onUpdate();}} onContinue={()=>void refreshGuarantors()}/>}
            </div>:<StagePrerequisite>Complete and approve each tenant application first.</StagePrerequisite>}
            {guarantorError&&<p role="alert" className="text-sm text-red-600">{guarantorError}</p>}
          </StepCard>
          <StepCard idx={4} step={steps[4]} {...stepCardProps}>
            {allPreviousComplete(4)?<div className={'grid grid-cols-1 gap-4 min-h-0 '+(hasRequiredGuarantor?'lg:grid-cols-2':'')}>
              <section aria-label="Tenant credit checks" className="min-w-0 space-y-3"><h4 className="font-semibold text-base">{enquiry.joint_partner_id?'Tenants':'Tenant'}</h4>
              <CreditCheckPanel key={enquiryId} enquiry={{...enquiry,id:enquiryId}} documents={enquiryDocs} onView={viewDocument} onDownload={downloadDocument} onSaved={async()=>{await Promise.all([onUpdate(),fetchDocs()]);setTrackingVersion(v=>v+1);}}/>
              {Boolean(enquiry.joint_partner_id)&&(jointApplication?<CreditCheckPanel key={jointApplication.id} enquiry={{...jointApplication.record,id:jointApplication.id}} documents={jointApplication.documents} onView={viewDocument} onDownload={downloadDocument} onSaved={async()=>{await onUpdate();setTrackingVersion(v=>v+1);}}/>:<p role="status">{jointApplicationError||'Loading joint applicant credit check…'}</p>)}
              </section>
              {hasRequiredGuarantor&&<section aria-label="Guarantor credit checks" className="min-w-0 space-y-3"><h4 className="font-semibold text-base">{guarantorApplicantIds.filter(id=>guarantorChecks[id]?.required).length>1?'Guarantors':'Guarantor'}</h4>{guarantorApplicantIds.filter(id=>guarantorChecks[id]?.required).map(id=><GuarantorCreditPanel key={id} enquiryId={id} data={guarantorChecks[id]} onSaved={async()=>{await refreshGuarantors();await onUpdate();}}/>)}</section>}
            </div>:<StagePrerequisite>Complete the application reviews and required guarantor signing before recording credit checks.</StagePrerequisite>}
          </StepCard>

          {/* Step 6: Tenancy Agreement */}
          <StepCard idx={5} step={steps[5]} {...stepCardProps} actions={allPreviousComplete(5) && showAgreementForm && <>
{showAgreementForm && <>                  {agreementCompliance?.agreementType==='client'&&<div className="space-y-2"><p className="text-sm font-semibold">Landlord Signing Invitation</p><DeliveryChoices email={landlordSendEmail} sms={landlordSendSms} onEmail={setLandlordSendEmail} onSms={setLandlordSendSms} previewEmail={async()=>{try{const p=await api.post(`/api/tenant-enquiries/${enquiryId}/landlord-agreement-preview`,{tenant_delivery:agreementSendEmail||agreementSendSms});setHoldingEmailPreview(p);}catch(e){setReviewError(String(e));}}} previewSms={async()=>{try{const p=await api.post(`/api/tenant-enquiries/${enquiryId}/landlord-agreement-preview`,{});setSmsPreview(p.sms);}catch(e){setReviewError(String(e));}}}/><p className="text-sm font-semibold pt-2">Tenant Signing Invitation</p></div>}
                  {agreementCompliance?.agreementType==='internal'&&<p className="text-sm font-semibold">Tenant Signing Invitation</p>}
                  <DeliveryChoices email={agreementSendEmail} sms={agreementSendSms} onEmail={setAgreementSendEmail} onSms={setAgreementSendSms} previewEmail={()=>void previewAgreementEmail()} previewSms={()=>setSmsPreview(renderSmsPreview(agreementSmsMessage))}/>
                  <Button className="self-start font-semibold" variant="gradient" size="sm" onClick={issueAgreement} disabled={saving || complianceLoading || agreementCompliance?.ready !== true || !agreementDetailsComplete}>{saving ? 'Generating...' : editingAgreement ? 'Save Changes & Resend Agreement' : 'Generate & Issue Agreement'}</Button>
</>}</>}>
            {allPreviousComplete(5) ? (
              <div className="space-y-3">
                {agreement && <AgreementSigningProgress onEdit={()=>setEditingAgreement(value=>!value)} editing={editingAgreement} agreement={agreement} onView={download=>void openAgreementCopy(download)} onError={setReviewError} busy={saving} resendEnabled={true} onResend={async(recipient,name)=>{
                  if(!await confirmAction(`Resend the existing agreement to ${name} only? Their signing link and existing signatures will be preserved.`))return false;
                  setSaving(true);setReviewError('');try{const result=await api.post(`/api/tenant-enquiries/${enquiryId}/tenancy-agreement/resend`,{agreement_id:agreement.id,recipient,send_email:true,send_sms:Boolean(agreement.tenant_delivery_sms)});const failed=Object.values(result.delivery as Record<string,{success:boolean;error?:string}>).filter(r=>!r.success);if(failed.length)setReviewError(failed.map(r=>r.error).join('; '));await Promise.all([fetchEmailHistory(),fetchAgreement()]);return Object.keys(result.delivery).length>0&&failed.length===0;}catch(e){setReviewError(e instanceof Error?e.message:'Could not resend');return false;}finally{setSaving(false);}
                }}/> }
                {showAgreementForm && <>
                  <div className={`rounded-lg border p-3 ${agreementCompliance?.ready ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-amber-500/20 bg-amber-500/10'}`}>
                    <h5 className="text-base font-semibold">Property Compliance</h5>
                    {!agreementCompliance?.propertyLinked ? (
                      <p className="mt-1 text-sm text-[var(--onboarding-warning)]">Link a property before issuing the agreement.</p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        <AgreementComplianceDocuments enquiryId={enquiryId} propertyId={Number(enquiry.linked_property_id)} items={agreementCompliance.items.filter(item=>['EPC','EICR','Gas Safety Certificate'].includes(item.docType))} onView={(id,name)=>void viewDocument(id,name)} onDownload={(id,name)=>void downloadDocument(id,name)} onChange={async()=>{if(!await fetchAgreementCompliance())throw Error("Could not refresh compliance");}}/>
                        {agreementCompliance.ready && <p className="pt-1 text-sm text-[var(--onboarding-success)]">These documents will be merged after the APT agreement and attached to the signing email.</p>}
                      </div>
                    )}
                  </div>
                  {!complianceLoading && agreementCompliance?.jointApplicant && !agreementCompliance.jointApplicantsReady && (
                    <div className={`rounded-lg border p-3 text-sm ${agreementCompliance.jointApplicantsReady ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-amber-500/20 bg-amber-500/10'}`}>
                      <p className="font-medium">Joint applicant: {agreementCompliance.jointApplicant.name}</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Application {agreementCompliance.jointApplicant.applicationComplete ? 'complete' : 'incomplete'} · review {agreementCompliance.jointApplicant.applicationApproved ? 'approved' : 'pending'} · credit check {agreementCompliance.jointApplicant.creditCheckComplete ? 'complete' : 'pending'}
                      </p>
                      {!agreementCompliance.jointApplicantsReady && <p className="mt-1 text-sm text-[var(--onboarding-warning)]">Both applicants must reach this stage before one shared tenancy agreement can be issued.</p>}
                    </div>
                  )}
                  <section aria-label="Contract & Tenancy Particulars" className="rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-base font-semibold">Contract &amp; Tenancy Particulars</h5><button type="button" className="company-account-details-button ml-auto inline-flex h-[44px] w-[220px] max-w-full shrink-0 items-center justify-center rounded-md bg-[#6b2d7c] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 disabled:opacity-40" disabled={!agreementCompliance?.companyAccounts} onClick={()=>setShowCompanyAccounts(true)}>View Company Account Details</button></div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      {agreementCompliance?.agreementType==='client'&&<div><dt className="text-xs text-[var(--text-secondary)]">Landlord</dt><dd>{agreementCompliance.landlordName||'Not recorded'}</dd></div>}
                      <div><dt className="text-xs text-[var(--text-secondary)]">{enquiry.joint_partner_id?'Tenants':'Tenant'}</dt><dd>{[name,enquiry.joint_partner_id?agreementCompliance?.jointApplicant?.name:null].filter(Boolean).join(' & ')}</dd></div>
                      {agreementCompliance?.agreementType==='client'&&<div><dt className="text-xs text-[var(--text-secondary)]">Service Type</dt><dd>{({let_only:'Let Only',rent_collection:'Rent Collection',full_management:'Full Management'}[agreementCompliance.serviceType||'']||'Not recorded')}</dd></div>}
                      {agreementCompliance?.agreementType==='client'&&<div><dt className="text-xs text-[var(--text-secondary)]">Agreed Fees</dt><dd>{agreementCompliance.fees?.setupPercent!=null?`${Number(agreementCompliance.fees.setupPercent).toLocaleString('en-GB')}% of first month’s rent`:'Set-up fee not recorded'}{agreementCompliance.serviceType!=='let_only'&&<span className="block">{agreementCompliance.fees?.monthlyPercent!=null?`${Number(agreementCompliance.fees.monthlyPercent).toLocaleString('en-GB')}% of monthly rent`:'Ongoing fee not recorded'}</span>}</dd></div>}
                    </dl>
                    {agreementCompliance?.agreementType==='client'&&<div aria-label="Signing process: landlord signs first, then tenants are invited to sign" className="flex flex-col sm:flex-row sm:items-center gap-3 border-t border-[var(--border-subtle)] pt-3 mt-3 text-sm">
                      <span className="text-sm font-semibold text-[var(--text-primary)] shrink-0">Signing Order:</span><div className="flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-300" aria-hidden="true">1</span><div><span className="block font-medium">Landlord signs</span><span className="block text-xs text-[var(--text-secondary)]">Invitation sent first</span></div></div>
                      <ArrowRight size={20} aria-hidden="true" className="ml-2 sm:ml-0 shrink-0 rotate-90 sm:rotate-0 text-[var(--text-secondary)]"/>
                      <div className="flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300" aria-hidden="true">2</span><div><span className="block font-medium">{enquiry.joint_partner_id?'Tenants sign':'Tenant signs'}</span><span className="block text-xs text-[var(--text-secondary)]">Invited once landlord has signed</span></div></div>
                    </div>}
                    {agreementCompliance?.agreementType==='internal'&&<div role="note" aria-label="APT payment account" className="rounded-lg border border-purple-500/15 bg-purple-500/5 px-3 py-2.5 text-sm leading-relaxed space-y-3"><p>For Fleming Lettings’ own properties, the initial rental payment, holding deposit and future rent are paid directly into Fleming Lettings’ business bank account, not the client money account.</p><AgreementPaymentAccountSummary account={agreementCompliance.initialPaymentAccount} ownPortfolio/></div>}
                    {!agreementServiceComplete&&<p className="text-sm text-[var(--onboarding-warning)]">Set the service type on the property before generating the agreement.</p>}
                  </section>
                  <section aria-label="Agreement Particulars" className="agreement-particulars rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-3 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-base font-semibold">Agreement Particulars</h5><button type="button" onClick={()=>setShowAgreementData(true)} className="rounded-md bg-[#6b2d7c] px-3 py-2 text-xs font-semibold text-white hover:opacity-90">View Data Changes on APT</button></div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                    <DatePicker label="Tenancy Start *" value={agreementStartDate} onChange={v=>{agreementDirty.current=true;setAgreementStartDate(v);}} />
                    <div>
                      <label className="block text-sm text-[var(--text-muted)] mb-1">Monthly Rent *</label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">£</span><input aria-label="Monthly Rent" type="text" inputMode="decimal" value={formatMoneyInput(agreementRent)} onChange={event => {agreementDirty.current=true;setAgreementRent(event.target.value.replace(/[^0-9.]/g,''));}} className="h-11 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg pl-7 pr-3 text-sm" /></div>
                    </div>
                    <div>
                      <label className="block text-sm text-[var(--text-muted)] mb-1">Security Deposit *</label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">£</span><input aria-label="Security Deposit" type="text" inputMode="decimal" value={formatMoneyInput(agreementDeposit)} onChange={event => {agreementDirty.current=true;setAgreementDeposit(event.target.value.replace(/[^0-9.]/g,''));}} className="h-11 w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg pl-7 pr-3 text-sm" /></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-sm text-[var(--text-muted)]">Are there any other occupants? *<textarea rows={1} value={agreementOccupiers} onChange={event => {agreementDirty.current=true;setAgreementOccupiers(event.target.value);}} placeholder="Names of other occupants, or None" className="mt-1 block min-h-11 resize-y w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2.5 text-sm" /></label>
                    <label className="text-sm text-[var(--text-muted)]">Are there shared facilities? *<textarea rows={1} value={agreementFacilities} onChange={event => {agreementDirty.current=true;setAgreementFacilities(event.target.value);}} placeholder="Describe them, or None" className="mt-1 block min-h-11 resize-y w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2.5 text-sm" /></label>
                    <label className="text-sm text-[var(--text-muted)] sm:col-span-2">Is there permitted parking, and if so where? *<textarea rows={1} value={agreementParking} onChange={event => {agreementDirty.current=true;setAgreementParking(event.target.value);}} placeholder="Describe it, or None" className="mt-1 block min-h-11 resize-y w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2.5 text-sm" /></label>
                  </div>
                  <label className="text-sm">Payment Reference<input aria-label="Payment Reference" value={paymentReference} onChange={e=>{agreementDirty.current=true;setPaymentReference(e.target.value);}} className="block w-full mt-1 rounded-lg p-3 bg-[var(--bg-input)] border border-[var(--border-input)]"/></label>
                  </section>
                  {agreementCompliance?.agreementType === 'client' && <ClientAgreementDetails enquiryId={enquiryId} onReady={setClientDetailsReady}/>}
                </>}
                {reviewError && <p className="text-sm text-[var(--onboarding-danger)]">{reviewError}</p>}
              </div>
            ) : (
              <StagePrerequisite>Complete the credit check first.</StagePrerequisite>
            )}
          </StepCard>

          {/* Step 7: Final Balance */}
          <StepCard idx={6} step={steps[6]} {...stepCardProps}>
          {allPreviousComplete(6)?<div className="space-y-4">
            <section aria-label="Final balance request" className={`rounded-xl border p-4 space-y-3 ${enquiry.balance_payment_requested?'border-emerald-500/30 bg-emerald-500/10':'border-[var(--border-input)] bg-[var(--bg-card)]'}`}>
              <div className="flex items-center justify-between"><h5 className="font-semibold">Final Balance Request</h5>{Boolean(enquiry.balance_payment_requested)&&<span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--onboarding-success)]"><CheckCircle size={17}/>Sent</span>}</div>
              <div className={enquiry.balance_payment_requested?'space-y-3':'grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-4'}><div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-[#563F6E] p-3 text-white"><span className="block text-sm text-white/90">Security Deposit</span><strong>£{Number(enquiry.security_deposit_amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
                <div className="rounded-lg bg-[#563F6E] p-3 text-white"><span className="block text-sm text-white/90">First month’s rent</span><strong>£{Number(enquiry.monthly_rent_agreed || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
                <div className="rounded-lg bg-[#187449] p-3 text-white"><span className="block text-sm text-white/90">Holding deposit received</span><strong>−£{Number(enquiry.holding_deposit_received_amount || enquiry.holding_deposit_amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
                <div className="rounded-lg bg-[#b42332] p-3 text-white"><span className="block text-sm text-white/90">Remaining balance</span><strong>£{Number(enquiry.balance_due_amount || (Number(enquiry.security_deposit_amount || 0) + Number(enquiry.monthly_rent_agreed || 0) - Number(enquiry.holding_deposit_received_amount || enquiry.holding_deposit_amount || 0))).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong></div>
              </div>
              {!enquiry.balance_payment_requested&&<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start"><label className="block text-xs font-medium text-[var(--text-secondary)]"><span className="block mb-1.5">Internal Notes</span><textarea maxLength={10000} value={balanceNotes} onChange={event=>setBalanceNotes(event.target.value)} onBlur={()=>void saveBalanceDraft()} rows={1} className="block h-12 resize-none w-full rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-3 text-sm font-normal text-[var(--text-primary)]" placeholder="Notes for checking or chasing payment"/></label><DatePicker className="[&>div]:h-12 [&_input]:h-full [&_input]:!py-0" label="Follow-up Date *" value={balanceFollowUpDate} onChange={value=>{setBalanceFollowUpDate(value);void saveBalanceDraft(value);}}/></div>}
              </div>{!enquiry.balance_payment_requested&&<aside className="onboarding-actions rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-3 space-y-3 self-start [&>button]:w-full [&>button]:h-10 [&>button]:whitespace-nowrap"><h5 className="font-semibold">Actions &amp; Previews</h5><DeliveryChoices email={balanceSendEmail} sms={balanceSendSms} onEmail={setBalanceSendEmail} onSms={setBalanceSendSms} previewEmail={()=>void previewBalanceEmail()} previewSms={()=>setSmsPreview((confirmingBalance||bankReceipt)?`Hi ${name}, we confirm £${Number(receiptAmount||0).toFixed(2)} received towards your final tenancy balance on ${receiptDate}. Thank you. Fleming Lettings.`:renderSmsPreview(balanceSmsMessage))}/><Button variant="gradient" size="sm" onClick={requestBalance} disabled={saving||!balanceFollowUpDate||(!balanceSendEmail&&!balanceSendSms)}>Send Final Balance Request</Button></aside>}</div>
            </section>
            {Boolean(enquiry.balance_payment_requested)&&<section aria-label="Record final balance payment" className={`rounded-xl border p-4 space-y-3 ${enquiry.balance_payment_received?'border-emerald-500/30 bg-emerald-500/10':'border-amber-500/40 bg-amber-500/10'}`}>
              <div className="flex items-center justify-between"><h5 className="font-semibold text-base">Record Payment</h5><span className={enquiry.balance_payment_received?'text-emerald-700':'text-amber-700'}>{enquiry.balance_payment_received?'Received':'Awaiting payment'}</span></div>
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-4"><div className="space-y-3"><FinalBalanceTransactions enquiryId={enquiryId} enquiry={enquiry} onChanged={onUpdate}/>{!enquiry.balance_payment_received&&<section aria-label="Manual payment receipt" className="rounded-xl border border-[var(--border-input)] bg-[var(--bg-card)] p-4 space-y-3"><h5 className="font-semibold">Manual Receipt</h5><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><DatePicker className="[&>div]:h-12 [&_input]:h-full [&_input]:!py-0" label="Payment Date *" value={balanceReceiptDate} onChange={value=>{setBalanceReceiptDate(value);setConfirmingBalance(true);}}/><label className="block text-xs font-medium text-[var(--text-secondary)]"><span className="block mb-1.5">Amount Received (£) *</span><input aria-label="Amount Received (£) *" type="text" inputMode="decimal" value={balanceReceiptAmount.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} onChange={event=>{const amount=event.target.value.replace(/,/g, "");if(!/^\d*(?:\.\d{0,2})?$/.test(amount))return;setBalanceReceiptAmount(amount);setConfirmingBalance(true);}} placeholder="0.00" className="block h-12 w-full rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] px-3 text-sm font-normal text-[var(--text-primary)]"/></label></div><p className="text-xs text-[var(--text-muted)]">Enter the total received so far, including any linked bank payments. Partial payments keep this stage pending.</p></section>}</div>
              {!enquiry.balance_payment_received&&<aside className="onboarding-actions rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-3 space-y-3 self-start [&>button]:w-full [&>button]:h-10 [&>button]:whitespace-nowrap"><h5 className="font-semibold">Actions &amp; Previews</h5><DeliveryChoices email={balanceSendEmail} sms={balanceSendSms} onEmail={setBalanceSendEmail} onSms={setBalanceSendSms} previewEmail={()=>void previewBalanceEmail()} previewSms={()=>setSmsPreview((confirmingBalance||bankReceipt)?`Hi ${name}, we confirm £${Number(receiptAmount||0).toFixed(2)} received towards your final tenancy balance on ${receiptDate}. Thank you. Fleming Lettings.`:renderSmsPreview(balanceSmsMessage))}/><Button variant="outline" size="sm" onClick={()=>{setConfirmingBalance(false);void requestBalance();}} disabled={saving||!balanceFollowUpDate||(!balanceSendEmail&&!balanceSendSms)}>Resend Request</Button><Button variant="gradient" size="sm" onClick={()=>void confirmBalance()} disabled={saving||!receiptDate||!Number.isFinite(Number(receiptAmount))||Number(receiptAmount)<=0||Number(receiptAmount)>Number(enquiry.balance_due_amount||0)}>Confirm Receipt of Funds</Button></aside>}</div>
            </section>}
            {reviewError&&<p role="alert" className="text-sm text-[var(--onboarding-danger)]">{reviewError}</p>}
          </div>:<StagePrerequisite>Complete the signed agreement first.</StagePrerequisite>}
          </StepCard>

          {/* Step 8: Handover */}
          <StepCard idx={7} step={steps[7]} {...stepCardProps} actions={allPreviousComplete(7) && <>
              <p className="text-xs font-medium text-[var(--text-secondary)]">Tenant notification</p><DeliveryChoices email={handoverSendEmail} sms={handoverSendSms} onEmail={setHandoverSendEmail} onSms={setHandoverSendSms} previewEmail={()=>void previewHandoverEmail()} previewSms={()=>void previewHandoverEmail(false,true)}/>{handoverWithLandlord&&<section aria-label="Landlord notification" className="space-y-2 border-t border-[var(--border-input)] pt-3"><p className="text-xs font-medium text-[var(--text-secondary)]">Landlord notification</p><DeliveryChoices email={handoverLandlordEmail} sms={handoverLandlordSms} onEmail={setHandoverLandlordEmail} onSms={setHandoverLandlordSms} previewEmail={()=>void previewHandoverEmail(true)} previewSms={()=>void previewHandoverEmail(true,true)}/></section>}

              <div className="onboarding-action-buttons flex flex-col gap-2">              <div className="[&_button]:w-full">
                {enquiry.handover_not_required ? <p className="text-sm text-emerald-500">No handover required — confirmed by office.</p> : <Button size="sm" variant="outline" disabled={saving} onClick={async()=>{
                  if(!await confirmAction('Confirm no handover is required? Any existing handover calendar task will be completed.'))return;
                  setSaving(true);try{await api.post(`/api/tenant-enquiries/${enquiryId}/no-handover`,{confirmed:true});await completeOnboarding();}catch(error){setReviewError(error instanceof Error?error.message:'Could not save');}finally{setSaving(false);}
                }}>No Handover Required</Button>}
              </div>
<Button variant="gradient" size="sm" onClick={scheduleHandover} disabled={saving || !handoverDate || !handoverTime || !handoverAssignedTo || !handoverLocationAddress}>{enquiry.handover_date ? 'Update Handover' : handoverWithLandlord?'Confirm Landlord Handover':'Book Handover'}</Button></div>
              {reviewError && <p className="text-sm text-[var(--onboarding-danger)]">{reviewError}</p>}

</>}>
            {allPreviousComplete(7) ? <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <DatePicker className="[&>div]:h-12 [&_input]:h-full [&_input]:!py-0" label="Handover Date *" value={handoverDate} onChange={setHandoverDate} />
                <TimePicker className="[&>button]:h-12 [&>button]:!font-normal [&>button_*]:!font-normal" label="Handover Time *" value={handoverTime} onChange={setHandoverTime} />
              </div>
              <Select compact className="[&>button]:!font-normal [&>button_*]:!font-normal" label="Assign Handover To" searchable value={handoverWithLandlord ? '__landlord__' : handoverAssignedTo} onChange={value=>{const landlord=value==='__landlord__';setHandoverWithLandlord(landlord);setHandoverAssignedTo(landlord?(agreementCompliance?.landlordName||'With Landlord'):value);}} options={[{value:'',label:agreementCompliance?.agreementType==='client'?'Choose team member or landlord':'Choose team member'},...(agreementCompliance?.agreementType==='client'?[{value:'__landlord__',label:'With Landlord — '+(agreementCompliance.landlordName||'Landlord')}]:[]),...users.filter(user=>user.name).map(user=>({value:user.name,label:user.name}))]}/>
              <Select compact className="[&>button]:!font-normal [&>button_*]:!font-normal" label="Handover Location *" searchable value={handoverLocationType} onChange={setHandoverLocationType} options={[{value:'property',label:'Property Address — '+propertyAddress},{value:'office',label:'Main Office — Creative Industries Centre'},...handoverOffices.filter(office=>office.office_address?.trim()).map(office=>({value:'office:'+office.id,label:office.name+' — '+office.office_address})),{value:'other',label:'Other'}]}/>
              {handoverLocationType==='other'?<Input label="Alternative Address *" value={handoverOtherAddress} onChange={setHandoverOtherAddress}/>:<p className="text-sm text-[var(--text-muted)]">{handoverLocationAddress}</p>}
            </div> : <StagePrerequisite>Confirm the final balance first.</StagePrerequisite>}
          </StepCard>

          {/* Step 9: Convert to Tenant */}
          <StepCard idx={8} step={steps[8]} {...stepCardProps}>
            <div className="space-y-3">
              {onboardingComplete ? <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20"><p className="flex items-center gap-2 text-base font-medium text-[var(--onboarding-success)]"><CheckCircle size={20}/>Onboarding Completed</p><p className="text-sm text-[var(--text-secondary)] mt-2">{existingTenancy?`${name}'s new tenancy is linked to the existing tenant record. The previous tenancy is retained in history.`:jointApplication ? 'Both applicant records now exist in the Tenant module.' : `${name}'s record now exists in the Tenant module.`}</p><p className="text-sm text-[var(--text-muted)] mt-1">{existingTenancy?'The tenancy and billing change on the agreed start date. This completed application closes then, so a new application can be started. Previous documents and payments remain in history.':'The agreed tenancy start date is retained. Future tenancies appear as scheduled until their start date.'}</p></div> : <p className="text-sm text-[var(--text-muted)]">{existingTenancy?(allPreviousComplete(8)?'The new tenancy is ready for completion.':'Complete the application, checks and agreement to finish onboarding.') : allPreviousComplete(8)?'Handover is saved. Tenant records still need to be created.':'Complete the handover stage to finish onboarding automatically.'}</p>}
              {!onboardingComplete&&allPreviousComplete(8)&&<Button variant="outline" disabled={saving} onClick={async()=>{setSaving(true);setReviewError('');try{await completeOnboarding();}catch(error){setReviewError(error instanceof Error?error.message:'Tenant records could not be created. Please retry.');}finally{setSaving(false);}}}>Retry completing onboarding</Button>}
              {reviewError&&<p role="alert" className="text-sm text-[var(--onboarding-danger)]">{reviewError}</p>}
            </div>
          </StepCard>

          </div>
          </>}
        </div>
      </div>

      {balanceDeliveryResult&&<ReviewPopup title={balanceDeliveryResult.title} onClose={()=>setBalanceDeliveryResult(null)}><p className="text-sm">{balanceDeliveryResult.message}</p><div className="flex justify-end"><Button variant="outline" onClick={()=>setBalanceDeliveryResult(null)}>Close</Button></div></ReviewPopup>}
      {viewApplication && <ReviewPopup title="Application Details" onClose={()=>setViewApplication(false)}>
        {applicationReviewSections(enquiry).map(section=><section key={section.title} className="space-y-3 border-b border-[var(--border-subtle)] pb-4 last:border-0"><h4 className="font-semibold text-base">{section.title}</h4><dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">{section.answers.map(answer=><div key={answer.key} className="min-w-0"><dt className="text-sm text-[var(--text-muted)]">{answer.label}</dt><dd className="text-sm whitespace-pre-wrap break-words mt-1">{answer.value}</dd></div>)}</dl></section>)}
        {answerDecision?.reason&&<p className="rounded-lg bg-red-500/10 p-3 text-sm whitespace-pre-wrap">{answerDecision.reason}</p>}
      </ReviewPopup>}
      {rejectSection && <ReviewPopup title="Reject Application Details" onClose={()=>{if(!saving)setRejectSection(null);}}>
        <label className="block text-sm font-semibold">Reason for Rejection<textarea autoFocus aria-label="Application rejection reason" placeholder="Explain what is incorrect or missing and what the applicant needs to change." className="mt-2 block w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] p-3 text-base" rows={5} value={sectionReason} onChange={event=>setSectionReason(event.target.value)}/></label>
        {reviewError&&<p role="alert" className="text-sm text-[var(--onboarding-danger)]">{reviewError}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={()=>setRejectSection(null)}>Cancel</Button><Button disabled={saving||!sectionReason.trim()} onClick={()=>saveSection('Application Details','rejected')}>Save Rejection</Button></div>
      </ReviewPopup>}
      {rejectDocument!==null && <ReviewPopup title="Reject Document" onClose={()=>{if(!saving)setRejectDocument(null);}}>
        <p className="text-sm break-words">{enquiryDocs.find(doc=>doc.id===rejectDocument)?.original_name}</p>
        <label className="block text-sm font-semibold">Reason for Rejection<textarea autoFocus aria-label="Document rejection reason" placeholder="Explain why the document was rejected and what is required." className="mt-2 block w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] p-3 text-base" rows={5} value={documentReasons[rejectDocument]||''} onChange={event=>setDocumentReasons(current=>({...current,[rejectDocument]:event.target.value}))}/></label>
        {reviewError&&<p role="alert" className="text-sm text-[var(--onboarding-danger)]">{reviewError}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={()=>setRejectDocument(null)}>Cancel</Button><Button disabled={saving||!documentReasons[rejectDocument]?.trim()} onClick={()=>reviewDocument(rejectDocument,'rejected',true)}>Save Rejection</Button></div>
      </ReviewPopup>}

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

      {showAgreementData&&<AgreementDataPreview context={{agreementType:agreementCompliance?.agreementType,serviceType:agreementCompliance?.serviceType,holdingDeposit:enquiry.holding_deposit_received_amount||enquiry.holding_deposit_amount||0,bankDetails:agreementCompliance?.initialPaymentAccount}} values={{tenancyStartDate:agreementStartDate,rent:agreementRent,deposit:agreementDeposit,permittedOccupiers:agreementOccupiers,sharedFacilities:agreementFacilities,parking:agreementParking,paymentReference}} previous={agreementCompliance?.defaults||{}} onViewAgreement={()=>void previewProposedAgreement()} previewingAgreement={previewingAgreement} onClose={()=>setShowAgreementData(false)}/>}
      {showCompanyAccounts&&createPortal(<div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="company-accounts-heading" className="w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] text-[var(--text-primary)] p-5 space-y-4 shadow-xl"><div className="flex items-center justify-between gap-3"><h3 id="company-accounts-heading" className="text-lg font-semibold">Company Account Details</h3><button aria-label="Close company account details" onClick={()=>setShowCompanyAccounts(false)}><X size={20}/></button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{([{title:'Business Bank Account',account:agreementCompliance?.companyAccounts?.business},{title:'Client Money Account',account:agreementCompliance?.companyAccounts?.clientMoney}] as const).map(({title,account},index)=><section key={title} className="rounded-xl border border-[var(--border-input)] bg-[var(--bg-subtle)] p-4"><h4 className="text-base font-semibold mb-3">{title}</h4><dl className="space-y-2 text-sm">{[['Account Name',account?.accountName],['Bank',account?.bankName],['Sort Code',account?.sortCode],['Account Number',account?.accountNumber],...(index===1?[['CMP Number',agreementCompliance?.companyAccounts?.cmpNumber]]:[])].map(([label,value])=><div key={label}><dt className="text-xs text-[var(--text-secondary)]">{label}</dt><dd className="break-words">{value||'Not recorded'}</dd></div>)}</dl></section>)}</div><div className="flex justify-end"><Button variant="outline" onClick={()=>setShowCompanyAccounts(false)}>Close</Button></div></section></div>,document.body)}
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
        onSend={async () => undefined} to={holdingEmailPreview?.to || enquiry.email_1 || ''} from="contact@tenancies.fleminglettings.co.uk"
        initialSubject={holdingEmailPreview?.subject || ''} initialBodyHtml={holdingEmailPreview?.html || ''} previewOnly />

    </div>
  );
}

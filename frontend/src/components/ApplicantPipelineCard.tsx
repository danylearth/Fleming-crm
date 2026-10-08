import { Building2, Calendar, UserRound } from 'lucide-react';
import './ApplicantPipelineCard.css';

export default function ApplicantPipelineCard({ name, address, stage, onboardingStep, followUp, lastAgent, workflowSince }: {
  name: string; address: string; stage: string; onboardingStep?: string; followUp?: string; lastAgent?: string; workflowSince?: string;
}) {
  const date = (value: string) => new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return <div className="applicant-card-content">
    <div className="applicant-card-name"><UserRound size={17} aria-hidden="true" /><p title={name}>{name}</p></div>
    <div className="applicant-card-property"><Building2 size={16} aria-hidden="true" /><p title={address || 'No property linked'}>{address || 'No property linked'}</p></div>
    <div className="applicant-card-stage-slot"><span className={`applicant-card-stage ${stage === 'Existing Tenant - New Onboarding' ? 'applicant-card-existing' : ''}`}>{onboardingStep ? `${stage} – ${onboardingStep}` : stage}</span></div>
    <div className="applicant-card-meta">
      <p><Calendar size={14} aria-hidden="true" /><span>Workflow since: {workflowSince ? date(workflowSince) : 'Not recorded'}</span></p>
      <p><UserRound size={14} aria-hidden="true" /><span title={lastAgent}>Last agent: {lastAgent || 'Not recorded'}</span></p>
      {followUp && <p><Calendar size={14} aria-hidden="true" /><span>Follow-up: {date(followUp)}</span></p>}
    </div>
  </div>;
}

const fs=require('fs');
module.exports=wizard=>{
 wizard=wizard.replace('else if (!creditChecksComplete(enquiry,jointApplication?.record)) setActiveStep(4);',"else if (!creditChecksComplete(enquiry,jointApplication?.record)||(guarantor?.required&&!guarantor?.record?.credit_check_completed)) setActiveStep(4);");
 wizard=wizard.replace('[guarantor?.required,guarantor?.status,enquiryId,','[guarantor?.required,guarantor?.status,guarantor?.record?.credit_check_completed,enquiryId,');
 wizard=wizard.replaceAll('idx>=4&&idx!==9&&!guarantorReady','idx>=5&&idx!==9&&!guarantorReady').replaceAll('activeStep>=4&&activeStep!==9&&!guarantorReady','activeStep>=5&&activeStep!==9&&!guarantorReady').replaceAll('step.index>=4&&step.index!==9','step.index>=5&&step.index!==9');
 wizard=wizard.replace('const visibleNavigationSteps=navigationSteps.filter(step=>step.index!==4||guarantorReady);','const visibleNavigationSteps=navigationSteps;');
 wizard=wizard.replace('const allCreditChecksComplete = creditChecksComplete(enquiry,jointApplication?.record);',"const allCreditChecksComplete = creditChecksComplete(enquiry,jointApplication?.record)&&(!guarantor?.required||!!guarantor?.record?.credit_check_completed);");
 wizard=wizard.replace("desc: allCreditChecksComplete ? (enquiry.joint_partner_id ? 'Both applicants’ credit checks completed' : 'Credit check completed') : enquiry.joint_partner_id ? 'Enter a credit score and upload a report for each applicant' : 'Enter the credit score and upload the report',", "desc: allCreditChecksComplete ? 'All required credit checks completed' : 'Record a credit score and report for each tenant'+(guarantor?.required?' and guarantor':''),");
 const start=wizard.indexOf('          <StepCard idx={4}'),end=wizard.indexOf('</StepCard>',start)+11;
 if(start<0||end<11)throw Error('Credit Check stage missing');
 wizard=wizard.slice(0,start)+`          <StepCard idx={4} step={steps[4]} {...stepCardProps} split>
            <div className={'grid grid-cols-1 gap-4 min-h-0 '+(guarantor?.required?'lg:grid-cols-2':'')}>
              <section aria-label="Tenant credit checks" className="min-w-0 space-y-3"><h4 className="font-semibold text-base">{enquiry.joint_partner_id ? 'Tenants' : 'Tenant'}</h4>
                <CreditCheckPanel key={enquiryId} enquiry={{...enquiry,id:enquiryId}} documents={enquiryDocs} onView={viewDocument} onDownload={downloadDocument} onSaved={async()=>{await Promise.all([onUpdate(),fetchDocs()]);setTrackingVersion(v=>v+1);}}/>
                {Boolean(enquiry.joint_partner_id)&&(jointApplication?<CreditCheckPanel key={jointApplication.id} enquiry={{...jointApplication.record,id:jointApplication.id}} documents={jointApplication.documents} onView={viewDocument} onDownload={downloadDocument} onSaved={async()=>{await onUpdate();setTrackingVersion(v=>v+1);}}/>:<p role="status">{jointApplicationError||'Loading joint applicant credit check…'}</p>)}
              </section>
              {guarantor?.required&&<section aria-label="Guarantor credit checks" className="min-w-0 space-y-3"><h4 className="font-semibold text-base">{(guarantor.records?.length ?? (guarantor.record ? 1 : 0)) > 1 ? 'Guarantors' : 'Guarantor'}</h4><CreditCheckPanel key={guarantor.record.id} enquiry={guarantor.record} documents={guarantor.documents} onView={viewDocument} onDownload={downloadDocument} onSaved={async()=>{await refreshGuarantor();await onUpdate();setTrackingVersion(v=>v+1);}}/></section>}
            </div>
          </StepCard>`+wizard.slice(end);
 return wizard;
};

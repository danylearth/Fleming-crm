import {it,expect} from 'vitest';
import {includeMissingDocumentRequests,missingApplicationDocuments,missingApplicationApprovals} from './application-missing-documents';
import {createApplicationReviewRequest} from './application-review-request';
const docs=['Primary Identification','Secondary Identification','Bank Statements','Proof of Income or Employment'].map(doc_type=>({doc_type}));
it('adds bank statement instructions when its category has been changed',()=>{
 const renamed=docs.map(d=>d.doc_type==='Bank Statements'?{doc_type:'Other'}:d);
 expect(includeMissingDocumentRequests('Please replace the blurred ID.','Employed',renamed)).toBe('Please replace the blurred ID.\n\nPlease also provide three months’ bank statements.');
});
it('deduplicates automatic requests and removes the need when a category is restored',()=>{
 const missing=docs.filter(d=>d.doc_type!=='Bank Statements');
 const once=includeMissingDocumentRequests('','Employed',missing);
 expect(includeMissingDocumentRequests(once,'Employed',missing)).toBe(once);
 expect(includeMissingDocumentRequests('','Employed',docs)).toBe('');
});
it('does not request employment evidence from exempt applicants',()=>{
 expect(missingApplicationDocuments('Student',docs.slice(0,3))).toEqual([]);
 expect(missingApplicationDocuments('Unemployed',docs.slice(0,3))).toEqual([]);
 expect(missingApplicationDocuments('Employed',docs.slice(0,3))).toEqual(['Proof of Income or Employment']);
});
it('waives only an explicitly overridden missing category in approval and change requests',()=>{
 const documents=docs.slice(0,3).map(doc=>({...doc,review_status:'approved'}));
 const overrides={'Proof of Income or Employment':{status:'overridden'}};
 expect(missingApplicationApprovals('Employed',documents)).toEqual(['Proof of Income or Employment']);
 expect(missingApplicationApprovals('Employed',documents,overrides)).toEqual([]);
 expect(includeMissingDocumentRequests('','Employed',documents,overrides)).toBe('');
 expect(createApplicationReviewRequest({app_form_data:{employment_status:'Employed'},application_document_overrides:overrides},documents.map((doc,id)=>({...doc,id})),'','').items).toEqual([]);
 expect(missingApplicationApprovals('Employed',documents.slice(1),overrides)).toEqual(['Primary Identification']);
});
it('requires review when a document is uploaded for a previously overridden category',()=>{
 const overrides={'Proof of Income or Employment':{status:'overridden'}};
 const documents=docs.map(doc=>({...doc,review_status:doc.doc_type==='Proof of Income or Employment'?'pending':'approved'}));
 expect(missingApplicationApprovals('Employed',documents,overrides)).toEqual(['Proof of Income or Employment']);
 documents[3].review_status='approved';
 expect(missingApplicationApprovals('Employed',documents,overrides)).toEqual([]);
 expect(missingApplicationApprovals('Employed',documents.slice(0,3),{})).toEqual(['Proof of Income or Employment']);
});
it('requires every bank statement and optional supporting upload to be reviewed',()=>{
 const approved=docs.map(doc=>({...doc,review_status:'approved'}));
 const extra={doc_type:'Bank Statements',review_status:'pending'};
 expect(missingApplicationApprovals('Employed',[...approved,extra])).toEqual(['Bank Statements']);
 extra.review_status='approved';expect(missingApplicationApprovals('Employed',[...approved,extra])).toEqual([]);
 expect(missingApplicationApprovals('Employed',[...approved,{doc_type:'Other',review_status:'pending'}])).toEqual(['Other']);
 expect(missingApplicationApprovals('Employed',[...approved,{doc_type:'Credit Check Report',review_status:'pending'}])).toEqual([]);
});

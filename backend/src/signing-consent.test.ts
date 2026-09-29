import {it,expect} from 'vitest';
import {signingConsentSnapshot,SIGNING_ACKNOWLEDGEMENTS,SIGNING_CONSENT_VERSION} from './signing-consent';
const accepted={consentVersion:SIGNING_CONSENT_VERSION,acknowledgements:{terms:true,legalEffect:true,declaration:true}};
it.each(SIGNING_ACKNOWLEDGEMENTS.map(([key])=>key))('rejects signing with %s unchecked',key=>{
 expect(()=>signingConsentSnapshot({...accepted,acknowledgements:{...accepted.acknowledgements,[key]:false}})).toThrow('Tick all three');
});
it('rejects old clients that submit only a combined consent flag',()=>{expect(()=>signingConsentSnapshot({consent:true})).toThrow('Refresh');});
it('stores server-owned wording rather than client-supplied wording',()=>{
 const snapshot=signingConsentSnapshot({...accepted,statements:['Untrusted replacement']});
 expect(snapshot.statements.map(s=>s.text)).toEqual(SIGNING_ACKNOWLEDGEMENTS.map(([,text])=>text));
 expect(snapshot.statements.every(s=>s.accepted)).toBe(true);
});

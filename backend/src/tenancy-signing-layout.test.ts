import {it,expect} from 'vitest';
import {clientLandlordSigningBlocks,tenantSigningParagraphs} from './tenancy-template';
const p=(s:string)=>`<w:p><w:r><w:t>${s}</w:t></w:r></w:p>`;
it('gives each joint tenant one reserved signature block and one blank date',()=>{const xml=tenantSigningParagraphs(['Alex','Jordan']);expect(xml.match(/Tenants Signature:/g)).toHaveLength(2);expect(xml.match(/Dated Signed:/g)).toHaveLength(2);expect(xml.match(/w:line="868"/g)).toHaveLength(2);});
it('supplies one client landlord date whether the source includes a date or omits it',()=>{for(const suffix of ['',p('Dated Signed:')]){const xml=clientLandlordSigningBlocks(p('Morgan')+p('Landlords Signature:')+suffix+p('Alex'));expect(xml.match(/Dated Signed:/g)).toHaveLength(1);expect(xml).toContain('Morgan');expect(xml).toContain('Alex');}});

import {describe,it,expect} from 'vitest';
import {validateClientDetails,type ClientDetails} from './client-agreement-details';
const details:ClientDetails={landlordName:'Test Ltd',landlordAddress:'Registered Road',companyNumber:'01234567',landlordEmail:'director@example.test',landlordPhone:'01902123456',serviceAddress:'Service Road',emergencyContact:'Office 01902123456',directorName:'Alex Director',depositScheme:'MyDeposits'};
describe('client agreement required information',()=>{
 it('requires a real company signatory and company number',()=>{expect(validateClientDetails(details,true)).toBeNull();expect(validateClientDetails({...details,directorName:''},true)).toContain('director');expect(validateClientDetails({...details,companyNumber:'123'},true)).toContain('company number');});
 it('does not require company data for an individual',()=>expect(validateClientDetails({...details,companyNumber:'',directorName:''},false)).toBeNull());
 it('uses generic deposit wording but requires service details',()=>{expect(validateClientDetails({...details,depositScheme:''},true)).toBeNull();expect(validateClientDetails({...details,serviceAddress:''},true)).toContain('service');});
});

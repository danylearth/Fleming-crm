import {it,expect} from 'vitest';
import {signTenancyLandlord,landlordSigningStage} from './tenancy-landlord-signers';
const owners=[1,2,3].map(id=>({id,name:'Owner '+id,email:`owner${id}@example.test`,token:`token${id}`,slug:`owner-${id}`}));
const signature={name:'Owner',image:'image',at:'2026-09-27T09:00Z',ip:'127.0.0.1',agent:'test'};
it('keeps tenant invitations blocked until every landlord has signed',()=>{expect(landlordSigningStage(owners).ready).toBe(false);const one=signTenancyLandlord(owners,'token2',signature);expect(one.ready).toBe(false);expect(one.waiting).toEqual(['Owner 1','Owner 3']);const two=signTenancyLandlord(one.signers,'owner-1',signature);expect(two.ready).toBe(false);const all=signTenancyLandlord(two.signers,'token3',signature);expect(all.ready).toBe(true);expect(all.waiting).toEqual([]);});
it('rejects unknown and repeated landlord signatures',()=>{expect(()=>signTenancyLandlord(owners,'unknown',signature)).toThrow('not valid');const signed=signTenancyLandlord(owners,'token1',signature);expect(()=>signTenancyLandlord(signed.signers,'token1',signature)).toThrow('already signed');});
it('does not consider a timestamp without signature evidence complete',()=>{expect(landlordSigningStage(owners.map(s=>({...s,signed_at:signature.at}))).ready).toBe(false);});

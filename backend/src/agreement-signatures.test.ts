import {it,expect,vi} from 'vitest';
const {getBbox}=vi.hoisted(()=>({getBbox:vi.fn()}));
vi.mock('node:child_process',()=>({execFile:Object.assign(()=>{}, {[Symbol.for('nodejs.util.promisify.custom')]:async()=>({stdout:getBbox()})})}));
vi.mock('./signature-image',()=>({cropSignature:async(b:Uint8Array)=>b}));
import {stampAgreementSignatures} from './agreement-signatures';
const word=(s:string,y:number,x=30)=>`<word xMin="${x}" yMin="${y}">${s}</word>`;
const slot=(role:string,y:number)=>word(role,y)+word('Signature:',y,80)+word('Dated',y+72)+word('Signed:',y+72,58);
it('stamps each joint signer once in each section even when the second tenant continues on another page',async()=>{
 getBbox.mockReturnValue('<page>'+slot('Landlords',100)+slot('Tenants',230)+'</page><page>'+slot('Tenants',100)+'</page><page>'+slot('Landlords',100)+slot('Tenants',230)+slot('Tenants',360)+'</page>');
 const pages=Array.from({length:3},()=>({getHeight:()=>842,drawImage:vi.fn(),drawText:vi.fn()}));
 const pdf={getPage:(i:number)=>pages[i],embedPng:async()=>({scaleToFit:(_w:number,h:number)=>({width:90,height:h})})};
 const signer=(name:string)=>({name,date:'2026-10-15T15:00:00Z',image:new Uint8Array([1])});
 await stampAgreementSignatures(pdf as any,'unused.pdf',{widthOfTextAtSize:()=>64} as any,[signer('Alex'),signer('Jordan')],signer('Morgan'));
 expect(pages.map(p=>p.drawImage.mock.calls.length)).toEqual([2,1,3]);
 expect(pages.flatMap(p=>p.drawText.mock.calls).map(c=>c[0])).toEqual(Array(6).fill('15th October 2026'));
 expect(pages[1].drawImage.mock.calls[0][1].y).toBe(842-172+16);
});


import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const render=vi.hoisted(()=>vi.fn(async()=>Buffer.from('refreshed-presentation')));
vi.mock('./service-agreement-pdf',()=>({servicePdf:render,signedServicePdf:vi.fn(),serviceNames:{}}));
import {readAgreementPdf} from './service-agreements';
afterEach(()=>{vi.unstubAllEnvs();render.mockClear();});
it('refreshes old unsigned copies from their saved source without rewriting signed evidence',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'service-refresh-test-'));vi.stubEnv('UPLOADS_PATH',dir);
 try{await fs.writeFile(path.join(dir,'original.docx'),'saved-contract-clauses');await fs.writeFile(path.join(dir,'issued.pdf'),'old-presentation');await fs.writeFile(path.join(dir,'signed.pdf'),'immutable-signed-evidence');const a={status:'issued',source_filename:'original.docx',filename:'issued.pdf',details:{agent_date_rendered:true,agreement_date:'2026-09-12'}};
 expect((await readAgreementPdf(a)).toString()).toBe('refreshed-presentation');expect(render).toHaveBeenCalledWith(a,Buffer.from('saved-contract-clauses'));expect((await fs.readFile(path.join(dir,'issued.pdf'))).toString()).toBe('old-presentation');
 render.mockClear();expect((await readAgreementPdf({...a,status:'signed',signed_filename:'signed.pdf'})).toString()).toBe('immutable-signed-evidence');expect(render).not.toHaveBeenCalled();
 expect((await readAgreementPdf({...a,details:{...a.details,pdf_presentation:'2026-10-05-no-underlines'}})).toString()).toBe('old-presentation');expect(render).not.toHaveBeenCalled();
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

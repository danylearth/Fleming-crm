import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {it,expect,vi} from 'vitest';
import {inlineEmailImages} from './email';
it('embeds uploaded email images once across image and CSS references, rejecting missing files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fleming-email-assets-'));
 try{vi.stubEnv('UPLOADS_PATH',root);fs.mkdirSync(path.join(root,'email-images'));const name='a'.repeat(64)+'.png';fs.writeFileSync(path.join(root,'email-images',name),Buffer.from('image fixture'));
 const url='https://crm.fleminglettings.co.uk/api/public/email-images/'+name;
 const result=inlineEmailImages(`<img src="${url}"><div style="background:url('${url}')"></div>`);
 expect(result.attachments).toHaveLength(1);expect(result.attachments[0].contentType).toBe('image/png');expect(result.html.match(/cid:/g)).toHaveLength(2);
 expect(()=>inlineEmailImages('<img src="https://crm.fleminglettings.co.uk/api/public/email-images/'+ 'b'.repeat(64)+'.png">')).toThrow('missing');
 expect(inlineEmailImages('<img src="https://other.example/api/public/email-images/'+name+'">').attachments).toHaveLength(0);
 }finally{vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});}
});

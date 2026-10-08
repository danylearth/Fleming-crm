import {it,expect} from 'vitest';
import {whatsappMediaError,whatsappMediaUrl,validWhatsAppMediaToken} from './chat-whatsapp-media';
it('enforces WhatsApp image/document limits and supported types',()=>{
 expect(whatsappMediaError({mime_type:'image/png',size:5*1024*1024})).toBeNull();
 expect(whatsappMediaError({mime_type:'image/png',size:5*1024*1024+1})).toMatch(/5 MB/);
 expect(whatsappMediaError({mime_type:'application/pdf',size:15*1024*1024})).toBeNull();
 expect(whatsappMediaError({mime_type:'text/html',size:200})).toMatch(/support/);
});
it('grants only a time-limited link to the exact file and rejects altered URLs',()=>{
 const id='d11c66b2-ec1f-4113-9e33-aba9e5355465',now=Date.now();
 const url=new URL(whatsappMediaUrl(id,'https://crm.example.test','secret',now));
 const expiry=url.searchParams.get('expires'),token=url.searchParams.get('signature');
 expect(validWhatsAppMediaToken(id,expiry,token,'secret',now)).toBe(true);
 expect(validWhatsAppMediaToken(id,expiry,token,'wrong',now)).toBe(false);
 expect(validWhatsAppMediaToken(id.replace('d11','e11'),expiry,token,'secret',now)).toBe(false);
 expect(validWhatsAppMediaToken(id,expiry,token,'secret',now+86400001)).toBe(false);
 expect(validWhatsAppMediaToken(id,expiry,'invalid','secret',now)).toBe(false);
});

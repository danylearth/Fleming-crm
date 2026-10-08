import crypto from 'node:crypto';
export function whatsappMediaError(file:{mime_type:string;size:number}|undefined):string|null {
 if(!file)return 'Choose an attachment.';
 const image=['image/jpeg','image/png'].includes(file.mime_type);
 const document=['application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.mime_type);
 if(!image&&!document)return 'WhatsApp attachments support JPG, PNG, PDF, Word, Excel and text files.';
 if(file.size<=0||file.size>(image?5:15)*1024*1024)return image?'Choose an image up to 5 MB.':'Choose a document up to 15 MB.';
 return null;
}
const signature=(id:string,expires:number,secret:string)=>crypto.createHmac('sha256',secret).update(`whatsapp-media:${id}:${expires}`).digest('hex');
export function whatsappMediaUrl(id:string,base:string,secret:string,now=Date.now()) {
 if(!secret)throw Error('Media delivery is not configured');
 const expires=Math.floor(now/1000)+86400;
 return `${base}/api/public/chat/whatsapp/media/${id}?expires=${expires}&signature=${signature(id,expires,secret)}`;
}
export function validWhatsAppMediaToken(id:string,expires:unknown,token:unknown,secret:string,now=Date.now()) {
 const expiry=Number(expires);if(!secret||!Number.isSafeInteger(expiry)||expiry<=now/1000||expiry>now/1000+86401||typeof token!=='string'||!/^\w{8}-[\w-]{27}$/.test(id)||!/^[a-f0-9]{64}$/.test(token))return false;
 return crypto.timingSafeEqual(Buffer.from(token,'hex'),Buffer.from(signature(id,expiry,secret),'hex'));
}

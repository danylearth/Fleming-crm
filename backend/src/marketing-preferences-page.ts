import fs from 'fs';
import path from 'path';
import {createHmac,randomBytes} from 'crypto';
export function preferenceRevision(token:string,choices:unknown) {
 const secret=process.env.JWT_SECRET;
 if(!secret)throw Error('Preference management is not configured');
 return createHmac('sha256',secret).update(token+JSON.stringify(choices)).digest('hex');
}
export function marketingPreferencesPage(channel:string,state:unknown) {
 const nonce=randomBytes(18).toString('base64');
 const html=fs.readFileSync(path.join(__dirname,'public-pages/marketing-preferences.html'),'utf8')
  .replace('__NONCE__',nonce).replace('__STATE__',JSON.stringify(state).replace(/</g,'\\u003c'))
  .replace(/__CHANNEL__/g,channel==='email'?'emails':'texts').replace(/__CHANNEL_LABEL__/g,channel==='email'?'Email':'SMS');
 return {html,policy:`default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`};
}

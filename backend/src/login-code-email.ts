import fs from 'fs';
import path from 'path';
import {emailSocialLinks} from './email-footer';
import {VERIFICATION_CODE_MINUTES} from './verification-code-policy';
const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function loginCodeEmail(name:string,code:string):string {
  if(!/^\d{6}$/.test(code))throw Error('A six-digit verification code is required');
  let html=fs.readFileSync(path.join(__dirname,'email-templates','40-two-factor-sign-in.html'),'utf8');
  const firstName=String(name||'').trim().split(/\s+/)[0]||'there';
  html=html.split('{{FIRST_NAME}}').join(escape(firstName)).split('{{SIGN_IN_CODE}}').join(code).split('{{EXPIRY_MINUTES}}').join(String(VERIFICATION_CODE_MINUTES));
  for(const [placeholder,network] of [['X_LINK','X'],['LINKEDIN_LINK','LinkedIn'],['YOUTUBE_LINK','YouTube']])html=html.split(placeholder).join(emailSocialLinks.find(link=>link.name===network)!.url);
  return html;
}

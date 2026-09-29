import React from 'react';
import sample from './review-company.json';
import {useApi as oldApi} from './dashboard-invoice-shim';
let company=sample,version=1,requests=[];
const person={id:1,key:'tenant:1:primary',entity_type:'tenant',entity_id:1,recipient_slot:'primary',name:'Alex Example',email:'alex@example.test'};
export const sampleDraft=form=>{const row={id:1,title:form.get('title'),subject:form.get('subject'),message:form.get('message'),status:'draft',fields:[],pages:[{width:595,height:842}],recipients:[person]};requests=[row];return row;};
export const api={...oldApi(),get:async(path)=>{
 if(path==='/api/auth/trusted-phone')return {number:'•••• ••• 0000',verified:true};
 if(path==='/api/departments')return [{id:1,name:'Administration'}];
 if(path==='/api/users')return [{id:1,name:'Alex Example',email:'alex@example.test',role:'admin',is_active:1,trusted_phone:'•••• ••• 0000'},{id:2,name:'Jamie Sample',email:'jamie@example.test',role:'staff',is_active:1,trusted_phone:'•••• ••• 0001'}];
 if(path==='/api/company-settings')return {data:company,version,users:[{id:1,name:'Alex Example'},{id:2,name:'Jamie Sample'}],history:[]};
 if(path.includes('/api/signature-requests/records'))return requests;
 if(path.includes('/api/signature-recipients/'))return [person];
 return oldApi().get(path);
},post:async(path,body)=>{
 if(path.endsWith('/challenge'))return {challengeId:'local-test',destinations:['•••• ••• 0000'],methods:['text message'],expiresInSeconds:300};
 if(path==='/api/signature-requests/preview'){await new Promise(resolve=>setTimeout(resolve,700));return {from:'contact@tenancies.fleminglettings.co.uk',subject:body.subject,previews:[{name:person.name,email:person.email,html:'<html><body style="font-family:Arial;padding:28px"><h1>Hi there Alex,</h1><p>Please review and sign your test inventory.</p><p>This local test cannot send an email.</p></body></html>'}]};}
 if(path.endsWith('/fields')){requests[0]={...requests[0],...body};return requests[0];}
 if(path==='/api/activity/heartbeat')return {};
 throw Error('Local preview only: sending is disabled');
},put:async(path,body)=>{if(path==='/api/company-settings'){if(body.verification?.codes?.[0]!=='123456')throw Error('Local test: use 123456. No text or call is sent.');company=body.data;version++;return {data:company,version};}throw Error('Preview only');}};
export function useApi(){return api;}
export function useAuth(){return {user:{id:1,name:'Alex Example',email:'alex@example.test',role:'admin',finance_access:true,appearance:{font:'arial',scale:100}},updateUser:()=>{},token:'local-test-only',logout:()=>{}};}
export function useNotifications(){return {confirmAction:async()=>false};}
export default function DisabledWidget(){return null;}

export function invalidateCache(){}

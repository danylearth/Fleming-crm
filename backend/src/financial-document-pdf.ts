import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import {pdfFontPath} from './pdf-fonts';
import {FLEMING_OPERATING_ACCOUNT,type AgreementBankDetails} from './tenancy-agreement-pdf';
export type FinancialSnapshot={cancelled_at?:string;cancellation_reason?:string;invoice_reference?:string;freeagent_invoice_url?:string;recipient:string;recipient_address:string;property:string;description:string;amount:number;date:string;due_date?:string;paid_at?:string;paid_amount?:number;own_rent?:boolean;period_start?:string;period_end?:string;payment_reference?:string;bank_details?:AgreementBankDetails};
export const financialNumber=(row:{id:number;kind:string;snapshot?:Partial<FinancialSnapshot>})=>row.snapshot?.invoice_reference||`FL-${row.kind==='remittance'?'REM':row.kind==='rent_invoice'?'RENT':'INV'}-${String(row.id).padStart(6,'0')}`;
const money=(n:number)=>Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=(v:string)=>new Date(v).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'});
export async function financialDocumentPdf(row:{id:number;kind:string;snapshot:FinancialSnapshot;reversed?:boolean}):Promise<Buffer>{
 return new Promise((resolve,reject)=>{
 const doc=new PDFDocument({size:'A4',margin:30,bufferPages:true}),chunks:Buffer[]=[];
 doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
 doc.registerFont('Arial',pdfFontPath());doc.registerFont('Arial-Bold',pdfFontPath(true));
 const s=row.snapshot,number=financialNumber(row),remittance=row.kind==='remittance';
 const logo=path.join(__dirname,'email-assets','invoice-logo.png');
 if(fs.existsSync(logo))doc.image(logo,30,32,{width:168});else doc.font('Arial-Bold').fontSize(24).fillColor('#dc006d').text('Fleming Lettings',30,40);
 doc.fillColor('#111').font('Arial-Bold').fontSize(10).text('Fleming Lettings & Developments UK Ltd',320,46,{width:245});
 doc.font('Arial').text('Creative Industries Centre\nWolverhampton Science Park\nGlaisher Drive\nWolverhampton\nWest Midlands WV10 9TG',320,60,{width:245,lineGap:2});
 const line=(y:number)=>doc.moveTo(30,y).lineTo(565,y).strokeColor('#cbd2d7').stroke();
 doc.moveTo(30,142).lineTo(276,142).strokeColor('#cbd2d7').stroke();doc.moveTo(320,142).lineTo(565,142).stroke();doc.fontSize(10).text(s.recipient,30,152,{width:270});const recipientBottom=doc.y;doc.fontSize(10).text((s.recipient_address||s.property).split(/,\s*|\n/).filter(Boolean).join('\n'),30,Math.max(166,recipientBottom+3),{width:270,lineGap:2});const addressBottom=doc.y;
 doc.font('Arial-Bold').fontSize(13).text(remittance?'REMITTANCE ADVICE':s.cancelled_at?'CANCELLED INVOICE':'INVOICE',320,153,{width:245});
 doc.fontSize(10).text(`${remittance?'Remittance':'Invoice'} Reference: ${number}`,320,174,{width:245}).text(date(row.kind==='rent_invoice'?(s.due_date||s.date):s.date),320,191);doc.font('Arial').fontSize(9).fillColor('#65727c').text(remittance?`Paid: ${date(s.paid_at||s.date)}`:`Payment Due: ${date(s.due_date||s.date)}`,320,209,{width:245});
 let y=Math.max(220,addressBottom+22,doc.y+22);doc.rect(30,y,535,23).fill('#111');doc.fillColor('white').font('Arial-Bold').fontSize(9).text('Quantity',34,y+7).text('Details',106,y+7).text('Unit Price (£)',408,y+7,{width:72,align:'right'}).text('Subtotal (£)',486,y+7,{width:75,align:'right'});
 y+=30;doc.fillColor('#111').font('Arial').fontSize(10);const description=s.description+(remittance?'\n'+s.property:'');const height=Math.max(22,doc.heightOfString(description,{width:292})+10);doc.rect(30,y-7,535,height).fill('#f3f4f5');doc.fillColor('#111');
 doc.text('1',34,y).text(description,106,y,{width:292}).text(money(s.amount),408,y,{width:72,align:'right'}).text(money(s.amount),486,y,{width:75,align:'right'});y+=height;line(y);
 doc.font('Arial-Bold').text(remittance?'GBP Remitted':'GBP Total',345,y+12,{width:130,align:'right'}).text('£'+money(s.amount),480,y+12,{width:81,align:'right'});y+=32;
 if(!remittance){const paid=Number(s.paid_amount||0);doc.font('Arial').text(s.paid_at?'Payment: '+date(s.paid_at):'Recorded Payments',310,y,{width:165,align:'right'}).text('£'+money(paid),480,y,{width:81,align:'right'});y+=20;line(y);doc.font('Arial-Bold').text('GBP Due',345,y+12,{width:130,align:'right'}).text('£'+money(s.cancelled_at?0:Math.max(0,s.amount-paid)),480,y+12,{width:81,align:'right'});y+=28;}
 if(s.cancelled_at){doc.fillColor('#b91c1c').font('Arial-Bold').text('Cancelled '+date(s.cancelled_at)+' — No payment due',30,y,{width:535});y=doc.y+8;doc.font('Arial').fontSize(9).text(s.cancellation_reason||'',30,y,{width:535});y=doc.y+12;}
 if(row.reversed){doc.fillColor('#b91c1c').font('Arial-Bold').text('REVERSED - BANK ALLOCATION REMOVED',30,y);y+=25;}
 doc.moveTo(30,y+10).lineTo(276,y+10).strokeColor('#cbd2d7').stroke();doc.moveTo(320,y+10).lineTo(565,y+10).stroke();doc.fillColor('#111').font('Arial-Bold').text(remittance?'Payment Record':'Payment Details',30,y+20).text('Other Information',320,y+20);doc.font('Arial').fontSize(9);
 const bank=s.bank_details||(s.own_rent!==false?FLEMING_OPERATING_ACCOUNT:undefined);
 const paymentText=s.cancelled_at?'This invoice has been cancelled. No payment is required.':remittance?'Based on an allocated outgoing bank payment.':bank?[bank.accountName,'Bank Name: '+bank.bankName,'Sort Code: '+bank.sortCode.replace(/(\d{2})-?(\d{2})-?(\d{2})/,'$1-$2-$3'),'Account Number: '+bank.accountNumber,'Payment Reference: '+(s.payment_reference||number)].join('\n'):'Contact Fleming Lettings for the client rent payment details.\nPayment Reference: '+(s.payment_reference||number);
 doc.text(paymentText,30,y+42,{width:290,lineGap:2});doc.font('Arial-Bold').text('Company Registration Number: ',320,y+42,{width:245,continued:true}).font('Arial').text('13943597');
 const registeredAddressY=doc.y+12;
 doc.font('Arial-Bold').text('Registered Office Address:',320,registeredAddressY,{width:245});
 doc.font('Arial').text('Creative Industries Centre\nWolverhampton Science Park\nWolverhampton\nUnited Kingdom\nWV10 9TG',320,doc.y+4,{width:245,lineGap:2});doc.end();
 });
}

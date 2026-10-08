const {chromium}=require('C:/Users/samfl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});await page.goto(process.env.CRM_PREVIEW_URL||'http://127.0.0.1:8975/');
 const question=page.getByRole('region',{name:'Guarantor requirement'});await question.getByRole('status').filter({hasText:'Pending'}).waitFor();
 const change=async(id,field,value)=>{await page.evaluate(async({id,field,value})=>{const key='fleming-crm-preview-records',data=JSON.parse(localStorage.getItem(key))||await (await fetch("/preview-seed.json")).json();data.records[id][field]=value;localStorage.setItem(key,JSON.stringify(data));},{id,field,value});await page.reload();await page.getByRole('heading',{name:'Application Review',exact:true}).waitFor();};
 for(const id of [83,84]){await change(id,'application_review_status','pending');if(await question.count())throw Error('Question visible before applicant approval: '+id);await change(id,'application_review_status','approved');await question.waitFor();}
 await change(84,'application_form_completed',0);if(await question.count())throw Error('Question visible before form completion');await change(84,'application_form_completed',1);await question.waitFor();
 await page.screenshot({path:'docs/reviews/crm-2026-09-30/72-guarantor-question-pending.png'});
 await page.getByRole('button',{name:'Yes — Guarantor Required',exact:true}).click();await page.getByRole('heading',{name:'Guarantor Review',exact:true}).waitFor();
 const credit=page.getByRole('navigation',{name:'Onboarding sections'}).getByRole('button',{name:'Run Credit Check',exact:true});if(await credit.count())throw Error('Credit visible before guarantor review');
 if(await page.locator('#onboarding-section option[value="4"]').count())throw Error('Credit visible in mobile menu');
 await page.reload();await page.getByRole('heading',{name:'Guarantor Review',exact:true}).waitFor();if(await credit.count())throw Error('Reload restored credit before approval');
 await page.screenshot({path:'docs/reviews/crm-2026-09-30/73-guarantor-credit-locked.png'});
 console.log('Both applicant gates, pending badge, incomplete-form gate, hidden credit in both menus and reload verified.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

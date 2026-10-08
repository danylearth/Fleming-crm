const {chromium}=require('C:/Users/samfl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 await page.goto(process.env.CRM_PREVIEW_URL||'http://127.0.0.1:8975/');
 await page.getByRole('button',{name:'Yes — Guarantor Required',exact:true}).click();
 await page.getByRole('button',{name:'Preview Email',exact:true}).click();
 const frame=page.frameLocator('iframe[title="Email preview"]');
 await frame.getByText('Hi there Robin Taylor,',{exact:true}).waitFor();
 const body=await frame.locator('body').innerText();
 if(/ROBIN_NAME|MORGAN_NAME|SIGNED_TIME|You have been nominated to support|Signing order:/.test(body))throw Error('Placeholder or removed text');
 if(!body.includes('Casey Taylor and Jamie Taylor have asked you')||!body.includes('You may wish to obtain independent legal advice before signing.'))throw Error('Email copy incorrect');
 if(!body.includes('Below you will find a link to your guarantor application, of where you will need to supply us with supporting documentation and personal information, including your financial or employment details, followed by a separate Deed of Guarantee for the proposed assured periodic tenancy.'))throw Error('New introductory paragraph missing');
 await frame.getByText('Tenancy type',{exact:true}).waitFor();await frame.getByText('Assured Periodic Tenancy',{exact:true}).waitFor();
 await frame.locator('img').first().evaluate(img=>img.decode());
 for(const img of await frame.locator('img').all()){
  await img.evaluate(el=>el.decode());
  if(!await img.evaluate(el=>el.complete&&el.naturalWidth>0))throw Error('Broken email image');
 }
 const href=await frame.getByRole('link',{name:'Click here to start',exact:true}).getAttribute('href');
 if(href!==new URL('/guarantor/index.html#apply',page.url()).href)throw Error('Wrong application link');
 await page.screenshot({path:'docs/reviews/crm-2026-09-30/guarantor-email-fixed.png'});
 await frame.getByAltText('Hand holding house keys by a front door').scrollIntoViewIfNeeded();
 await page.screenshot({path:'docs/reviews/crm-2026-09-30/guarantor-email-artwork-fixed.png'});
 const witness=await page.evaluate(async()=>{const r=await fetch('/api/preview/guarantor/email-preview',{method:'POST',body:JSON.stringify({witness:true})});return r.json()});
 if(/ROBIN_NAME|MORGAN_NAME|SIGNED_TIME/.test(witness.html)||!witness.html.includes('data:image/png;base64,'))throw Error('Witness email not resolved');
 console.log('Hosted email: personalised name, both tenants, revised wording, duplicate removed, all images loaded and correct application link.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

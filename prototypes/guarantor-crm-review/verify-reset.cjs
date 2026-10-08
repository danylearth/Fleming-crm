const {chromium}=require('C:/Users/samfl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 await page.goto(process.env.CRM_PREVIEW_URL||'http://127.0.0.1:8975/');
 const question=page.getByRole('region',{name:'Guarantor requirement'});
 const nav=page.getByRole('navigation',{name:'Onboarding sections'});
 const back=()=>nav.getByRole('button',{name:'Application Review',exact:true}).click();
 await question.waitFor();
 const resets=page.getByRole('button',{name:'Reset',exact:true});
 if(!await resets.count())throw Error('No document reset buttons');
 for(const reset of await resets.all())if(await reset.evaluate(el=>getComputedStyle(el).color)!=='rgb(185, 28, 28)')throw Error('Document Reset not red');
 for(const value of [false,true]){
  const label=value?'Yes — Guarantor Required':'No — Continue to Credit Check';
  await question.getByRole('button',{name:label,exact:true}).click();
  await page.getByRole('heading',{name:value?'Guarantor Review':'Run Credit Check',exact:true}).waitFor();
  await back();await question.waitFor();
  if(!(await question.getAttribute('class')).includes('bg-emerald'))throw Error('Decision section not green');
  if(await question.getByText(/Saved decision/).count())throw Error('Old saved decision text');
  const selected=question.getByRole('button',{name:label,exact:true});
  if(await selected.getAttribute('aria-pressed')!=='true'||await selected.evaluate(el=>getComputedStyle(el).fontWeight)!=='700')throw Error('Selected answer not highlighted/bold: '+await selected.evaluate(el=>JSON.stringify({pressed:el.getAttribute('aria-pressed'),weight:getComputedStyle(el).fontWeight})));
  if(value){await page.reload();await back();await question.waitFor();if(await selected.getAttribute('aria-pressed')!=='true')throw Error('Selection lost after refresh');}
  await question.scrollIntoViewIfNeeded();await page.screenshot({path:'docs/reviews/crm-2026-09-30/guarantor-decision-'+(value?'yes':'no')+'.png'});
  await question.getByRole('button',{name:'Reset',exact:true}).click();
  await question.getByRole('status').filter({hasText:'Pending'}).waitFor();
  if(await nav.getByRole('button',{name:'Run Credit Check',exact:true}).count()||await nav.getByRole('button',{name:'Guarantor Review',exact:true}).count())throw Error('Reset left next stage enabled');
  if(await question.locator('[aria-pressed=true]').count())throw Error('Reset kept selected answer');
 }
 await question.getByRole('button',{name:'Yes — Guarantor Required',exact:true}).click();
 await page.getByRole('button',{name:'Send Application & Deed',exact:true}).click();await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.getByRole('button',{name:'Resend Application & Deed',exact:true}).waitFor();
 await back();await question.getByRole('button',{name:'Reset',exact:true}).click();await question.getByRole('status').filter({hasText:'Pending'}).waitFor();
 await question.getByRole('button',{name:'Yes — Guarantor Required',exact:true}).click();await page.getByRole('button',{name:'Send Application & Deed',exact:true}).waitFor();
 console.log('Red document resets, both green decisions, selected highlight, correct routing, refresh and reset/restart after invitation passed.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

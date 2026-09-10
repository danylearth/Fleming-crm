// Run after npm run build. Uses the pinned CLI with a temporary, unsigned-in account.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.NODE_ENV='test';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'fleming-oauth-shutdown-'));
process.env.FLEMO_ACCOUNT_PATH=root;
const {FlemoAccount}=await import('../dist/flemo-oauth.js');
const account=new FlemoAccount(9901);
try {
  await account.initialise();
  assert.equal((await account.status()).connected,false);
  const pending=Array.from({length:20},()=>account.call('account/read',{refreshToken:false}));
  account.stop();
  const outcomes=await Promise.allSettled(pending);
  assert(outcomes.some(result=>result.status==='rejected'));
  await assert.rejects(account.status(),/connection stopped/);
  await new Promise(resolve=>setTimeout(resolve,250));
  console.log('PASS real Codex shutdown with 20 pending requests; closed connections reject safely');
} finally {
  account.stop();
  fs.rmSync(root,{recursive:true,force:true});
}

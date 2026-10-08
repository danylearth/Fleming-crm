import {it,expect} from 'vitest';
import {flemoProviderError} from './flemo-errors';
it('explains confirmed account limits and safe recovery',()=>{
 for(const error of [{codexErrorInfo:'UsageLimitExceeded'},{code:'insufficient_quota'},{message:'You have hit your usage limit. Upgrade or try again later.'}]){
  expect(flemoProviderError(error).code).toBe('ai_usage_limit');
  expect(flemoProviderError(error).message).toContain('administrator');
 }
});
it('distinguishes short-term throttling and authentication from credit limits',()=>{
 expect(flemoProviderError({codexErrorInfo:{HttpConnectionFailed:{httpStatusCode:429}}}).code).toBe('ai_rate_limit');
 expect(flemoProviderError({codexErrorInfo:'Unauthorized'}).code).toBe('ai_reconnect');
});
it('never exposes unknown provider messages or asserts credits are exhausted',()=>{
 const error=flemoProviderError({message:'private-token-123 connection broke'});
 expect(error.code).toBe('ai_unavailable');expect(error.message).not.toContain('private-token');expect(error.message).not.toContain('credit');
});

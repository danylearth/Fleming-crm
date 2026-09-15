import {afterEach,describe,expect,it,vi} from 'vitest';
import {freeAgentAuthUrl,freeAgentPages} from './freeagent';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('FreeAgent account integration',()=>{
 it('uses the office callback and opaque state without exposing its client secret',()=>{
  vi.stubEnv('FREEAGENT_CLIENT_ID','office');vi.stubEnv('FREEAGENT_CLIENT_SECRET','private');vi.stubEnv('FREEAGENT_REDIRECT_URI','https://example.test/callback');vi.stubEnv('BANK_FEED_ENCRYPTION_KEY','test');
  const url=new URL(freeAgentAuthUrl('opaque-state'));
  expect(url.origin).toBe('https://api.freeagent.com');expect(url.searchParams.get('state')).toBe('opaque-state');expect(url.searchParams.get('redirect_uri')).toBe('https://example.test/callback');expect(url.toString()).not.toContain('private');
 });
 it('imports every page and never forwards the token to an untrusted pagination target',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({bank_transactions:[{id:1}]}),{headers:{link:'<https://api.freeagent.com/v2/bank_transactions?page=2>; rel="next"'}})).mockResolvedValueOnce(new Response(JSON.stringify({bank_transactions:[{id:2}]}),{headers:{link:'<https://evil.test/collect>; rel="next"'}}));
  vi.stubGlobal('fetch',fetch);
  await expect(freeAgentPages('https://api.freeagent.com/v2/bank_transactions','bank_transactions','secret')).rejects.toThrow('Invalid FreeAgent pagination');expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('combines paginated results',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({bank_accounts:[1]}),{headers:{link:'<https://api.freeagent.com/v2/bank_accounts?page=2>; rel="next"'}})).mockResolvedValueOnce(new Response(JSON.stringify({bank_accounts:[2]}))));
  expect(await freeAgentPages('https://api.freeagent.com/v2/bank_accounts','bank_accounts','secret')).toEqual([1,2]);
 });
});

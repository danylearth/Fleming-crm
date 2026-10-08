import {afterEach,expect,it,vi} from 'vitest';
import {executionConsent,guarantorDeclarations,witnessDeclarations,validateExecutionIdentity,sealGuarantorToken,openGuarantorToken,ensureExecutionBeforeStart} from './guarantor-execution-rules';
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
const form={name:'Robin Taylor',email:'robin@example.test',witnessName:'Morgan Reed',witnessEmail:'morgan@example.test',witnessAddress:'2 Example Road'};
it('requires affirmative declarations separately from each signatory',()=>{
 for(const [role,statements] of [['guarantor',guarantorDeclarations],['witness',witnessDeclarations]] as const){
  const accepted=Object.fromEntries(Object.keys(statements).map(key=>[key,true]));
  expect(executionConsent(role,accepted).statements.every(item=>item.accepted===true)).toBe(true);
  expect(()=>executionConsent(role,{...accepted,[Object.keys(statements)[0]]:'true'})).toThrow();
 }
 expect(()=>executionConsent('witness',Object.fromEntries(Object.keys(guarantorDeclarations).map(key=>[key,true])))).toThrow();
});
it('prevents a guarantor from posing as their own witness',()=>{
 expect(()=>validateExecutionIdentity('guarantor',form,'Different Person')).toThrow();
 expect(()=>validateExecutionIdentity('witness',form,' Robin Taylor ')).toThrow();
 expect(()=>validateExecutionIdentity('witness',{...form,witnessEmail:'ROBIN@example.test'},'Morgan Reed')).toThrow();
 expect(()=>validateExecutionIdentity('witness',form,'Morgan Alexander Reed')).not.toThrow();
});
it('protects stored links against disclosure and tampering',()=>{
 vi.stubEnv('JWT_SECRET','isolated-test-key-that-is-at-least-32-characters');
 const token='a'.repeat(64),sealed=sealGuarantorToken(token);
 expect(sealed).not.toContain(token);expect(openGuarantorToken(sealed)).toBe(token);
 const tampered=Buffer.from(sealed,'base64');tampered[20]^=1;expect(()=>openGuarantorToken(tampered.toString('base64'))).toThrow();
});
it('does not backdate an execution after its agreed start-date conditions',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-05T23:59:00Z'));expect(()=>ensureExecutionBeforeStart('2026-11-06')).not.toThrow();
 vi.setSystemTime(new Date('2026-11-06T00:00:00Z'));expect(()=>ensureExecutionBeforeStart('2026-11-06')).toThrow(/execution and delivery/);
});

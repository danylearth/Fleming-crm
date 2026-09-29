import {describe,it,expect} from 'vitest';
import {creditReportResult,isValidManualCreditScore} from './credit-report-result';

it('requires a numeric score for manual credit completion even if a rating is supplied',()=>{
 expect(isValidManualCreditScore(creditReportResult({rating:'Good'}).score)).toBe(false);
 for(const value of [null,undefined,'',' ','GOOD',-1,'720.5','1e3',true,{},'9007199254740992']) expect(isValidManualCreditScore(value)).toBe(false);
 for(const value of [0,'0','720',' 720 ']) expect(isValidManualCreditScore(value)).toBe(true);
});
describe('credit report results',()=>{
  it('retains zero CCJs and a negative bankruptcy result without inventing missing data',()=>{
    expect(creditReportResult({reference:'ABC-123',rating:'Good',active_ccjs:0,bankruptcy:false})).toEqual({reference:'ABC-123',rating:'GOOD',active_ccjs:0,bankruptcy:false});
  });
  it('keeps supplied numeric scores separate from rating bands',()=>{
    expect(creditReportResult({rating:'Excellent'},'720')).toEqual({score:'720',rating:'EXCELLENT'});
    expect(creditReportResult({rating:'Poor'})).not.toHaveProperty('score');
  });
  it('rejects malformed and invalid financial results',()=>{
    for(const bad of [{active_ccjs:-1},{active_ccjs:1.5},{bankruptcy:'false'},{rating:'PASS'},{active_ccj_value:'NaN'},[], '{']) expect(()=>creditReportResult(bad)).toThrow();
  });
});

it('keeps actual report dates separate from upload dates',()=>{expect(creditReportResult({report_date:'2025-04-16'})).toEqual({report_date:'2025-04-16'});expect(()=>creditReportResult({report_date:'2025-02-30'})).toThrow('report date');});

import {describe,it,expect} from 'vitest';
import {holdingDepositBank} from './holding-deposit-bank';
import {defaultCompanySettings} from './company-settings-values';
import {holdingDepositRequestEmail} from './email';

const company = {...defaultCompanySettings(),
  operatingAccount:{accountName:'Example Business',bankName:'Business Bank',sortCode:'11-22-33',accountNumber:'11111111'},
  clientAccount:{accountName:'Example Client & Co',bankName:'Client Bank',sortCode:'44-55-66',accountNumber:'22222222'},
};
describe('holding deposit payment instructions',()=>{
  it.each(['let_only','rent_collection','full_management'])('uses client money for external %s properties',()=>{
    const payment=holdingDepositBank('external',company);
    const {html}=holdingDepositRequestEmail('Jamie','19 Example Street, Wolverhampton, WV1 4AT',1500,1500,346,'https://apply.example.test/fictional',payment);
    expect(html).toContain('Fleming Client Money Account');
    expect(html).toContain('Example Client &amp; Co');
    expect(html).toContain('Client Bank');
    expect(html).toContain('44-55-66');
    expect(html).toContain('22222222');
    expect(html).not.toContain('11111111');
    expect(html).toContain('Payment Reference');
    expect(html).toContain('Wolverhampton');
    expect(html).not.toMatch(/\{\{PAYMENT_/);
  });
  it('uses the configured business account for FL-owned properties',()=>{
    const {html}=holdingDepositRequestEmail('Jamie','19 Example Street',1500,1500,346,'https://apply.example.test/fictional',holdingDepositBank('internal',company));
    expect(html).toContain('Fleming Business Account');
    expect(html).toContain('11111111');
    expect(html).not.toContain('22222222');
  });
  it('blocks an unknown owner and incomplete company accounts instead of guessing',()=>{
    expect(()=>holdingDepositBank(null,company)).toThrow('Confirm the linked property owner');
    expect(()=>holdingDepositBank('internal',{...company,operatingAccount:{...company.operatingAccount,accountNumber:''}})).toThrow('Complete the company bank details');
  });
});

import type {CompanySettings} from './company-settings-values';

// Holding deposits always go to Fleming, including Let Only properties.
export function holdingDepositBank(landlordType: string, company: CompanySettings) {
  if (!landlordType) throw new Error('Confirm the linked property owner before requesting a holding deposit');
  const internal = landlordType === 'internal';
  const bank = internal ? company.operatingAccount : company.clientAccount;
  if (!bank?.accountName || !bank.bankName || !/^\d{2}-?\d{2}-?\d{2}$/.test(bank.sortCode) || !/^\d{8}$/.test(bank.accountNumber)) {
    throw new Error('Complete the company bank details before requesting a holding deposit');
  }
  return {...bank, sortCode: bank.sortCode.replace(/^(\d{2})-?(\d{2})-?(\d{2})$/, '$1-$2-$3'), accountLabel: internal ? 'Fleming Business Account' : 'Fleming Client Money Account'};
}

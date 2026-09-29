type Account={accountName:string;bankName:string;sortCode:string;accountNumber:string};

export default function AgreementPaymentAccountSummary({account,ownPortfolio=false}:{account?:Account;ownPortfolio?:boolean}){
 return <div className="border-t border-purple-500/15 pt-3 space-y-2">
  <p>APT agreement confirms that the {ownPortfolio?'initial and future payments':'initial payment'} will be paid to <strong className="font-semibold break-words">{account?.accountName||'Account not supplied'}</strong>.</p>
  <p className="text-xs text-[var(--text-secondary)]">For the holding deposit, security deposit and first month’s rent{ownPortfolio?', plus ongoing rent':''}.</p>
  <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2">{[['Bank',account?.bankName],['Sort Code',account?.sortCode],['Account Number',account?.accountNumber]].map(([label,value])=><div key={label} className="min-w-0"><dt className="text-xs text-[var(--text-secondary)]">{label}</dt><dd className="font-medium break-words">{value||'Not supplied'}</dd></div>)}</dl>
 </div>;
}

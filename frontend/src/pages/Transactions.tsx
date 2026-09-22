import DocumentsSection from '../components/DocumentsSection';
import { rentServiceGroups } from '../utils/rentServices';
import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Button, Card, GlassCard, EmptyState, Select, Input } from '../components/ui';
import { useApi, invalidateCache } from '../hooks/useApi';
import { PoundSterling, TrendingUp, TrendingDown, Home, Landmark, RefreshCw, Clock3 } from 'lucide-react';

interface RentPayment {
  id: number;
  tenant_name?: string;
  address?: string;
  amount_due: number | string;
  amount_paid?: number | string;
  due_date?: string;
  payment_date?: string;
  status?: string; opening_balance_amount?: number; bank_received?:number; bank_payment_date?:string;
}

interface BankFeedStatus {
  configured: boolean;
  connection?: { provider?:string; status: string; provider_name?: string; last_synced_at?: string; last_error?: string } | null;
  totals?: { total: number; rent_matches: number; deposit_matches: number; expense_matches: number; unmatched: number };
}

interface BankFeedTransaction {
  id: number;
  booked_at: string;
  description?: string;
  display_name?: string;
  merchant_name?: string;
  amount: number;
  currency: string;
  match_status: 'unmatched' | 'matched_rent' | 'matched_deposit' | 'matched_expense' | 'ignored';
  allocations?: {kind:string;amount:number;category?:string;notes?:string}[];
  property_address?: string;
  tenant_name?: string;
}

interface Property {
  id: number;
  address: string;
  landlord_type?: string; service_type?: string; active_monthly_rent?: number;
  monthly_rent?: number;
  rent?: number;
  rent_amount?: number;
  status?: string;
}

export default function Transactions() {
  const api = useApi();
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [summary, setSummary] = useState({ monthly_rent: 0, collected: 0, outstanding: 0, active_tenancies: 0, assumed:0,let_only_fee_count:0,let_only_fee_total:0,let_only_fee_month:0 });
  const [bankStatus, setBankStatus] = useState<BankFeedStatus | null>(null);
  const [bankTransactions, setBankTransactions] = useState<BankFeedTransaction[]>([]);
  const [bankBusy, setBankBusy] = useState(false);
  const [bankMessage, setBankMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedBank,setSelectedBank]=useState<BankFeedTransaction|null>(null);
  const [bankFilter,setBankFilter]=useState('unmatched');
  const [transactionName,setTransactionName]=useState(''),[showImportName,setShowImportName]=useState(false);
  const rentCutoff=new Date();rentCutoff.setUTCDate(rentCutoff.getUTCDate()-30);
  const selectablePayments=payments.filter(p=>p.due_date&&p.due_date.slice(0,10)>=rentCutoff.toISOString().slice(0,10)&&p.due_date.slice(0,10)<=new Date().toISOString().slice(0,10)&&(!Number(p.bank_received)||Number(p.amount_paid)<Number(p.amount_due)));
  const renameTransaction=async()=>{if(!selectedBank)return;setBankBusy(true);try{const row=await api.patch(`/api/bank-feed/transactions/${selectedBank.id}/name`,{display_name:transactionName});setSelectedBank({...selectedBank,display_name:row.display_name});await refreshBankData();setBankMessage('Transaction name saved.');}catch(e){setBankMessage(String(e));}finally{setBankBusy(false);}};
  type Allocation={kind:string;amount:string;rent_payment_id:string;tenant_id:string;property_id:string;maintenance_id:string;category:string;notes:string};
  const [allocations,setAllocations]=useState<Allocation[]>([]);
  const [tenants,setTenants]=useState<{id:number;name:string;linked_tenant_id?:number;property_id?:number;tenancy_start_date?:string}[]>([]);
  const [jobs,setJobs]=useState<{id:number;title:string;property_id:number}[]>([]);
  const freshAllocation=(amount=''):Allocation=>({kind:selectedBank&&Number(selectedBank.amount)<0?'expense':'rent',amount,rent_payment_id:'',tenant_id:'',property_id:'',maintenance_id:'',category:'',notes:''});
  const beginAssign=async(transaction:BankFeedTransaction)=>{
    setBankMessage('');setTransactionName(transaction.display_name||transaction.description||'');setShowImportName(false);
    try{const [tenantRows,jobRows]=await Promise.all([api.get('/api/tenants'),api.get('/api/maintenance')]);setTenants(tenantRows);setJobs(jobRows);setSelectedBank(transaction);setAllocations([{...freshAllocation(String(Math.abs(Number(transaction.amount)))),kind:Number(transaction.amount)>0?'rent':'expense'}]);}
    catch(error){setBankMessage(error instanceof Error?error.message:'Could not load allocation options');}
  };
  const reconcile=async(transaction:BankFeedTransaction,action:string)=>{
    setBankBusy(true);setBankMessage('');
    try{await api.post(`/api/bank-feed/transactions/${transaction.id}/reconcile`,{action,allocations});setSelectedBank(null);invalidateCache('/api/rent-payments');invalidateCache('/api/financial-summary');await refreshBankData();const [pay,totals]=await Promise.all([api.get('/api/rent-payments'),api.get('/api/financial-summary')]);setPayments(pay);setSummary(totals);setBankMessage(action==='assign'?'Payment assigned.':action==='unassign'?'Allocation removed. You can assign this payment again.':action==='ignore'?'Transaction ignored.':'Transaction restored.');}
    catch(error){setBankMessage(error instanceof Error?error.message:'Could not save transaction');}
    finally{setBankBusy(false);}
  };
  const setAllocation=(index:number,changes:Partial<Allocation>)=>setAllocations(current=>current.map((a,i)=>i===index?{...a,...changes}:a));


  useEffect(() => {
    const load = async () => {
      try {
        const [pay, prop, ten, feedStatus, feedTransactions] = await Promise.all([
          api.get('/api/rent-payments'),
          api.get('/api/properties'),
          api.get('/api/financial-summary'),
          api.get('/api/bank-feed/status').catch(() => null),
          api.get('/api/bank-feed/transactions?limit=500').catch(() => []),
        ]);
        setPayments(Array.isArray(pay) ? pay : pay?.payments || []);
        setProperties(Array.isArray(prop) ? prop : prop?.properties || []);
        setSummary(ten);
        setBankStatus(feedStatus);
        setBankTransactions(Array.isArray(feedTransactions) ? feedTransactions : []);
      } catch {
        setLoadError('Financial data could not be loaded. Refresh the page to try again.');
      }
      setLoading(false);
    };
    load();
  }, [api]);

  const refreshBankData = async () => {
    const [status, transactions] = await Promise.all([
      api.get(`/api/bank-feed/status?at=${Date.now()}`),
      api.get(`/api/bank-feed/transactions?limit=500&at=${Date.now()}`),
    ]);
    setBankStatus(status);
    setBankTransactions(Array.isArray(transactions) ? transactions : []);
  };

  const connectBank = async () => {
    setBankBusy(true);
    setBankMessage('');
    try {
      const result = await api.post('/api/bank-feed/connect', {});
      window.location.assign(result.url);
    } catch (error) {
      setBankMessage(error instanceof Error ? error.message : 'Could not start the bank connection');
      setBankBusy(false);
    }
  };

  const syncBank = async () => {
    setBankBusy(true);
    setBankMessage('');
    try {
      const result = await api.post(bankStatus?.connection?.provider==='freeagent'?'/api/freeagent/sync':'/api/bank-feed/sync', {});
      setBankMessage(`${result.imported} new transaction${result.imported === 1 ? '' : 's'} imported; ready for review.`);
      await refreshBankData();
    } catch (error) {
      setBankMessage(error instanceof Error ? error.message : 'Bank sync failed');
    } finally {
      setBankBusy(false);
    }
  };

  // Calculate summaries
  const totalMonthlyRent = Number(summary.monthly_rent);
  const collected = Number(summary.collected);
  const outstanding = Number(summary.outstanding);
  const occupiedCount = Math.min(properties.length, Number(summary.active_tenancies));
  const totalCount = properties.length;
  const vacancyRate = (totalCount ? (totalCount - occupiedCount) / totalCount : 0) * 100;
  const vacancyLoss = totalMonthlyRent > 0 && totalCount > 0 ? (totalMonthlyRent / totalCount) * (totalCount - occupiedCount) : 0;
  const paymentDelays = payments
    .filter(payment => payment.due_date && payment.payment_date)
    .map(payment => Math.max(0, Math.round((new Date(payment.payment_date!).getTime() - new Date(payment.due_date!).getTime()) / 86400000)));
  const averageDaysLate = paymentDelays.length ? paymentDelays.reduce((sum, days) => sum + days, 0) / paymentDelays.length : 0;

  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusGroups = rentServiceGroups(properties);
  statusGroups['Let Only Service']={count:Number(summary.let_only_fee_count||0),rent:Number(summary.let_only_fee_total||0)};

  return (
    <Layout title="Administrative & Financials" breadcrumb={[{ label: 'Administrative & Financials' }]}>
      {selectedBank&&<div role="dialog" aria-modal="true" aria-label="Assign bank transaction" className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] p-6 space-y-4">
        <h2 className="text-lg font-semibold">{selectedBank.match_status==='unmatched'?'Assign':'Review'} £{Math.abs(Number(selectedBank.amount)).toFixed(2)}</h2><div className="flex items-end gap-2"><Input className="flex-1" label="Transaction Name" value={transactionName} onChange={setTransactionName}/><Button variant="outline" size="sm" disabled={bankBusy||!transactionName.trim()} onClick={()=>void renameTransaction()}>Save Name</Button></div>{selectedBank.display_name?.trim()&&selectedBank.display_name.trim()!==selectedBank.description?.trim()&&<button className="text-xs rounded-full border border-[var(--border-input)] px-3 py-1.5" onClick={()=>setShowImportName(v=>!v)}>{showImportName?'Hide Import Name':'View Import Name'}</button>}{showImportName&&selectedBank.display_name?.trim()!==selectedBank.description?.trim()&&<p className="text-sm break-words">{selectedBank.description}</p>}
        {selectedBank.match_status!=='unmatched'?<><div className="space-y-2">{selectedBank.allocations?.map((a,i)=><div key={i}><p>{a.kind.replaceAll('_',' ')}{a.category?` · ${a.category}`:''} · £{Number(a.amount).toFixed(2)}</p>{a.notes&&<p className="text-sm whitespace-pre-wrap text-[var(--text-secondary)]">{a.notes}</p>}</div>)}</div><Button disabled={bankBusy} onClick={()=>void reconcile(selectedBank,'unassign')}>Unallocate Payment</Button><p className="text-xs">The original allocation and attached documents stay in the history. You can assign the payment again after removing its current allocation.</p></>:<>

        {allocations.map((a,index)=>{const incoming=Number(selectedBank.amount)>0;const categories:Record<string,string[]>={expense:['Ground Rent','Insurance','Lease Renewal','Management Fee','Other','Service Charge'],maintenance:['Contractors Invoice','Labour','Materials','Other','Refurbishment','Servicing'],financial:['Accountancy Fees','Administration Expenses','Bank Fees','Commission Payment','Council Tax','Marketing Costs','Stamp Duty','Legal & Professional Fees','Office Costs','Other','Refunds',incoming?'Security Deposit Payments In':'Security Deposit Payments Out'],income:['Commission Payment','Interest Received','Other','Tax Rebate']};return <div key={index} className="grid sm:grid-cols-2 gap-3 p-4 rounded-xl border border-[var(--border-input)]">
          <Select label="Payment Type" value={a.kind} onChange={kind=>setAllocation(index,{kind,category:''})} options={(incoming?[{value:'rent',label:'Rent Payment'},{value:'deposit',label:'Security Deposit'},{value:'holding_deposit',label:'Holding Deposit'},{value:'income',label:'Other Money In'},{value:'financial',label:'Administrative & Financials'}]:[{value:'expense',label:'Property Expense'},{value:'maintenance',label:'Maintenance & Repairs'},{value:'financial',label:'Administrative & Financials'}]).sort((a,b)=>a.label.localeCompare(b.label))}/>
          <Input label="Amount (£)" type="currency" value={a.amount} onChange={amount=>setAllocation(index,{amount})}/>
          {categories[a.kind]&&<Select label="Category" value={a.category} onChange={category=>setAllocation(index,{category})} options={[{value:'',label:'Choose category'},...categories[a.kind].map(v=>({value:v,label:v}))]}/>}
          {a.kind==='rent'?<Select className="sm:col-span-2" searchable label="Rent Charge" value={a.rent_payment_id} onChange={rent_payment_id=>setAllocation(index,{rent_payment_id})} options={[{value:'',label:'Choose rent due'},...selectablePayments.map(p=>({value:String(p.id),label:`${p.tenant_name} · ${p.address} · ${p.due_date?.slice(0,10)} · £${Number(p.amount_due).toFixed(2)}`}))]}/>:a.kind==='deposit'?<Select label="Tenant" searchable value={a.tenant_id} onChange={tenant_id=>setAllocation(index,{tenant_id})} options={[{value:'',label:'Choose tenant'},...tenants.map(t=>({value:String(t.id),label:[t.name,tenants.find(j=>j.id===t.linked_tenant_id&&j.property_id===t.property_id&&j.tenancy_start_date===t.tenancy_start_date)?.name].filter(Boolean).join(' & ')}))]}/>:<Select className="sm:col-span-2" label={['financial','income'].includes(a.kind)?'Property (optional)':'Property'} searchable value={a.property_id} onChange={property_id=>setAllocation(index,{property_id,maintenance_id:''})} options={[{value:'',label:'Choose property'},...properties.map(p=>({value:String(p.id),label:p.address}))]}/>}
          {a.kind==='maintenance'&&<Select className="sm:col-span-2" label="Maintenance Task (optional)" value={a.maintenance_id} onChange={maintenance_id=>setAllocation(index,{maintenance_id})} options={[{value:'',label:'No linked task'},...jobs.filter(j=>String(j.property_id)===a.property_id).map(j=>({value:String(j.id),label:j.title}))]}/>}
          <label className="text-sm sm:col-span-2">Notes<textarea className="block w-full mt-2 p-3 rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)]" rows={2} value={a.notes} onChange={e=>setAllocation(index,{notes:e.target.value})}/></label>
          {allocations.length>1&&<button className="text-sm underline" onClick={()=>setAllocations(current=>current.filter((_,i)=>i!==index))}>Remove Allocation</button>}</div>})}
        <div className="flex justify-between"><Button size="sm" variant="outline" onClick={()=>setAllocations(current=>[...current,freshAllocation()])}>Split Payment</Button><p className="text-sm">Remaining: £{(Math.abs(Number(selectedBank.amount))-allocations.reduce((sum,a)=>sum+Number(a.amount||0),0)).toFixed(2)}</p></div></>}
        <DocumentsSection entityType="bank_transaction" entityId={selectedBank.id} title="Related Documents" compact/>
        {bankMessage&&<p role="alert" className="text-red-500">{bankMessage}</p>}<div className="flex justify-end gap-3"><Button disabled={bankBusy} variant="ghost" onClick={()=>setSelectedBank(null)}>Cancel</Button>{selectedBank.match_status==='unmatched'&&<Button disabled={bankBusy} onClick={()=>void reconcile(selectedBank,'assign')}>Save Assignment</Button>}</div>
      </div></div>}
      <div className="p-4 md:p-8">
        {loadError ? <p role="alert" className="text-red-400 py-8">{loadError}</p> : loading ? (
          <div className="text-center text-[var(--text-muted)] py-16">Loading...</div>
        ) : (
          <>
            <Card className="p-5 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0"><Landmark size={20} /></div>
                  <div>
                    <h3 className="font-semibold">Barclays bank feed</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {!bankStatus?.configured && bankStatus?.connection?.status!=='connected'
                        ? 'Waiting for Open Banking provider credentials.'
                        : bankStatus.connection?.status === 'connected'
                          ? `Connected${bankStatus.connection.provider_name ? ` via ${bankStatus.connection.provider_name}` : ''}${bankStatus.connection.last_synced_at ? ` · last synced ${new Date(bankStatus.connection.last_synced_at).toLocaleString('en-GB')}` : ''}`
                          : 'Ready to connect and approve access in Barclays.'}
                    </p>
                    {bankMessage && <p className="text-xs text-orange-400 mt-2">{bankMessage}</p>}
                    {bankStatus?.connection?.last_error && <p className="text-xs text-red-400 mt-2">{bankStatus.connection.last_error}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {bankStatus?.connection?.status === 'connected' ? (
                    <Button variant="outline" size="sm" onClick={syncBank} disabled={bankBusy} className="gap-2"><RefreshCw size={14} className={bankBusy ? 'animate-spin' : ''} /> Sync now</Button>
                  ) : (
                    <Button variant="gradient" size="sm" onClick={connectBank} disabled={bankBusy || !bankStatus?.configured}>Connect Barclays</Button>
                  )}
                </div>
              </div>
              {bankStatus?.totals && bankStatus.totals.total > 0 && (
                <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-[var(--border-subtle)] text-center">
                  <div><p className="font-semibold">{bankStatus.totals.rent_matches}</p><p className="text-[11px] text-[var(--text-muted)]">Rent matched</p></div>
                  <div><p className="font-semibold">{bankStatus.totals.deposit_matches}</p><p className="text-[11px] text-[var(--text-muted)]">Deposits matched</p></div>
                  <div><p className="font-semibold">{bankStatus.totals.expense_matches}</p><p className="text-[11px] text-[var(--text-muted)]">Expenses matched</p></div>
                  <div><p className="font-semibold">{bankStatus.totals.unmatched}</p><p className="text-[11px] text-[var(--text-muted)]">Needs review</p></div>
                </div>
              )}
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-8">
              {[
                { label: 'Total Monthly Rent', value: fmt(totalMonthlyRent), icon: <PoundSterling size={20} />, color: 'from-blue-500 to-blue-600' },
                { label: 'Collected This Month', value: fmt(collected), icon: <TrendingUp size={20} />, color: 'from-emerald-500 to-emerald-600' },
                { label: 'Outstanding This Month', value: fmt(outstanding > 0 ? outstanding : 0), icon: <TrendingDown size={20} />, color: 'from-amber-500 to-orange-500' },
                { label: 'Vacancy Loss', value: fmt(vacancyLoss), icon: <Home size={20} />, color: 'from-red-500 to-pink-500' },
                { label: 'Average Lateness', value: `${averageDaysLate.toFixed(1)} days`, icon: <Clock3 size={20} />, color: 'from-violet-500 to-purple-600' },
              ].map(card => (
                <GlassCard key={card.label} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">{card.label}</span>
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                      {card.icon}
                    </div>
                  </div>
                  <p className="text-2xl font-bold">{card.value}</p>
                </GlassCard>
              ))}
            </div>


            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Rent Payments Table */}
              <Card className="p-5">
                <details open><summary className="text-lg font-semibold mb-4 cursor-pointer">Recent Bank-linked Rent Payments</summary>
                {payments.filter(p=>Number(p.bank_received)>0&&p.bank_payment_date&&new Date(p.bank_payment_date).getTime()>=Date.now()-30*86400000).length === 0 ? (
                  <EmptyState message="No payment records yet" icon={<PoundSterling size={24} />} />
                ) : (
                  <div className="overflow-auto max-h-72">
                    <div className="min-w-[400px] space-y-1">
                    <div className="grid grid-cols-[1fr_1.4fr_0.8fr_1fr] gap-3 text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider pb-2 border-b border-[var(--border-subtle)]">
                      <span>Tenant</span><span>Property</span><span className="text-right">Amount</span><span className="text-right">Date</span>
                    </div>
                    {payments.filter(p=>Number(p.bank_received)>0&&p.bank_payment_date&&new Date(p.bank_payment_date).getTime()>=Date.now()-30*86400000).sort((a,b)=>String(b.bank_payment_date).localeCompare(String(a.bank_payment_date))).map(p => (
                      <div key={p.id} className="grid grid-cols-[1fr_1.4fr_0.8fr_1fr] gap-3 py-2.5 border-b border-[var(--border-subtle)] text-sm">
                        <span>{p.tenant_name || '—'}</span>
                        <span className="whitespace-normal break-words text-[var(--text-secondary)]">{p.address || '—'}</span>
                        <span className="text-right font-medium text-emerald-400">{fmt(Number(p.bank_received || 0))}</span>
                        <span className="text-right text-[var(--text-muted)]">{p.bank_payment_date ? new Date(p.bank_payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short',year:'numeric' }) : Number(p.amount_paid || 0) > 0 ? 'Not recorded' : 'Unpaid'}</span>
                      </div>
                    ))}
                    </div>
                  </div>
                )}</details>
              </Card>

              {/* Property Rent Breakdown */}
              <Card className="p-5">
                <h3 className="text-lg font-semibold mb-4">Service Income & Rent</h3><p className="text-xs text-[var(--text-muted)] mb-4">Let Only shows agreed fees earned after the agreement is signed and the initial balance is received. Other services show monthly rents, excluding Fleming-owned properties.</p>
                {Object.keys(statusGroups).length === 0 ? (
                  <EmptyState message="No property data available" icon={<Home size={24} />} />
                ) : (
                  <div className="space-y-3">
                    {Object.entries(statusGroups).map(([status, data]) => (
                      <div key={status} className="flex items-center justify-between p-3 bg-[var(--bg-subtle)] rounded-xl">
                        <div>
                          <p className="text-sm font-medium capitalize">{status.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-[var(--text-muted)]">{data.count} propert{data.count !== 1 ? 'ies' : 'y'}</p>
                        </div>
                        <div className="text-right"><p className="text-sm font-semibold">{fmt(data.rent)}<span className="text-[var(--text-muted)] text-xs">{status==='Let Only Service'?' earned':'/mo'}</span></p>{status==='Let Only Service'&&<p className="text-xs text-[var(--text-muted)]">{fmt(Number(summary.let_only_fee_month||0))} this month</p>}</div>
                      </div>
                    ))}
                    {/* Total */}
                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-orange-500/10 to-pink-500/10 rounded-xl border border-orange-500/20">
                      <p className="text-sm font-semibold">Portfolio Turnover (monthly total)</p>
                      <p className="text-sm font-bold">{fmt(totalMonthlyRent)}<span className="text-[var(--text-muted)] text-xs">/mo</span></p>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {bankTransactions.length > 0 && (
              <Card className="p-5 mt-6">
                <div className="flex flex-wrap justify-between items-start gap-3"><h3 className="text-lg font-semibold">Bank Transactions</h3><Select className="w-56 mb-4" label="Show Transactions" value={bankFilter} onChange={setBankFilter} options={[{value:"unmatched",label:"Needs Review"},{value:"all",label:"All Transactions"},{value:"ignored",label:"Ignored"}]}/></div><p className="text-sm text-[var(--text-muted)] mb-3">Transactions are imported daily into your Administrative & Financials view. Please remember that all rent reminders need to be sent manually from tenant(s) records.</p>
                <div className="overflow-x-auto">
                  <div className="min-w-[620px]">
                    <div className="grid grid-cols-[100px_1fr_120px_200px] gap-3 text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider pb-2 border-b border-[var(--border-subtle)]">
                      <span>Date</span><span>Description</span><span className="text-right">Amount</span><span>Action</span>
                    </div>
                    {bankTransactions.filter(t=>bankFilter==='all'||t.match_status===(bankFilter==='unmatched'?'unmatched':bankFilter)).map(transaction => (
                      <div key={transaction.id} className="grid grid-cols-[100px_1fr_120px_200px] gap-3 py-2.5 border-b border-[var(--border-subtle)] text-sm items-center">
                        <span className="text-[var(--text-muted)]">{new Date(transaction.booked_at).toLocaleDateString('en-GB')}</span>
                        <span className="truncate">{transaction.display_name || transaction.description || transaction.merchant_name || 'Bank transaction'}</span>
                        <span className={`text-right font-medium ${Number(transaction.amount) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{Number(transaction.amount) >= 0 ? '+' : '-'}{fmt(Math.abs(Number(transaction.amount)))}</span>
                        <div className="text-xs">{transaction.match_status==='unmatched'?<div className="flex gap-2"><Button size="sm" disabled={bankBusy} onClick={()=>void beginAssign(transaction)}>Assign</Button><Button size="sm" variant="outline" className="!bg-red-500/10 !text-red-600 !border-red-500/20 rounded-full" disabled={bankBusy} onClick={()=>void reconcile(transaction,'ignore')}>Ignore</Button></div>:transaction.match_status==='ignored'?<div>Ignored <button className="underline ml-2" disabled={bankBusy} onClick={()=>void reconcile(transaction,'restore')}>Undo</button></div>:<span>{transaction.allocations?.map(a=>`${a.kind} £${Number(a.amount).toFixed(2)}`).join(' + ') || transaction.match_status.replace('matched_','')} · {transaction.tenant_name || transaction.property_address}<button className="block underline mt-2" onClick={()=>void beginAssign(transaction)}>View / Edit</button></span>}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Vacancy info */}
            <GlassCard className="mt-6 p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-semibold mb-1">Vacancy Rate</h3>
                  <p className="text-xs text-[var(--text-muted)]">{totalCount - occupiedCount} of {totalCount} properties vacant</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 sm:w-48 h-2 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-orange-500 to-pink-500 rounded-full transition-all" style={{ width: `${100 - vacancyRate}%` }} />
                  </div>
                  <span className="text-sm font-bold">{(100 - vacancyRate).toFixed(0)}%</span>
                  <span className="text-xs text-[var(--text-muted)]">occupied</span>
                </div>
              </div>
            </GlassCard>
          </>
        )}
      </div>
    </Layout>
  );
}

export default function DeliveryChoices({email,sms,onEmail,onSms,previewEmail,previewSms}:{email:boolean;sms:boolean;onEmail:(value:boolean)=>void;onSms:(value:boolean)=>void;previewEmail:()=>void;previewSms:()=>void}) {
  const previewClass = 'delivery-preview shrink-0 rounded-full border border-transparent bg-[#7e2275] px-2.5 py-1.5 text-sm font-medium text-white hover:bg-[#681c61] disabled:bg-[var(--bg-hover)] disabled:text-[var(--text-muted)] disabled:border-[var(--border-input)] disabled:cursor-not-allowed';
  return <div className="delivery-choices space-y-2 w-full">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <label className="flex items-center gap-2 rounded-lg bg-[var(--bg-subtle)] px-2 py-2 text-sm cursor-pointer"><input type="checkbox" checked={email} onChange={e=>onEmail(e.target.checked)}/>Send Email</label>
      <button type="button" aria-label="Preview Email" disabled={!email} className={previewClass} onClick={previewEmail}>Preview</button>
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <label className="flex items-center gap-2 rounded-lg bg-[var(--bg-subtle)] px-2 py-2 text-sm cursor-pointer"><input type="checkbox" checked={sms} onChange={e=>onSms(e.target.checked)}/>Send SMS</label>
      <button type="button" aria-label="Preview SMS" disabled={!sms} className={previewClass} onClick={previewSms}>Preview</button>
    </div>
  </div>;
}


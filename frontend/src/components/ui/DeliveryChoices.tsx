export default function DeliveryChoices({email,sms,onEmail,onSms,previewEmail,previewSms,disabled=false}:{email:boolean;sms:boolean;onEmail:(value:boolean)=>void;onSms:(value:boolean)=>void;previewEmail:()=>void;previewSms:()=>void;disabled?:boolean}) {
  const previewClass = 'delivery-preview inline-flex h-10 items-center justify-center shrink-0 rounded-full border border-transparent bg-[#7e2275] px-2.5 py-1.5 text-sm font-medium text-white hover:bg-[#681c61] disabled:bg-[var(--bg-hover)] disabled:text-[var(--text-muted)] disabled:border-[var(--border-input)] disabled:cursor-not-allowed';
  return <div className="delivery-choices space-y-2 w-full">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <label className="flex h-10 whitespace-nowrap items-center gap-2 rounded-lg bg-[var(--bg-subtle)] px-2 py-2 text-sm cursor-pointer"><input type="checkbox" disabled={disabled} checked={email} onChange={e=>onEmail(e.target.checked)}/>Send Email</label>
      <button type="button" aria-label="Preview Email" disabled={disabled||!email} className={previewClass} onClick={previewEmail}>Preview</button>
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <label className="flex h-10 whitespace-nowrap items-center gap-2 rounded-lg bg-[var(--bg-subtle)] px-2 py-2 text-sm cursor-pointer"><input type="checkbox" disabled={disabled} checked={sms} onChange={e=>onSms(e.target.checked)}/>Send SMS</label>
      <button type="button" aria-label="Preview SMS" disabled={disabled||!sms} className={previewClass} onClick={previewSms}>Preview</button>
    </div>
  </div>;
}


export function invoiceHeading(doc: {number:string; created_at:string; snapshot:{date?:string;period_start?:string;period_end?:string}}) {
  const format = (date?:string) => {
    const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
  };
  const start = format(doc.snapshot.period_start), end = format(doc.snapshot.period_end);
  const period = start && end ? `Rental Period: ${start} - ${end}` : format(doc.snapshot.date || doc.created_at);
  return period ? `${period} | ${doc.number}` : doc.number;
}

export function invoiceDescription(snapshot: {description:string;period_start?:string;period_end?:string}) {
  if (!snapshot.period_start || !snapshot.period_end) return snapshot.description;
  return snapshot.description.replace(/^Rental period:[^\r\n]*(?:\r?\n|$)/gmi, '').trim();
}

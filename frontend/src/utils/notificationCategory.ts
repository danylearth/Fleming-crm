export type NotificationCategory='landlord'|'tenant'|'maintenance'|'property'|'compliance'|'finance'|'general';
export function notificationCategory(item:{title:string;href:string}):NotificationCategory {
 const title=item.title.toLowerCase(),href=item.href;
 if(/maintenance|repair/.test(title)||href.startsWith('/maintenance'))return 'maintenance';
 if(/\b(epc|eicr|gas safety|compliance)\b/.test(title))return 'compliance';
 if(/\b(invoice|payment|rent arrears)\b/.test(title)||href.startsWith('/financials'))return 'finance';
 if(/landlord|service contract/.test(title)||href.startsWith('/landlords')||href.startsWith('/landlord-enquiries'))return 'landlord';
 if(/tenant|tenancy|application/.test(title)||href.startsWith('/tenants')||href.startsWith('/enquiries'))return 'tenant';
 if(href.startsWith('/properties'))return 'property';
 return 'general';
}

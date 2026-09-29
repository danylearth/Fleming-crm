import {it,expect} from 'vitest';
import {invoiceHeading,invoiceDescription} from './invoiceHeading';
it('uses saved rental period rather than generation date',()=>{
 expect(invoiceHeading({number:'INV00193',created_at:'2026-09-28T11:00:00Z',snapshot:{date:'2026-09-21',period_start:'2026-09-21',period_end:'2026-10-20'}})).toBe('Rental Period: 21/09/2026 - 20/10/2026 | INV00193');
 expect(invoiceDescription({description:'Monthly rent for Example Road\n\nRental period: 21 September 2026 to 20 October 2026',period_start:'2026-09-21',period_end:'2026-10-20'})).toBe('Monthly rent for Example Road');
});
it('uses invoice date when a legacy invoice has no saved rental period',()=>{
 expect(invoiceHeading({number:'INV00193',created_at:'2026-09-28',snapshot:{date:'2026-09-21'}})).toBe('21/09/2026 | INV00193');
 expect(invoiceDescription({description:'Monthly rent\nRental period: September 2026'})).toBe('Monthly rent\nRental period: September 2026');
});

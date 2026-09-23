import {it,expect} from 'vitest';
import {vacancyLoss,type VacancyTenant} from './vacancy-loss';
const p={id:1,address:'Test',rent_amount:310};
const t=(start:string,end:string|null,status='inactive'):VacancyTenant=>({property_id:1,tenancy_start_date:start,tenancy_end_date:end,status,has_end_date:end?1:0});
it('counts the vacant days, excluding the old end day and new start day, once for joint tenants',()=>{
 const result=vacancyLoss([p],[t('2026-01-01','2026-01-10'),t('2026-01-01','2026-01-10'),t('2026-01-21',null,'active')],[], '2026-02-01');
 expect(result.total).toBe(100);expect(result.periods[0]).toMatchObject({from:'2026-01-11',through:'2026-01-20',days:10});
});
it('includes actual vacancy costs, prorates coverage and excludes estimates/deposits/occupied dates',()=>{
 const expenses=[{amount:50,category:'Marketing Costs',expense_date:'2026-01-12'},{amount:310,category:'Council Tax',expense_date:'2026-02-01',coverage_start:'2026-01-01',coverage_end:'2026-01-31'},{amount:999,category:'Utilities',expense_date:'2026-01-12',is_estimate:true},{amount:999,category:'Utilities',expense_date:'2026-01-22'},{amount:999,category:'Security Deposit Payments Out',expense_date:'2026-01-12'}].map(e=>({...e,property_id:1}));
 expect(vacancyLoss([p],[t('2026-01-01','2026-01-10'),t('2026-01-21',null,'active')],expenses,'2026-02-01').periods[0]).toMatchObject({rent:100,costs:150,total:250});
});
it('caps current vacancies at today, includes today and does not assume vacancy before first tenancy',()=>{
 expect(vacancyLoss([p],[t('2026-01-01','2026-01-10')],[],'2026-01-12').total).toBe(20);
 expect(vacancyLoss([p],[t('2026-01-21',null,'active')],[],'2026-01-30').total).toBe(0);
 expect(vacancyLoss([p],[],[],'2026-01-30').missing_dates).toHaveLength(1);
});
it('uses actual month lengths and handles continuous/overlapping tenancies without loss',()=>{
 expect(vacancyLoss([p],[t('2026-01-01','2026-01-31'),t('2026-03-01',null,'active')],[],'2026-03-05').total).toBe(310);
 expect(vacancyLoss([p],[t('2026-01-01','2026-01-20'),t('2026-01-15',null,'active')],[],'2026-03-05').total).toBe(0);
});

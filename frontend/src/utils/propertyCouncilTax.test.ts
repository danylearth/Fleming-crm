import {describe,it,expect} from 'vitest';
import {matchedCouncilTaxBand} from './propertyCouncilTax';
const property={address:'1 Example Road',city:'Wolverhampton',postcode:'WV1 1AA'};
describe('property council tax address matching',()=>{
 it('matches the address rather than the first postcode result',()=>expect(matchedCouncilTaxBand([{address:'10 Example Road',band:'F'},{address:'1 EXAMPLE ROAD, WOLVERHAMPTON, WV1 1AA',band:'c'}],property)).toBe('C'));
 it('does not confuse another house or flat',()=>{expect(matchedCouncilTaxBand([{address:'10 Example Road',band:'F'}],property)).toBeNull();expect(matchedCouncilTaxBand([{address:'1 Example Road',band:'C'}],{...property,address_line_2:'Flat 2'})).toBeNull();});
 it('does not choose an ambiguous result',()=>expect(matchedCouncilTaxBand([{address:'1 Example Road',band:'C'},{address:'1 Example Road',band:'D'}],property)).toBeNull());
 it('leaves missing and malformed responses unset',()=>{for(const rows of [null,{},[],[{address:'1 Example Road',band:'Z'}]])expect(matchedCouncilTaxBand(rows,property)).toBeNull();});
});

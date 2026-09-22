import {it,expect} from 'vitest';
import {normaliseUkPhone,validUkPhone} from './phone';
it('normalises UK mobile and landline formats without changing an international number',()=>{
 for(const v of ['07700 900123','0044 7700 900123','447700900123','+44 7700 900123'])expect(normaliseUkPhone(v)).toBe('+447700900123');
 expect(validUkPhone('01902 212415')).toBe(true);expect(normaliseUkPhone('+353 83 850 7485')).toBe('+353838507485');
});
it('rejects missing, incomplete and non-UK numbers for required UK fields',()=>{
 for(const v of ['', '+44', '07700', '+353838507485','abc','+4407700900123'])expect(validUkPhone(v)).toBe(false);
});

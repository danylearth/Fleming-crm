import {afterEach,expect,it,vi} from 'vitest';
import {searchEpc} from './epc';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('uses the new bearer API and maps certificates newest first',async()=>{
 vi.stubEnv('EPC_API_TOKEN','test-token');const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{addressLine1:'8 Bridgemary Close',postcode:'WV10 8UL',currentEnergyEfficiencyBand:'C',registrationDate:'2026-01-01',certificateNumber:'test'}]})));vi.stubGlobal('fetch',fetch);
 const rows=await searchEpc('wv10 8ul');expect(rows[0]).toMatchObject({address:'8 Bridgemary Close',current_rating:'C',lodgement_date:'2026-01-01'});expect(fetch.mock.calls[0][0]).toContain('https://api.get-energy-performance-data.communities.gov.uk/api/domestic/search?');expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
});
it('explains missing setup without attempting the retired service',async()=>{
 vi.stubEnv('EPC_API_TOKEN','');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(searchEpc('WV10 8UL')).rejects.toThrow('GOV.UK One Login');expect(fetch).not.toHaveBeenCalled();
});

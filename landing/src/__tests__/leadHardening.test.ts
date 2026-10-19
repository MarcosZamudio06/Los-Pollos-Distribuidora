import { afterEach, expect, it, vi } from 'vitest';
import { getCommercialConfig } from '../config/commercialConfig';
import { submitDemoRequest } from '../services/demoRequest';
const lead = { name:'Synthetic', company:'Synthetic', email:'lead@example.test', message:'', website:'', consent:true };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('requires explicit production consent version even with both public URLs', async () => {
 vi.stubEnv('DEV',false); vi.stubEnv('VITE_LANDING_LEAD_ENDPOINT','https://receiver.example.test/leads'); vi.stubEnv('VITE_LANDING_PRIVACY_URL','https://landing.example.test/privacy');
 const fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
 for(const version of ['', ' ', 'bad version']) { vi.stubEnv('VITE_LANDING_PRIVACY_VERSION',version); expect(getCommercialConfig().canSubmit).toBe(false); await expect(submitDemoRequest(lead,'https://receiver.example.test/leads')).rejects.toThrow(); }
 expect(fetch).not.toHaveBeenCalled();
 vi.stubEnv('VITE_LANDING_PRIVACY_VERSION','explicit-v2'); expect(getCommercialConfig().canSubmit).toBe(true);
 await expect(submitDemoRequest(lead,'https://receiver.example.test/leads',undefined,'old-version')).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
});
it('provides an actionable rate-limit failure without accepting or exposing request data', async () => {
 vi.stubEnv('VITE_LANDING_PRIVACY_VERSION','explicit-v2');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ status:429, ok:false }));
 await expect(submitDemoRequest(lead,'https://receiver.example.test/leads')).rejects.toThrow(/Demasiadas solicitudes/);
});

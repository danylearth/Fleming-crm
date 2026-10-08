import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { usePortfolio } from './PortfolioContext';
import { useApi } from '../hooks/useApi';
import { portfolioMatcher, type PortfolioRecord, type LinkedTask } from '../utils/dashboardPortfolio';

const empty = { properties: [], tenants: [], landlords: [], enquiries: [], maintenance: [], tasks: [] };
type Records = { properties: PortfolioRecord[]; tenants: PortfolioRecord[]; landlords: PortfolioRecord[]; enquiries: PortfolioRecord[]; maintenance: PortfolioRecord[]; tasks: (LinkedTask & {id:number})[] };
const ScopeContext = createContext({ records: empty as Records, ready: true, error: '', scope: portfolioMatcher(empty, 'all') });

export function PortfolioScopeProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { portfolioFilter } = usePortfolio();
  const api = useApi();
  const [loaded, setLoaded] = useState<{api: typeof api; records: Records} | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!token || portfolioFilter === 'all') return;
    let active = true;
    const getAll = async (endpoint: string) => {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await api.get(`${endpoint}?limit=1000&offset=${offset}`);
        if (!Array.isArray(page)) throw new Error('Portfolio records could not be loaded.');
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
    };
    Promise.all(['/api/properties','/api/tenants','/api/landlords','/api/tenant-enquiries','/api/maintenance','/api/tasks'].map(getAll))
      .then(([properties,tenants,landlords,enquiries,maintenance,tasks]) => {
        if (active) { setLoaded({api,records:{properties,tenants,landlords,enquiries,maintenance,tasks}}); setError(''); }
      }).catch(() => { if (active) setError('Portfolio records could not be loaded. Refresh to try again.'); });
    return () => { active = false; };
  }, [api, token, portfolioFilter]);
  const records = loaded?.api === api ? loaded.records : empty;
  const scope = useMemo(() => portfolioMatcher(records, portfolioFilter), [records, portfolioFilter]);
  return <ScopeContext.Provider value={{records,scope,ready:portfolioFilter === 'all' || loaded?.api === api,error}}>{children}</ScopeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const usePortfolioScope = () => useContext(ScopeContext);

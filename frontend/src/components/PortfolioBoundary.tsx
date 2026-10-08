import { Navigate, useLocation } from 'react-router-dom';
import { usePortfolio } from '../context/PortfolioContext';
import { usePortfolioScope } from '../context/PortfolioScope';

export default function PortfolioBoundary({children}:{children:React.ReactNode}) {
  const {portfolioFilter,setPortfolioFilter} = usePortfolio();
  const {scope,records,ready,error} = usePortfolioScope();
  const {pathname} = useLocation();
  if (portfolioFilter === 'all') return <>{children}</>;
  if (portfolioFilter === 'internal' && /^\/(landlords|landlord-enquiries|bdm)(\/|$)/.test(pathname)) return <Navigate to="/properties" replace/>;
  if (!ready) return <p className="p-8 text-sm" role="status">{error || 'Loading portfolio…'}</p>;
  const match = pathname.match(/^\/(properties|tenants|enquiries|landlords|maintenance|tasks)\/(\d+)(?:-[^/]+)?(?:\/|$)/);
  if (match) {
    const id = Number(match[2]);
    const allowed = match[1] === 'properties' ? scope.property(id) : match[1] === 'tenants' ? scope.tenant(id) : match[1] === 'enquiries' ? scope.enquiry(id) : match[1] === 'landlords' ? scope.landlord(id) : match[1] === 'maintenance' ? scope.maintenance(id) : records.tasks.some(t=>t.id===id&&scope.task(t));
    if (!allowed) return <div className="p-8"><p className="mb-4">This record is outside the selected portfolio.</p><button className="rounded-full px-4 py-2 bg-[var(--accent-orange)] text-white" onClick={()=>setPortfolioFilter('all')}>Show in All</button></div>;
  }
  return <>{children}</>;
}

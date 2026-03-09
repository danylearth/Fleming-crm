import { createContext, useContext, useState, type ReactNode } from 'react';

type PortfolioFilter = 'all' | 'internal' | 'external';

interface PortfolioContextType {
    portfolioFilter: PortfolioFilter;
    setPortfolioFilter: (f: PortfolioFilter) => void;
}

const PortfolioContext = createContext<PortfolioContextType>({
    portfolioFilter: 'all',
    setPortfolioFilter: () => { },
});

export function PortfolioProvider({ children }: { children: ReactNode }) {
    const [portfolioFilter, setPortfolioFilter] = useState<PortfolioFilter>('all');
    return (
        <PortfolioContext.Provider value={{ portfolioFilter, setPortfolioFilter }}>
            {children}
        </PortfolioContext.Provider>
    );
}

export function usePortfolio() {
    return useContext(PortfolioContext);
}

// Helper: filter any array by landlord_type field
export function filterByPortfolio<T extends { landlord_type?: string }>(items: T[], filter: PortfolioFilter): T[] {
    if (filter === 'all') return items;
    return items.filter(item => item.landlord_type === filter);
}

// Badge component for portfolio type
export function PortfolioBadge({ type }: { type?: string }) {
    if (!type) return null;
    const isInternal = type === 'internal';
    return (
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${isInternal
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
            }`}>
            {isInternal ? 'Fleming Owned' : 'Lettings Client'}
        </span>
    );
}

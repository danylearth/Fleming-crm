import { useState } from 'react';
import { useGovernmentAPIs } from '../../hooks/useGovernmentAPIs';
import { Card, Button } from './index';
import { PoundSterling, ArrowUpRight, TrendingUp, Calendar, Home, Loader2, AlertCircle, X } from 'lucide-react';

interface PricePaidDataProps {
  postcode: string;
}

export default function PricePaidData({ postcode }: PricePaidDataProps) {
  const [showData, setShowData] = useState(false);
  const [priceData, setPriceData] = useState<{ address: string; price: number; date: string; property_type?: string; estate_type?: string }[]>([]);
  const { loading, error, fetchPricePaid } = useGovernmentAPIs();

  const loadPriceData = async () => {
    if (!postcode) return;
    const data = await fetchPricePaid(postcode);
    setPriceData(data);
    setShowData(true);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 0
    }).format(price);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const calculateAveragePrice = () => {
    if (priceData.length === 0) return 0;
    const total = priceData.reduce((sum, item) => sum + item.price, 0);
    return total / priceData.length;
  };

  const getRecentSales = () => {
    return priceData
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  };

  if (!showData) {
    return (
      <Card className="h-full flex flex-col">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-start p-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 shrink-0 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Land Registry Price Data</h3>
            </div>
          </div>
          <Button
            className="self-start h-9 !px-3 !text-xs shrink-0 justify-center whitespace-nowrap"
            onClick={loadPriceData}
            variant="outline"
            disabled={loading || !postcode}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              <>
                <ArrowUpRight className="w-4 h-4 mr-2" aria-hidden="true" />
                View Price Data
              </>
            )}
          </Button>
          <p className="col-span-2 text-sm text-[var(--text-muted)]">View recent sales in this area</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="p-6">
          <div className="flex items-center gap-3 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <p>Failed to load price data: {error}</p><Button variant="outline" onClick={loadPriceData} disabled={loading}>Try Again</Button>
          </div>
        </div>
      </Card>
    );
  }

  const averagePrice = calculateAveragePrice();
  const recentSales = getRecentSales();

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card>
        <div className="p-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-start mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Land Registry Price Data</h3>
              </div>
            </div>
            <Button onClick={() => setShowData(false)} variant="outline" className="self-start h-9 !px-3 !text-xs shrink-0 justify-center whitespace-nowrap">
              <X className="w-4 h-4 mr-2" aria-hidden="true" />Close
            </Button>
            <p className="col-span-2 text-sm text-[var(--text-muted)]">{priceData.length} recent transactions found</p>
          </div>

          {priceData.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-4">
              <div className="bg-gradient-to-br from-navy-50 to-navy-100/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-navy-600 mb-2">
                  <PoundSterling className="w-4 h-4" />
                  <span className="text-sm font-medium">Average Price</span>
                </div>
                <p className="text-2xl font-bold text-navy-900">{formatPrice(averagePrice)}</p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-emerald-600 mb-2">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm font-medium">Highest Price</span>
                </div>
                <p className="text-2xl font-bold text-emerald-900">
                  {formatPrice(Math.max(...priceData.map(d => d.price)))}
                </p>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-blue-600 mb-2">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-medium">Most Recent</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">
                  {formatDate(recentSales[0]?.date)}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Recent Sales List */}
      {recentSales.length > 0 && (
        <Card>
          <div className="p-6">
            <h4 className="text-base font-semibold text-[var(--text-primary)] mb-3">Recent Sales</h4>
            <div className="space-y-2">
              {recentSales.map((sale, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 bg-[var(--bg-subtle)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 shrink-0 rounded-lg bg-navy-100 flex items-center justify-center">
                      <Home className="w-4 h-4 text-navy-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] break-words">{sale.address}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-secondary)] mt-0.5">
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Calendar className="w-3 h-3" />
                          {formatDate(sale.date)}
                        </span>
                        {sale.property_type && (
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <Home className="w-3 h-3" />
                            {sale.property_type}
                          </span>
                        )}
                        {sale.estate_type && (
                          <span className="text-[10px] leading-4 bg-navy-100 text-navy-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            {sale.estate_type}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-[var(--feedback-emerald)] whitespace-nowrap">{formatPrice(sale.price)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {priceData.length === 0 && (
        <Card>
          <div className="p-6 text-center text-gray-500">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No price paid data found for this postcode</p>
          </div>
        </Card>
      )}
    </div>
  );
}

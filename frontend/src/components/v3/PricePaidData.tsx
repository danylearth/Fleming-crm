import { useState, useEffect } from 'react';
import { useGovernmentAPIs } from '../../hooks/useGovernmentAPIs';
import { Card, Button } from './index';
import { PoundSterling, TrendingUp, Calendar, Home, Loader2, AlertCircle } from 'lucide-react';

interface PricePaidDataProps {
  postcode: string;
}

export default function PricePaidData({ postcode }: PricePaidDataProps) {
  const [showData, setShowData] = useState(false);
  const [priceData, setPriceData] = useState<any[]>([]);
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
      <Card>
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-navy-900">Land Registry Price Data</h3>
              <p className="text-sm text-gray-500">View recent sales in this area</p>
            </div>
          </div>
          <Button
            onClick={loadPriceData}
            variant="secondary"
            disabled={loading || !postcode}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                View Price Data
              </>
            )}
          </Button>
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
            <p>Failed to load price data: {error}</p>
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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-navy-900">Land Registry Price Data</h3>
                <p className="text-sm text-gray-500">{priceData.length} recent transactions found</p>
              </div>
            </div>
            <Button onClick={() => setShowData(false)} variant="ghost" size="sm">
              Hide
            </Button>
          </div>

          {priceData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <h4 className="text-md font-semibold text-navy-900 mb-4">Recent Sales</h4>
            <div className="space-y-3">
              {recentSales.map((sale, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-navy-100 flex items-center justify-center">
                      <Home className="w-5 h-5 text-navy-600" />
                    </div>
                    <div>
                      <p className="font-medium text-navy-900">{sale.address}</p>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(sale.date)}
                        </span>
                        {sale.property_type && (
                          <span className="flex items-center gap-1">
                            <Home className="w-3 h-3" />
                            {sale.property_type}
                          </span>
                        )}
                        {sale.estate_type && (
                          <span className="text-xs bg-navy-100 text-navy-600 px-2 py-0.5 rounded">
                            {sale.estate_type}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-emerald-600">{formatPrice(sale.price)}</p>
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

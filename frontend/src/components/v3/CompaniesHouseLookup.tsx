import { useState } from 'react';
import { useGovernmentAPIs } from '../../hooks/useGovernmentAPIs';
import { Card, Button } from './index';
import { Building2, Search, Loader2, AlertCircle, CheckCircle2, MapPin, Calendar, Info } from 'lucide-react';

interface CompaniesHouseLookupProps {
  onSelect?: (company: any) => void;
  initialQuery?: string;
}

export default function CompaniesHouseLookup({ onSelect, initialQuery = '' }: CompaniesHouseLookupProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const { loading, error, searchCompanies, getCompanyDetails } = useGovernmentAPIs();

  const handleSearch = async () => {
    if (!query.trim()) return;
    const companies = await searchCompanies(query);
    setResults(companies);
    setSelectedCompany(null);
    setShowDetails(false);
  };

  const handleSelectCompany = async (company: any) => {
    setSelectedCompany(company);
    const details = await getCompanyDetails(company.company_number);
    if (details) {
      setSelectedCompany(details);
      setShowDetails(true);
      if (onSelect) {
        onSelect(details);
      }
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    const normalizedStatus = status?.toLowerCase();
    if (normalizedStatus === 'active') return 'text-emerald-600 bg-emerald-50';
    if (normalizedStatus === 'dissolved') return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  return (
    <div className="space-y-4">
      {/* Search Box */}
      <Card>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-navy-500/10 to-navy-600/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-navy-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-navy-900">Companies House Verification</h3>
              <p className="text-sm text-gray-500">Search for registered companies</p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter company name or number..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg
                         focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-all
                         text-sm placeholder:text-gray-400"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              <p>{error}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Search Results */}
      {results.length > 0 && !showDetails && (
        <Card>
          <div className="p-6">
            <h4 className="text-sm font-semibold text-navy-900 mb-4">
              Found {results.length} {results.length === 1 ? 'company' : 'companies'}
            </h4>
            <div className="space-y-2">
              {results.map((company, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectCompany(company)}
                  className="w-full p-4 bg-gray-50 hover:bg-navy-50 rounded-lg text-left transition-colors border border-transparent hover:border-navy-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="w-4 h-4 text-navy-600 flex-shrink-0" />
                        <p className="font-semibold text-navy-900">{company.company_name}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>#{company.company_number}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(company.date_of_creation)}
                        </span>
                      </div>
                      {company.address && (
                        <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
                          <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>
                            {[
                              company.address.line_1,
                              company.address.locality,
                              company.address.postal_code
                            ].filter(Boolean).join(', ')}
                          </span>
                        </p>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(company.company_status)}`}>
                      {company.company_status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Company Details */}
      {showDetails && selectedCompany && (
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-navy-900">{selectedCompany.company_name}</h3>
                  <p className="text-sm text-gray-500">Company #{selectedCompany.company_number}</p>
                </div>
              </div>
              <Button onClick={() => { setShowDetails(false); setResults([]); }} variant="ghost" size="sm">
                New Search
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-navy-50 rounded-lg p-4">
                <p className="text-xs text-navy-600 mb-1">Status</p>
                <p className="font-semibold text-navy-900">{selectedCompany.company_status}</p>
              </div>
              <div className="bg-navy-50 rounded-lg p-4">
                <p className="text-xs text-navy-600 mb-1">Type</p>
                <p className="font-semibold text-navy-900">{selectedCompany.company_type || 'N/A'}</p>
              </div>
              <div className="bg-navy-50 rounded-lg p-4">
                <p className="text-xs text-navy-600 mb-1">Incorporated</p>
                <p className="font-semibold text-navy-900">{formatDate(selectedCompany.date_of_creation)}</p>
              </div>
              <div className="bg-navy-50 rounded-lg p-4">
                <p className="text-xs text-navy-600 mb-1">Jurisdiction</p>
                <p className="font-semibold text-navy-900">{selectedCompany.jurisdiction || 'N/A'}</p>
              </div>
            </div>

            {selectedCompany.registered_office_address && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-xs text-gray-600 mb-2 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Registered Office Address
                </p>
                <p className="text-sm text-gray-900">
                  {[
                    selectedCompany.registered_office_address.address_line_1,
                    selectedCompany.registered_office_address.address_line_2,
                    selectedCompany.registered_office_address.locality,
                    selectedCompany.registered_office_address.postal_code,
                    selectedCompany.registered_office_address.country
                  ].filter(Boolean).join(', ')}
                </p>
              </div>
            )}

            {selectedCompany.sic_codes && selectedCompany.sic_codes.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-600 mb-2 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  SIC Codes
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedCompany.sic_codes.map((code: string, idx: number) => (
                    <span key={idx} className="px-2 py-1 bg-navy-100 text-navy-700 rounded text-xs font-medium">
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {results.length === 0 && !loading && query && !error && (
        <Card>
          <div className="p-6 text-center text-gray-500">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No companies found for "{query}"</p>
          </div>
        </Card>
      )}
    </div>
  );
}

import { useState } from 'react';

const API_BASE = 'http://localhost:3001/api';

interface LandRegistryResult {
  address: string;
  postcode: string;
  price: number;
  date: string;
  property_type?: string;
  estate_type?: string;
  transaction_id: string;
}

interface PostcodeResult {
  postcode: string;
  latitude: number;
  longitude: number;
  admin_district: string;
  admin_ward: string;
  parish?: string;
  parliamentary_constituency: string;
  region: string;
  country: string;
  quality: number;
  eastings: number;
  northings: number;
  outcode: string;
  incode: string;
}

interface CompanyResult {
  company_number: string;
  company_name: string;
  company_status: string;
  company_type: string;
  date_of_creation: string;
  address?: {
    line_1?: string;
    line_2?: string;
    locality?: string;
    postal_code?: string;
    country?: string;
  };
}

interface CompanyDetails extends CompanyResult {
  jurisdiction?: string;
  registered_office_address?: any;
  accounts?: any;
  confirmation_statement?: any;
  sic_codes?: string[];
  has_insolvency_history?: boolean;
  has_charges?: boolean;
}

export function useGovernmentAPIs() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getToken = () => localStorage.getItem('token');

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`
  });

  // Land Registry Price Paid Data
  const fetchPricePaid = async (postcode: string): Promise<LandRegistryResult[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/land-registry/price-paid?postcode=${encodeURIComponent(postcode)}`,
        { headers: headers() }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch price data');
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Postcodes.io Lookup
  const lookupPostcode = async (postcode: string): Promise<PostcodeResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/postcode/lookup?postcode=${encodeURIComponent(postcode)}`,
        { headers: headers() }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to lookup postcode');
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Postcodes.io Autocomplete
  const autocompletePostcode = async (query: string): Promise<string[]> => {
    if (query.length < 2) return [];

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/postcode/autocomplete?query=${encodeURIComponent(query)}`,
        { headers: headers() }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.result || [];
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Companies House Search
  const searchCompanies = async (query: string): Promise<CompanyResult[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/companies-house/search?query=${encodeURIComponent(query)}`,
        { headers: headers() }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to search companies');
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Companies House Company Details
  const getCompanyDetails = async (companyNumber: string): Promise<CompanyDetails | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/companies-house/company/${encodeURIComponent(companyNumber)}`,
        { headers: headers() }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch company details');
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // EPC Lookup (existing API)
  const lookupEPC = async (postcode: string): Promise<any[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/epc-lookup?postcode=${encodeURIComponent(postcode)}`,
        { headers: headers() }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to lookup EPC');
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    fetchPricePaid,
    lookupPostcode,
    autocompletePostcode,
    searchCompanies,
    getCompanyDetails,
    lookupEPC
  };
}

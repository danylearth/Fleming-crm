import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { Building2, Plus, X, MapPin, Bed, PoundSterling, Search, User, ChevronRight } from 'lucide-react';

interface Property {
  id: number;
  landlord_id: number;
  landlord_name: string;
  address: string;
  postcode: string;
  property_type: string;
  bedrooms: number;
  rent_amount: number;
  status: string;
  current_tenant: string | null;
  notes: string;
}

interface Landlord {
  id: number;
  name: string;
}

export default function Properties() {
  const api = useApi();
  const [properties, setProperties] = useState<Property[]>([]);
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    landlord_id: '', address: '', postcode: '', property_type: 'house', 
    bedrooms: '2', rent_amount: '', status: 'available', notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [props, lands] = await Promise.all([
        api.get('/api/properties'),
        api.get('/api/landlords')
      ]);
      setProperties(props);
      setLandlords(lands);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/properties', {
        ...formData,
        landlord_id: parseInt(formData.landlord_id),
        bedrooms: parseInt(formData.bedrooms),
        rent_amount: parseFloat(formData.rent_amount)
      });
      setShowModal(false);
      setFormData({ landlord_id: '', address: '', postcode: '', property_type: 'house', bedrooms: '2', rent_amount: '', status: 'available', notes: '' });
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filtered = properties.filter(p => 
    p.address.toLowerCase().includes(search.toLowerCase()) ||
    p.postcode.toLowerCase().includes(search.toLowerCase()) ||
    p.landlord_name.toLowerCase().includes(search.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    available: 'bg-green-50 text-green-700',
    let: 'bg-blue-50 text-blue-700',
    maintenance: 'bg-amber-50 text-amber-700'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Properties</h1>
          <p className="text-gray-500 mt-1">{properties.length} properties under management</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-navy-900 hover:bg-navy-800 text-white font-medium rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Property
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search properties..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
        />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-navy-900 mb-1">No properties yet</h3>
          <p className="text-gray-500 text-sm">Add your first property to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(property => (
            <Link key={property.id} to={`/properties/${property.id}`} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition-all block">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-500" />
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusColors[property.status]}`}>
                  {property.status}
                </span>
              </div>
              
              <h3 className="font-semibold text-navy-900 mb-1">{property.address}</h3>
              <p className="text-sm text-gray-500 flex items-center gap-1 mb-3">
                <MapPin className="w-3.5 h-3.5" />
                {property.postcode}
              </p>
              
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                <span className="flex items-center gap-1">
                  <Bed className="w-4 h-4" />
                  {property.bedrooms} bed
                </span>
                <span className="flex items-center gap-1">
                  <PoundSterling className="w-4 h-4" />
                  {property.rent_amount.toLocaleString()}/mo
                </span>
              </div>
              
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
                <span className="text-gray-500 truncate">Landlord: {property.landlord_name}</span>
                {property.current_tenant ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <User className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[100px]">{property.current_tenant}</span>
                  </span>
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-navy-900">Add Property</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">Landlord *</label>
                <select
                  value={formData.landlord_id}
                  onChange={e => setFormData({ ...formData, landlord_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  required
                >
                  <option value="">Select landlord...</option>
                  {landlords.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">Address *</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Postcode *</label>
                  <input
                    type="text"
                    value={formData.postcode}
                    onChange={e => setFormData({ ...formData, postcode: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Type</label>
                  <select
                    value={formData.property_type}
                    onChange={e => setFormData({ ...formData, property_type: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  >
                    <option value="house">House</option>
                    <option value="flat">Flat</option>
                    <option value="bungalow">Bungalow</option>
                    <option value="studio">Studio</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Bedrooms</label>
                  <input
                    type="number"
                    value={formData.bedrooms}
                    onChange={e => setFormData({ ...formData, bedrooms: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Rent (£/month) *</label>
                  <input
                    type="number"
                    value={formData.rent_amount}
                    onChange={e => setFormData({ ...formData, rent_amount: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                    required
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-navy-900 text-white font-medium rounded-xl hover:bg-navy-800"
                >
                  Add Property
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

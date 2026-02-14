import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import V3Layout from '../components/V3Layout';
import { Card, GlassCard, Button, ProgressRing, SectionHeader, StatusDot, EmptyState, Avatar, Tag } from '../components/v3';
import { useApi } from '../hooks/useApi';
import {
  Building2, Bed, PoundSterling, MapPin, User, Users,
  CheckCircle2, Clock, FileText, FileSpreadsheet, FileImage,
  ChevronRight, ExternalLink
} from 'lucide-react';

interface PropertyDetail {
  id: number; address: string; postcode: string; rent_amount: number;
  status: string; landlord_name: string; landlord_id?: number;
  current_tenant: string | null; tenant_id?: number;
  bedrooms: number; property_type: string;
  eicr_expiry_date: string | null; epc_expiry_date: string | null;
  gas_safety_expiry_date: string | null; has_gas: boolean;
}

interface Task {
  id: number; title: string; status: string; priority: string; due_date: string;
  property_id?: number;
}

export default function PropertyDetailV3() {
  const { id } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/api/properties/${id}`),
      api.get('/api/tasks').catch(() => []),
    ]).then(([prop, tks]) => {
      setProperty(prop);
      setTasks(Array.isArray(tks) ? tks : []);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, [id]);

  const compliancePercent = (expiryDate: string | null) => {
    if (!expiryDate) return 0;
    const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 0;
    if (days > 365) return 100;
    return Math.round((days / 365) * 100);
  };

  const complianceColor = (expiryDate: string | null): 'active' | 'warning' | 'error' => {
    if (!expiryDate) return 'error';
    const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'error';
    if (days < 30) return 'warning';
    return 'active';
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : 'N/A';

  if (loading) {
    return (
      <V3Layout title="Property" breadcrumb={[{ label: 'Properties', to: '/v3/properties' }, { label: 'Loading...' }]}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-white/20 border-t-orange-500 rounded-full animate-spin" />
        </div>
      </V3Layout>
    );
  }

  if (!property) {
    return (
      <V3Layout title="Property" breadcrumb={[{ label: 'Properties', to: '/v3/properties' }, { label: 'Not Found' }]}>
        <EmptyState message="Property not found" />
      </V3Layout>
    );
  }

  const propertyTasks = tasks.filter(t => t.property_id === property.id || !t.property_id).slice(0, 5);

  return (
    <V3Layout
      title=""
      breadcrumb={[
        { label: 'Properties', to: '/v3/properties' },
        { label: property.address },
      ]}
    >
      <div className="p-4 md:p-6 space-y-6 max-w-6xl">
        {/* Hero */}
        <div className="relative h-40 md:h-56 rounded-2xl overflow-hidden bg-gradient-to-br from-orange-500/20 via-pink-500/10 to-purple-500/20 border border-white/[0.06]">
          <div className="absolute inset-0 flex items-center justify-center">
            <Building2 size={64} className="text-white/10" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent">
            <div className="flex items-center gap-2 mb-1">
              <StatusDot status={property.status === 'active' ? 'active' : 'inactive'} size="md" />
              <span className="text-sm text-white/70 capitalize">{property.status}</span>
            </div>
            <h1 className="text-2xl font-bold">{property.address}</h1>
            <p className="text-white/50 text-sm">{property.postcode}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Compliance Rings */}
            <Card className="p-6">
              <SectionHeader title="Compliance Overview" />
              <div className="grid grid-cols-2 md:flex md:items-center gap-6 md:gap-8">
                <div className="flex flex-col items-center">
                  <ProgressRing value={compliancePercent(property.eicr_expiry_date)} size={80} strokeWidth={6} />
                  <span className="text-xs text-white/50 mt-2">EICR</span>
                  <span className={`text-xs mt-0.5 ${
                    complianceColor(property.eicr_expiry_date) === 'error' ? 'text-red-400'
                    : complianceColor(property.eicr_expiry_date) === 'warning' ? 'text-amber-400'
                    : 'text-emerald-400'
                  }`}>{formatDate(property.eicr_expiry_date)}</span>
                </div>
                <div className="flex flex-col items-center">
                  <ProgressRing value={compliancePercent(property.epc_expiry_date)} size={80} strokeWidth={6} />
                  <span className="text-xs text-white/50 mt-2">EPC</span>
                  <span className={`text-xs mt-0.5 ${
                    complianceColor(property.epc_expiry_date) === 'error' ? 'text-red-400'
                    : complianceColor(property.epc_expiry_date) === 'warning' ? 'text-amber-400'
                    : 'text-emerald-400'
                  }`}>{formatDate(property.epc_expiry_date)}</span>
                </div>
                {property.has_gas && (
                  <div className="flex flex-col items-center">
                    <ProgressRing value={compliancePercent(property.gas_safety_expiry_date)} size={80} strokeWidth={6} />
                    <span className="text-xs text-white/50 mt-2">Gas Safety</span>
                    <span className={`text-xs mt-0.5 ${
                      complianceColor(property.gas_safety_expiry_date) === 'error' ? 'text-red-400'
                      : complianceColor(property.gas_safety_expiry_date) === 'warning' ? 'text-amber-400'
                      : 'text-emerald-400'
                    }`}>{formatDate(property.gas_safety_expiry_date)}</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Tasks */}
            <Card className="p-6">
              <SectionHeader title="Tasks" action={() => navigate('/v3/tasks')} actionLabel="View All" />
              {propertyTasks.length ? (
                <div className="space-y-2">
                  {propertyTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03]">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        task.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.06] text-white/40'
                      }`}>
                        {task.status === 'completed' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{task.title}</p>
                      </div>
                      <Tag>{task.priority}</Tag>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No tasks" />
              )}
            </Card>

            {/* Documents Placeholder */}
            <Card className="p-6">
              <SectionHeader title="Documents" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { icon: FileText, label: 'Tenancy Agreement', color: 'text-blue-400' },
                  { icon: FileSpreadsheet, label: 'EPC Certificate', color: 'text-emerald-400' },
                  { icon: FileText, label: 'EICR Report', color: 'text-amber-400' },
                  { icon: FileImage, label: 'Property Photos', color: 'text-pink-400' },
                ].map((doc, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer transition-colors">
                    <doc.icon size={24} className={doc.color} />
                    <span className="text-xs text-white/50 text-center">{doc.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Property Info */}
            <Card className="p-6">
              <SectionHeader title="Details" />
              <div className="space-y-4">
                {[
                  { icon: Building2, label: 'Type', value: property.property_type },
                  { icon: Bed, label: 'Bedrooms', value: property.bedrooms },
                  { icon: PoundSterling, label: 'Rent', value: `£${property.rent_amount?.toLocaleString()}/mo` },
                  { icon: MapPin, label: 'Postcode', value: property.postcode },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                      <item.icon size={15} className="text-white/40" />
                    </div>
                    <div>
                      <p className="text-xs text-white/40">{item.label}</p>
                      <p className="text-sm font-medium capitalize">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Landlord */}
            <Card className="p-6">
              <SectionHeader title="Landlord" />
              {property.landlord_name ? (
                <div
                  onClick={() => property.landlord_id && navigate(`/v3/landlords/${property.landlord_id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer transition-colors"
                >
                  <Avatar name={property.landlord_name} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{property.landlord_name}</p>
                    <p className="text-xs text-white/40">Landlord</p>
                  </div>
                  <ChevronRight size={16} className="text-white/30" />
                </div>
              ) : (
                <p className="text-sm text-white/30">No landlord linked</p>
              )}
            </Card>

            {/* Tenant */}
            <Card className="p-6">
              <SectionHeader title="Tenant" />
              {property.current_tenant ? (
                <div
                  onClick={() => property.tenant_id && navigate(`/v3/tenants/${property.tenant_id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer transition-colors"
                >
                  <Avatar name={property.current_tenant} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{property.current_tenant}</p>
                    <p className="text-xs text-white/40">Current Tenant</p>
                  </div>
                  <ChevronRight size={16} className="text-white/30" />
                </div>
              ) : (
                <p className="text-sm text-white/30">No tenant assigned</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </V3Layout>
  );
}

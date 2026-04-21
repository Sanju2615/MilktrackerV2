import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEMR } from '@/hooks/useEMR';
import type { EMRPatient } from '@/types/emr';
import { 
  Search, 
  User, 
  Bed, 
  Calendar, 
  Activity, 
  AlertTriangle,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';

interface PatientListProps {
  onSelectPatient: (patient: EMRPatient) => void;
  selectedPatientId?: string;
}

export function PatientList({ onSelectPatient, selectedPatientId }: PatientListProps) {
  const { patients, isLoading, error, emrConnected, loadPatients, checkConnectivity } = useEMR();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'nicu' | 'alert'>('all');

  useEffect(() => {
    loadPatients();
    checkConnectivity();
  }, [loadPatients, checkConnectivity]);

  const filteredPatients = patients.filter(patient => {
    const matchesSearch = 
      patient.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.mrn.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.roomNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filter === 'nicu') {
      return matchesSearch && patient.roomNumber?.startsWith('NICU');
    }
    if (filter === 'alert') {
      return matchesSearch && (patient.allergies?.length || patient.gestationalAgeAtBirth && patient.gestationalAgeAtBirth < 34);
    }
    return matchesSearch;
  });

  const getAgeDisplay = (birthDate: Date) => {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - birthDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 1) return '< 1 day';
    if (diffDays === 1) return '1 day';
    return `${diffDays} days`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Patient List</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-slate-500">Select a patient to view orders</p>
            {emrConnected ? (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
                <Wifi className="w-3 h-3" />
                EMR Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 flex items-center gap-1">
                <WifiOff className="w-3 h-3" />
                Offline
              </Badge>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadPatients}
          disabled={isLoading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name, MRN, or room..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            variant={filter === 'nicu' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('nicu')}
          >
            NICU
          </Button>
          <Button
            variant={filter === 'alert' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('alert')}
          >
            Alerts
          </Button>
        </div>
      </div>

      {/* Patient Cards */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-500">Loading patients from EMR...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-red-300" />
              <p className="font-medium">Error loading patients</p>
              <p className="text-sm mt-1">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={loadPatients}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <User className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>No patients found</p>
            </div>
          ) : (
            filteredPatients.map((patient) => (
              <Card
                key={patient.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedPatientId === patient.id 
                    ? 'ring-2 ring-blue-500 border-blue-500' 
                    : 'border-slate-200'
                }`}
                onClick={() => onSelectPatient(patient)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        patient.gender === 'female' 
                          ? 'bg-pink-100 text-pink-600' 
                          : 'bg-blue-100 text-blue-600'
                      }`}>
                        <User className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">
                          {patient.firstName} {patient.lastName}
                        </h3>
                        <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            MRN: {patient.mrn}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {getAgeDisplay(patient.dateOfBirth)} old
                          </span>
                          {patient.roomNumber && (
                            <span className="flex items-center gap-1">
                              <Bed className="w-3 h-3" />
                              {patient.roomNumber}-{patient.bedNumber}
                            </span>
                          )}
                        </div>
                        {patient.gestationalAgeAtBirth && (
                          <p className="text-xs text-slate-400 mt-1">
                            GA: {patient.gestationalAgeAtBirth}w | Birth: {patient.birthWeight}g | Current: {patient.currentWeight}g
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {patient.allergies && patient.allergies.length > 0 && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Allergy
                        </Badge>
                      )}
                      {patient.gestationalAgeAtBirth && patient.gestationalAgeAtBirth < 34 && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          Preterm
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import { useStorage } from '@/hooks/useStorage';
import { useEMR } from '@/hooks/useEMR';
import { Dashboard } from '@/sections/Dashboard';
import { FeedingForm } from '@/sections/FeedingForm';
import { History } from '@/sections/History';
import { Charts } from '@/sections/Charts';
import { PatientList } from '@/sections/PatientList';
import { CPOEOrderEntry } from '@/sections/CPOEOrderEntry';
import { ClosedLoopAdministration } from '@/sections/ClosedLoopAdministration';
import { InventoryManagement } from '@/sections/InventoryManagement';
import { BarcodeScanner } from '@/sections/BarcodeScanner';
import { MilkCollection } from '@/sections/MilkCollection';
import { MilkPreparation } from '@/sections/MilkPreparation';
import { UserManagement } from '@/sections/UserManagement';
import { DiscardReasonSetup } from '@/sections/DiscardReasonSetup';
import { LoginScreen } from '@/sections/LoginScreen';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { 
  Baby, 
  History as HistoryIcon, 
  BarChart3, 
  Trash2, 
  Users, 
  FileText, 
  CheckCircle2,
  Activity,
  Shield,
  Database,
  Package,
  Scan,
  UserCog,
  LogOut,
  FlaskConical,
  Droplets,
  Lock,
  User,
  Stethoscope,
  Settings,
  Settings2
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { EMRPatient } from '@/types/emr';

type AppMode = 'personal' | 'himss6';

function App() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const { 
    canViewPatients, 
    canViewOrders, 
    canViewInventory, 
    canManageInventory,
    canDiscardInventory,
    canAdministerFeeding,
    canViewUsers,
    canViewAudit,
    canManageSystem,
    isAdmin,
    isNurseManager,
    isNurse,
    isPhysician,
    isTechnician,
    isReadOnly
  } = usePermission();
  
  const { feedings, addFeeding, deleteFeeding, clearAllData } = useStorage();
  const { 
    selectedPatient, 
    emrConnected, 
    loadPatients,
    selectPatient 
  } = useEMR();
  
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [himss6Tab, setHimss6Tab] = useState('patients');
  const [appMode, setAppMode] = useState<AppMode>('himss6');

  const handleSaveFeeding = (feeding: Parameters<typeof addFeeding>[0]) => {
    addFeeding(feeding);
    setShowForm(false);
    toast.success('Feeding logged successfully!', {
      description: `Recorded ${feeding.type} feeding at ${feeding.startTime.toLocaleTimeString()}`,
    });
  };

  const handleDeleteFeeding = (id: string) => {
    deleteFeeding(id);
    toast.success('Feeding deleted');
  };

  const handleClearAllData = () => {
    clearAllData();
    toast.success('All data cleared');
  };

  const handleSelectPatient = async (patient: EMRPatient) => {
    await selectPatient(patient);
    setHimss6Tab('orders');
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#003366] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        <Toaster position="top-center" richColors />
        <LoginScreen />
      </>
    );
  }

  if (showForm) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <FeedingForm 
          onSave={handleSaveFeeding} 
          onCancel={() => setShowForm(false)} 
        />
      </div>
    );
  }

  // Get role icon and color
  const getRoleDisplay = () => {
    switch (user?.role) {
      case 'admin':
        return { icon: Settings, color: 'bg-purple-100 text-purple-700', label: 'Administrator' };
      case 'nurse_manager':
        return { icon: UserCog, color: 'bg-blue-100 text-blue-700', label: 'Nurse Manager' };
      case 'nurse':
        return { icon: User, color: 'bg-emerald-100 text-emerald-700', label: 'Nurse' };
      case 'physician':
        return { icon: Stethoscope, color: 'bg-cyan-100 text-cyan-700', label: 'Physician' };
      case 'technician':
        return { icon: FlaskConical, color: 'bg-amber-100 text-amber-700', label: 'Technician' };
      case 'viewer':
        return { icon: Lock, color: 'bg-slate-100 text-slate-700', label: 'Read-Only' };
      default:
        return { icon: User, color: 'bg-slate-100 text-slate-700', label: 'User' };
    }
  };

  const roleDisplay = getRoleDisplay();
  const RoleIcon = roleDisplay.icon;

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* KCH Logo */}
              <div className="w-12 h-12 rounded-lg bg-[#003366] flex items-center justify-center shadow-md">
                <svg viewBox="0 0 40 40" className="w-8 h-8">
                  <circle cx="20" cy="20" r="18" fill="none" stroke="#C9A227" strokeWidth="2"/>
                  <text x="20" y="25" textAnchor="middle" fill="#FFFFFF" fontSize="14" fontWeight="bold">KCH</text>
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-[#003366]">King's College Hospital Jeddah</h1>
                  {appMode === 'himss6' && (
                    <Badge className="bg-[#C9A227] text-white border-[#C9A227] flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      HIMSS 6
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Human Milk Tracker - NICU Clinical System
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Mode Toggle - Only for Admin */}
              {canManageSystem && (
                <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
                  <button
                    onClick={() => setAppMode('personal')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      appMode === 'personal' 
                        ? 'bg-white text-slate-800 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Baby className="w-4 h-4" />
                      Personal
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setAppMode('himss6');
                      loadPatients();
                    }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      appMode === 'himss6' 
                        ? 'bg-white text-slate-800 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-4 h-4" />
                      Clinical
                    </div>
                  </button>
                </div>
              )}

              {/* User Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${roleDisplay.color}`}>
                      <RoleIcon className="w-4 h-4" />
                    </div>
                    <div className="hidden sm:flex flex-col items-start">
                      <span className="text-sm font-medium">{user?.firstName}</span>
                      <span className="text-xs text-slate-500">{roleDisplay.label}</span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="font-semibold">{user?.firstName} {user?.lastName}</span>
                      <span className="text-xs text-slate-500 font-normal">{user?.email}</span>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className={`${roleDisplay.color} border-0`}>
                          {roleDisplay.label}
                        </Badge>
                        {isReadOnly && (
                          <Badge variant="outline" className="text-amber-600 border-amber-300">
                            Read Only
                          </Badge>
                        )}
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-2">
                    <p className="text-xs text-slate-500 mb-2">Your Permissions:</p>
                    <div className="flex flex-wrap gap-1">
                      {user?.permissions.slice(0, 5).map((perm) => (
                        <span key={perm} className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">
                          {perm}
                        </span>
                      ))}
                      {user && user.permissions.length > 5 && (
                        <span className="text-[10px] text-slate-500">+{user.permissions.length - 5} more</span>
                      )}
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {appMode === 'personal' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500">
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear All Data</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all your feeding records. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleClearAllData}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        Clear All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {appMode === 'personal' ? (
          /* Personal Mode - Original App */
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-3 w-full max-w-md mx-auto">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <Baby className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <HistoryIcon className="w-4 h-4" />
                <span className="hidden sm:inline">History</span>
              </TabsTrigger>
              <TabsTrigger value="charts" className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Analytics</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="mt-6">
              <Dashboard 
                feedings={feedings} 
                onLogFeeding={() => setShowForm(true)} 
              />
            </TabsContent>

            <TabsContent value="history" className="mt-6">
              <History 
                feedings={feedings} 
                onDelete={handleDeleteFeeding} 
              />
            </TabsContent>

            <TabsContent value="charts" className="mt-6">
              <Charts feedings={feedings} />
            </TabsContent>
          </Tabs>
        ) : (
          /* HIMSS 6 Clinical Mode - Role-Based Navigation */
          <Tabs value={himss6Tab} onValueChange={setHimss6Tab} className="space-y-6">
            <TabsList className="flex flex-wrap w-full max-w-6xl mx-auto h-auto gap-1">
              {/* Patients Tab - All roles can view */}
              {canViewPatients && (
                <TabsTrigger value="patients" className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span className="hidden sm:inline">Patients</span>
                </TabsTrigger>
              )}
              
              {/* Orders Tab - Roles that can view orders */}
              {canViewOrders && (
                <TabsTrigger value="orders" className="flex items-center gap-2" disabled={!selectedPatient}>
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">CPOE</span>
                </TabsTrigger>
              )}
              
              {/* Collection Tab - Admin, Nurses, Managers, Physicians */}
              {(isAdmin || isNurse || isNurseManager || isPhysician) && (
                <TabsTrigger value="collection" className="flex items-center gap-2">
                  <Droplets className="w-4 h-4" />
                  <span className="hidden sm:inline">Collect</span>
                </TabsTrigger>
              )}
              
              {/* Inventory Tab - Roles that can view inventory */}
              {canViewInventory && (
                <TabsTrigger value="inventory" className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  <span className="hidden sm:inline">Inventory</span>
                </TabsTrigger>
              )}
              
              {/* Preparation Tab - Nurses, Technicians, Managers */}
              {(isNurse || isNurseManager || isTechnician) && (
                <TabsTrigger value="preparation" className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4" />
                  <span className="hidden sm:inline">Prep</span>
                </TabsTrigger>
              )}
              
              {/* Scanner Tab - Nurses, Managers, Physicians who can administer */}
              {canAdministerFeeding && (
                <TabsTrigger value="scanner" className="flex items-center gap-2" disabled={!selectedPatient}>
                  <Scan className="w-4 h-4" />
                  <span className="hidden sm:inline">Scan</span>
                </TabsTrigger>
              )}
              
              {/* Admin Tab - Nurses, Managers, Physicians who can administer */}
              {canAdministerFeeding && (
                <TabsTrigger value="admin" className="flex items-center gap-2" disabled={!selectedPatient}>
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </TabsTrigger>
              )}
              
              {/* Users Tab - Admin and Nurse Managers */}
              {canViewUsers && (
                <TabsTrigger value="users" className="flex items-center gap-2">
                  <UserCog className="w-4 h-4" />
                  <span className="hidden sm:inline">Users</span>
                </TabsTrigger>
              )}
              
              {/* Audit Tab - Admin, Nurse Managers, Auditors */}
              {canViewAudit && (
                <TabsTrigger value="audit" className="flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  <span className="hidden sm:inline">Audit</span>
                </TabsTrigger>
              )}
              
              {/* Setup Tab - Admin only */}
              {isAdmin && (
                <TabsTrigger value="setup" className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Setup</span>
                </TabsTrigger>
              )}
            </TabsList>

            {/* Patients Content */}
            {canViewPatients && (
              <TabsContent value="patients" className="mt-6">
                <PatientList 
                  onSelectPatient={handleSelectPatient}
                  selectedPatientId={selectedPatient?.id}
                />
              </TabsContent>
            )}

            {/* Orders Content */}
            {canViewOrders && (
              <TabsContent value="orders" className="mt-6">
                {selectedPatient ? (
                  <CPOEOrderEntry patient={selectedPatient} />
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p>Please select a patient first</p>
                  </div>
                )}
              </TabsContent>
            )}

            {/* Collection Content */}
            {(isAdmin || isNurse || isNurseManager || isPhysician) && (
              <TabsContent value="collection" className="mt-6">
                <MilkCollection />
              </TabsContent>
            )}

            {/* Inventory Content */}
            {canViewInventory && (
              <TabsContent value="inventory" className="mt-6">
                <InventoryManagement 
                  readOnly={isReadOnly}
                  canManage={canManageInventory}
                  canDiscard={canDiscardInventory}
                />
              </TabsContent>
            )}

            {/* Preparation Content */}
            {(isNurse || isNurseManager || isTechnician) && (
              <TabsContent value="preparation" className="mt-6">
                <MilkPreparation />
              </TabsContent>
            )}

            {/* Scanner Content */}
            {canAdministerFeeding && (
              <TabsContent value="scanner" className="mt-6">
                {selectedPatient ? (
                  <BarcodeScanner 
                    patientId={selectedPatient.id}
                    orderId="ord-001"
                  />
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p>Please select a patient first</p>
                  </div>
                )}
              </TabsContent>
            )}

            {/* Admin Content */}
            {canAdministerFeeding && (
              <TabsContent value="admin" className="mt-6">
                {selectedPatient ? (
                  <ClosedLoopAdministration patient={selectedPatient} />
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p>Please select a patient first</p>
                  </div>
                )}
              </TabsContent>
            )}

            {/* Users Content */}
            {canViewUsers && (
              <TabsContent value="users" className="mt-6">
                <UserManagement />
              </TabsContent>
            )}

            {/* Audit Content */}
            {canViewAudit && (
              <TabsContent value="audit" className="mt-6">
                <AuditLogViewer />
              </TabsContent>
            )}
            
            {/* Setup Content - Admin only */}
            {isAdmin && (
              <TabsContent value="setup" className="mt-6">
                <DiscardReasonSetup />
              </TabsContent>
            )}
          </Tabs>
        )}
      </main>

      {/* Mobile Floating Action Button (Personal Mode Only) */}
      {appMode === 'personal' && (
        <button
          onClick={() => setShowForm(true)}
          className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg shadow-blue-300 flex items-center justify-center transition-transform hover:scale-105"
        >
          <span className="text-2xl font-bold">+</span>
        </button>
      )}

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 py-6 text-center text-sm">
        {appMode === 'himss6' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <div className="w-6 h-6 rounded bg-[#003366] flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">KCH</span>
              </div>
              <p className="text-[#003366] font-medium">King's College Hospital Jeddah</p>
            </div>
            <p className="text-slate-500">Human Milk Tracker • HIMSS 6 Compliant Clinical System</p>
            <p className="text-xs text-slate-400">
              {emrConnected ? '✓ Connected to EMR' : '⚠ Offline Mode'} • 
              FHIR R4 • HL7 v2.x • Closed-Loop Integration
            </p>
            {user && (
              <p className="text-xs text-slate-400">
                Logged in as: {user.firstName} {user.lastName} ({roleDisplay.label})
                {isReadOnly && ' • Read-Only Access'}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <div className="w-6 h-6 rounded bg-[#003366] flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">KCH</span>
              </div>
              <p className="text-[#003366] font-medium">King's College Hospital Jeddah</p>
            </div>
            <p className="text-slate-400">Human Milk Tracker • NICU Clinical System</p>
          </div>
        )}
      </footer>
    </div>
  );
}

// Audit Log Viewer Component
interface AuditLogViewerProps {
  readOnly?: boolean;
}

function AuditLogViewer({ readOnly }: AuditLogViewerProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Audit Trail</h2>
        <div className="flex items-center gap-2">
          {readOnly && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              <Lock className="w-3 h-3 mr-1" />
              Read Only
            </Badge>
          )}
          <Badge variant="outline" className="bg-slate-100">
            HIMSS 6 Compliant
          </Badge>
        </div>
      </div>
      
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Database className="w-5 h-5 text-slate-500" />
            System Activity Log
          </h3>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Patient list loaded from EMR</p>
                <p className="text-xs text-slate-500">User: Nurse Johnson • {new Date().toLocaleString()}</p>
              </div>
              <Badge variant="outline">view_patient</Badge>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Feeding order created</p>
                <p className="text-xs text-slate-500">User: Dr. Williams • Patient: Emma Johnson</p>
              </div>
              <Badge variant="outline">create_order</Badge>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Feeding administered - Closed-loop confirmation sent</p>
                <p className="text-xs text-slate-500">User: Nurse Johnson • Order: ORD-2025-001</p>
              </div>
              <Badge variant="outline">administer_feeding</Badge>
            </div>
          </div>
          
          <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-sm text-amber-800">
              <strong>Audit Compliance:</strong> All actions are logged with user identification, 
              timestamp, and patient context for HIMSS 6 compliance. Logs are retained per 
              institutional policy and regulatory requirements.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

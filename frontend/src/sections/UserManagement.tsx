import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUsers } from '@/hooks/useUsers';
import { ROLE_LABELS, type UserRole, type UserStatus } from '@/types/user';
import { 
  Users, 
  Building2, 
  Search, 
  Plus, 
  Lock, 
  Unlock, 
  UserX,
  MapPin,
  CheckCircle2,
  Clock,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export function UserManagement() {
  const { 
    users, 
    stations, 
    currentUser, 
    createUser, 
    updateUserStatus,
    assignStations,
    createStation,
    getStationName 
  } = useUsers();

  const [activeTab, setActiveTab] = useState('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');
  
  // Dialog states
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [showStationDialog, setShowStationDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showPasswordResetDialog, setShowPasswordResetDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [statusReason, setStatusReason] = useState('');
  
  // Password reset state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // New user form
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    employeeId: '',
    role: 'nurse' as UserRole,
    status: 'active' as UserStatus,
    password: '',
    assignedStations: [] as string[],
    primaryStation: '',
  });

  // New station form
  const [newStation, setNewStation] = useState({
    name: '',
    unit: '',
    floor: '',
    roomRange: '',
    isActive: true,
  });

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      (user.firstName?.toLowerCase() || '').includes(searchLower) ||
      (user.lastName?.toLowerCase() || '').includes(searchLower) ||
      (user.email?.toLowerCase() || '').includes(searchLower) ||
      (user.employeeId?.toLowerCase() || '').includes(searchLower) ||
      (user.credentials?.username?.toLowerCase() || '').includes(searchLower);
    
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'nurse_manager': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'nurse': return 'bg-green-100 text-green-700 border-green-200';
      case 'physician': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'technician': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'viewer': return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusBadge = (status: UserStatus) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Active</Badge>;
      case 'inactive': return <Badge variant="outline" className="bg-slate-100 text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Inactive</Badge>;
      case 'suspended': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1"><UserX className="w-3 h-3" /> Suspended</Badge>;
      case 'locked': return <Badge variant="destructive" className="flex items-center gap-1"><Lock className="w-3 h-3" /> Locked</Badge>;
    }
  };

  const handleCreateUser = async () => {
    try {
      await createUser(newUser);
      toast.success('User created successfully');
      setShowUserDialog(false);
      setNewUser({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        employeeId: '',
        role: 'nurse',
        status: 'active',
        password: '',
        assignedStations: [],
        primaryStation: '',
      });
    } catch (error) {
      toast.error('Failed to create user');
    }
  };

  const handleCreateStation = async () => {
    try {
      await createStation(newStation);
      toast.success('Nurse station created successfully');
      setShowStationDialog(false);
      setNewStation({ name: '', unit: '', floor: '', roomRange: '', isActive: true });
    } catch (error) {
      toast.error('Failed to create station');
    }
  };

  const handleStatusChange = async () => {
    if (selectedUser && statusReason) {
      try {
        const newStatus = selectedUser.status === 'active' ? 'inactive' : 'active';
        await updateUserStatus(selectedUser.id, newStatus, statusReason);
        toast.success(`User status changed to ${newStatus}`);
        setShowStatusDialog(false);
        setStatusReason('');
        setSelectedUser(null);
      } catch (error) {
        toast.error('Failed to update status');
      }
    }
  };

  const handleAssignStations = async () => {
    if (selectedUser) {
      try {
        await assignStations(selectedUser.id, selectedUser.assignedStations, selectedUser.primaryStation);
        toast.success('Stations assigned successfully');
        setShowAssignDialog(false);
        setSelectedUser(null);
      } catch (error) {
        toast.error('Failed to assign stations');
      }
    }
  };

  const handlePasswordReset = async () => {
    if (!selectedUser) return;
    
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    setIsResetting(true);
    
    try {
      // Import userService dynamically to avoid circular dependency
      const { userService } = await import('@/services/userService');
      await userService.changePassword(selectedUser.id, newPassword);
      
      toast.success('Password reset successfully', {
        description: `Password for ${selectedUser.firstName} ${selectedUser.lastName} has been reset.`,
      });
      
      setShowPasswordResetDialog(false);
      setNewPassword('');
      setConfirmPassword('');
      setSelectedUser(null);
    } catch (error) {
      toast.error('Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  };

  const canManageUsers = currentUser?.role === 'admin' || currentUser?.role === 'nurse_manager';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6" />
            User Management
          </h2>
          <p className="text-slate-500">Manage users and nurse station assignments</p>
        </div>
        {canManageUsers && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowStationDialog(true)} className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Add Station
            </Button>
            <Button onClick={() => setShowUserDialog(true)} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add User
            </Button>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="stations" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Nurse Stations
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as UserRole | 'all')}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                  <SelectItem key={role} value={role}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as UserStatus | 'all')}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="locked">Locked</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Users Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Assigned Stations</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    {canManageUsers && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManageUsers ? 6 : 5} className="text-center py-8 text-slate-500">
                        <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                        <p>No users found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                              <span className="font-semibold text-slate-600">
                                {user.firstName[0]}{user.lastName[0]}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{user.firstName} {user.lastName}</p>
                              <p className="text-sm text-slate-500">{user.email}</p>
                              <p className="text-xs text-slate-400">ID: {user.employeeId}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getRoleBadgeColor(user.role)}>
                            {ROLE_LABELS[user.role]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.assignedStations.slice(0, 2).map(stationId => (
                              <Badge key={stationId} variant="outline" className="text-xs">
                                {getStationName(stationId)}
                              </Badge>
                            ))}
                            {user.assignedStations.length > 2 && (
                              <Badge variant="outline" className="text-xs">+{user.assignedStations.length - 2}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(user.status)}</TableCell>
                        <TableCell>
                          {user.credentials.lastLogin ? (
                            <span className="text-sm text-slate-600">
                              {new Date(user.credentials.lastLogin).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-400">Never</span>
                          )}
                        </TableCell>
                        {canManageUsers && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setSelectedUser(user); setShowPasswordResetDialog(true); }}
                                title="Reset Password"
                              >
                                <KeyRound className="w-4 h-4 text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setSelectedUser(user); setShowAssignDialog(true); }}
                                title="Assign Stations"
                              >
                                <MapPin className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setSelectedUser(user); setShowStatusDialog(true); }}
                                title={user.status === 'active' ? 'Deactivate' : 'Activate'}
                              >
                                {user.status === 'active' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stations Tab */}
        <TabsContent value="stations" className="space-y-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stations.map((station) => (
              <Card key={station.id} className={station.isActive ? '' : 'opacity-60'}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{station.name}</h3>
                      <p className="text-sm text-slate-500">{station.unit}</p>
                      {station.floor && <p className="text-xs text-slate-400">{station.floor}</p>}
                      {station.roomRange && <p className="text-xs text-slate-400">Rooms: {station.roomRange}</p>}
                    </div>
                    <Badge variant={station.isActive ? 'default' : 'outline'}>
                      {station.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm text-slate-600">
                      <Users className="w-4 h-4 inline mr-1" />
                      {users.filter(u => u.assignedStations.includes(station.id) && u.status === 'active').length} active users
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add User Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>Add a new user to the system</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={newUser.firstName} onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input value={newUser.lastName} onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Employee ID</Label>
              <Input value={newUser.employeeId} onChange={(e) => setNewUser({ ...newUser, employeeId: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as UserRole })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([role, label]) => (
                    <SelectItem key={role} value={role}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Assign Stations</Label>
              <div className="border rounded-lg p-3 space-y-2">
                {stations.filter(s => s.isActive).map((station) => (
                  <div key={station.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`station-${station.id}`}
                      checked={newUser.assignedStations.includes(station.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setNewUser({ ...newUser, assignedStations: [...newUser.assignedStations, station.id] });
                        } else {
                          setNewUser({ 
                            ...newUser, 
                            assignedStations: newUser.assignedStations.filter(id => id !== station.id),
                            primaryStation: newUser.primaryStation === station.id ? '' : newUser.primaryStation
                          });
                        }
                      }}
                    />
                    <Label htmlFor={`station-${station.id}`} className="cursor-pointer">{station.name}</Label>
                  </div>
                ))}
              </div>
            </div>
            {newUser.assignedStations.length > 0 && (
              <div className="space-y-2">
                <Label>Primary Station</Label>
                <Select value={newUser.primaryStation} onValueChange={(v) => setNewUser({ ...newUser, primaryStation: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select primary station" />
                  </SelectTrigger>
                  <SelectContent>
                    {newUser.assignedStations.map((stationId) => (
                      <SelectItem key={stationId} value={stationId}>
                        {getStationName(stationId)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleCreateUser}
              disabled={!newUser.firstName || !newUser.lastName || !newUser.email || !newUser.password}
            >
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Station Dialog */}
      <Dialog open={showStationDialog} onOpenChange={setShowStationDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Nurse Station</DialogTitle>
            <DialogDescription>Add a new nurse station</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Station Name</Label>
              <Input value={newStation.name} onChange={(e) => setNewStation({ ...newStation, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={newStation.unit} onValueChange={(v) => setNewStation({ ...newStation, unit: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NICU">NICU</SelectItem>
                  <SelectItem value="Pediatrics">Pediatrics</SelectItem>
                  <SelectItem value="Laboratory">Laboratory</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Floor</Label>
              <Input value={newStation.floor} onChange={(e) => setNewStation({ ...newStation, floor: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Room Range (optional)</Label>
              <Input value={newStation.roomRange} onChange={(e) => setNewStation({ ...newStation, roomRange: e.target.value })} placeholder="e.g., 101-110" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStationDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateStation} disabled={!newStation.name || !newStation.unit}>
              Create Station
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Stations Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Stations</DialogTitle>
            <DialogDescription>
              Assign nurse stations to {selectedUser?.firstName} {selectedUser?.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="border rounded-lg p-3 space-y-2">
              {stations.filter(s => s.isActive).map((station) => (
                <div key={station.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`assign-${station.id}`}
                    checked={selectedUser?.assignedStations?.includes(station.id)}
                    onCheckedChange={(checked) => {
                      if (selectedUser) {
                        if (checked) {
                          setSelectedUser({ 
                            ...selectedUser, 
                            assignedStations: [...(selectedUser.assignedStations || []), station.id] 
                          });
                        } else {
                          setSelectedUser({ 
                            ...selectedUser, 
                            assignedStations: (selectedUser.assignedStations || []).filter((id: string) => id !== station.id),
                            primaryStation: selectedUser.primaryStation === station.id ? '' : selectedUser.primaryStation
                          });
                        }
                      }
                    }}
                  />
                  <Label htmlFor={`assign-${station.id}`} className="cursor-pointer">{station.name}</Label>
                </div>
              ))}
            </div>
            {selectedUser?.assignedStations?.length > 0 && (
              <div className="space-y-2">
                <Label>Primary Station</Label>
                <Select 
                  value={selectedUser?.primaryStation || ''} 
                  onValueChange={(v) => setSelectedUser({ ...selectedUser, primaryStation: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select primary station" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedUser?.assignedStations?.map((stationId: string) => (
                      <SelectItem key={stationId} value={stationId}>
                        {getStationName(stationId)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
            <Button onClick={handleAssignStations}>Save Assignments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedUser?.status === 'active' ? 'Deactivate' : 'Activate'} User
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.status === 'active' 
                ? `Deactivate ${selectedUser?.firstName} ${selectedUser?.lastName}?`
                : `Activate ${selectedUser?.firstName} ${selectedUser?.lastName}?`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input 
                value={statusReason} 
                onChange={(e) => setStatusReason(e.target.value)} 
                placeholder="Enter reason for status change"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleStatusChange}
              disabled={!statusReason}
              variant={selectedUser?.status === 'active' ? 'destructive' : 'default'}
            >
              {selectedUser?.status === 'active' ? 'Deactivate' : 'Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={showPasswordResetDialog} onOpenChange={setShowPasswordResetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-blue-600" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              Reset password for {selectedUser?.firstName} {selectedUser?.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              <strong>Security Notice:</strong> This action will immediately change the user's password. 
              The user will need to be notified of their new password through secure channels.
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10 pr-10"
                  disabled={isResetting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  disabled={isResetting}
                />
              </div>
            </div>
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-sm text-red-500">Passwords do not match</p>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowPasswordResetDialog(false);
                setNewPassword('');
                setConfirmPassword('');
                setSelectedUser(null);
              }}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handlePasswordReset}
              disabled={!newPassword || newPassword.length < 8 || newPassword !== confirmPassword || isResetting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isResetting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Resetting...
                </>
              ) : (
                'Reset Password'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

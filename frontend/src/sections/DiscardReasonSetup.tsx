import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useDiscardReasons } from '@/hooks/useDiscardReasons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Settings2,
  Plus,
  Edit2,
  Trash2,
  Clock,
  AlertTriangle,
  Package,
  Barcode,
  User,
  AlertCircle,
  FileText,
  RotateCcw,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  Info,
} from 'lucide-react';
import type { DiscardReason } from '@/services/discardReasonService';

// Icon mapping
const ICON_MAP: Record<string, React.ElementType> = {
  Clock,
  AlertTriangle,
  Package,
  Barcode,
  User,
  AlertCircle,
  FileText,
  CheckCircle2,
  XCircle,
  Info,
};

const AVAILABLE_ICONS = [
  { value: 'Clock', label: 'Clock', description: 'For time-related reasons' },
  { value: 'AlertTriangle', label: 'Warning', description: 'For caution/alert reasons' },
  { value: 'Package', label: 'Package', description: 'For container issues' },
  { value: 'Barcode', label: 'Barcode', description: 'For labeling issues' },
  { value: 'User', label: 'User', description: 'For user/patient requests' },
  { value: 'AlertCircle', label: 'Alert Circle', description: 'For quality concerns' },
  { value: 'FileText', label: 'Document', description: 'For other/miscellaneous' },
  { value: 'CheckCircle2', label: 'Check', description: 'For positive actions' },
  { value: 'XCircle', label: 'X Circle', description: 'For rejection/cancellation' },
  { value: 'Info', label: 'Info', description: 'For informational reasons' },
];

export function DiscardReasonSetup() {
  const {
    reasons,
    isLoading,
    addReason,
    updateReason,
    toggleReasonActive,
    deleteReason,
    resetToDefaults,
    valueExists,
    exportReasons,
    importReasons,
  } = useDiscardReasons();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingReason, setEditingReason] = useState<DiscardReason | null>(null);
  const [deletingReason, setDeletingReason] = useState<DiscardReason | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importJson, setImportJson] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    value: '',
    label: '',
    description: '',
    iconName: 'FileText',
    requiresNotes: false,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFormData({
      value: '',
      label: '',
      description: '',
      iconName: 'FileText',
      requiresNotes: false,
    });
    setFormErrors({});
  };

  const openEditDialog = (reason: DiscardReason) => {
    setEditingReason(reason);
    setFormData({
      value: reason.value,
      label: reason.label,
      description: reason.description,
      iconName: reason.iconName,
      requiresNotes: reason.requiresNotes,
    });
    setFormErrors({});
  };

  const validateForm = (excludeId?: string): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.value.trim()) {
      errors.value = 'Value is required';
    } else if (!/^[a-z_]+$/.test(formData.value)) {
      errors.value = 'Value must be lowercase letters and underscores only';
    } else if (valueExists(formData.value, excludeId)) {
      errors.value = 'This value already exists';
    }

    if (!formData.label.trim()) {
      errors.label = 'Label is required';
    }

    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = () => {
    if (editingReason) {
      if (!validateForm(editingReason.id)) return;

      updateReason(editingReason.id, {
        value: formData.value,
        label: formData.label,
        description: formData.description,
        iconName: formData.iconName,
        requiresNotes: formData.requiresNotes,
      });

      toast.success('Discard reason updated', {
        description: `"${formData.label}" has been updated successfully.`,
      });
      setEditingReason(null);
    } else {
      if (!validateForm()) return;

      addReason({
        value: formData.value,
        label: formData.label,
        description: formData.description,
        iconName: formData.iconName,
        isActive: true,
        requiresNotes: formData.requiresNotes,
      });

      toast.success('Discard reason added', {
        description: `"${formData.label}" has been added successfully.`,
      });
      setShowAddDialog(false);
    }
    resetForm();
  };

  const handleDelete = () => {
    if (deletingReason) {
      const success = deleteReason(deletingReason.id);
      if (success) {
        toast.success('Discard reason deleted', {
          description: `"${deletingReason.label}" has been deleted.`,
        });
      } else {
        toast.error('Cannot delete default reason', {
          description: 'Default system reasons cannot be deleted.',
        });
      }
      setDeletingReason(null);
    }
  };

  const handleToggleActive = (reason: DiscardReason) => {
    toggleReasonActive(reason.id);
    toast.success(reason.isActive ? 'Reason deactivated' : 'Reason activated', {
      description: `"${reason.label}" is now ${reason.isActive ? 'inactive' : 'active'}.`,
    });
  };

  const handleReset = () => {
    resetToDefaults();
    toast.success('Reset to defaults', {
      description: 'All discard reasons have been reset to system defaults.',
    });
    setShowResetDialog(false);
  };

  const handleExport = () => {
    const json = exportReasons();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `discard-reasons-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Exported successfully', {
      description: 'Discard reasons have been exported to JSON.',
    });
  };

  const handleImport = () => {
    try {
      const success = importReasons(importJson);
      if (success) {
        toast.success('Imported successfully', {
          description: 'Discard reasons have been imported.',
        });
        setShowImportDialog(false);
        setImportJson('');
      } else {
        toast.error('Import failed', {
          description: 'Invalid JSON format.',
        });
      }
    } catch {
      toast.error('Import failed', {
        description: 'An error occurred while importing.',
      });
    }
  };

  const getIcon = (iconName: string) => {
    const Icon = ICON_MAP[iconName] || FileText;
    return Icon;
  };

  // Default reason IDs that cannot be deleted
  const defaultReasonIds = [
    'reason-expired',
    'reason-contaminated',
    'reason-broken-container',
    'reason-wrong-label',
    'reason-mother-request',
    'reason-quality-concern',
    'reason-other',
  ];

  const isDefaultReason = (id: string) => defaultReasonIds.includes(id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Settings2 className="w-7 h-7 text-[#003366]" />
            Discard Reasons Setup
          </h2>
          <p className="text-slate-500 mt-1">
            Manage discard reasons for milk inventory. Changes affect all users.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button variant="outline" onClick={() => setShowImportDialog(true)} className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Import
          </Button>
          <Button variant="outline" onClick={() => setShowResetDialog(true)} className="flex items-center gap-2 text-amber-600">
            <RotateCcw className="w-4 h-4" />
            Reset
          </Button>
          <Button onClick={() => { resetForm(); setShowAddDialog(true); }} className="flex items-center gap-2 bg-[#003366] hover:bg-[#003366]/90">
            <Plus className="w-4 h-4" />
            Add Reason
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-[#003366]">{reasons.length}</div>
            <div className="text-sm text-slate-500">Total Reasons</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-600">
              {reasons.filter(r => r.isActive).length}
            </div>
            <div className="text-sm text-slate-500">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-slate-400">
              {reasons.filter(r => !r.isActive).length}
            </div>
            <div className="text-sm text-slate-500">Inactive</div>
          </CardContent>
        </Card>
      </div>

      {/* Reasons List */}
      <Card>
        <CardHeader>
          <CardTitle>Discard Reasons</CardTitle>
          <CardDescription>
            Configure reasons for discarding milk containers. Active reasons appear in the discard dropdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : reasons.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No discard reasons configured.
            </div>
          ) : (
            <div className="space-y-3">
              {reasons.map((reason) => {
                const Icon = getIcon(reason.iconName);
                return (
                  <div
                    key={reason.id}
                    className={`flex items-center gap-4 p-4 rounded-lg border ${
                      reason.isActive ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      reason.isActive ? 'bg-[#003366]/10' : 'bg-slate-200'
                    }`}>
                      <Icon className={`w-5 h-5 ${reason.isActive ? 'text-[#003366]' : 'text-slate-400'}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{reason.label}</span>
                        {isDefaultReason(reason.id) && (
                          <Badge variant="outline" className="text-xs">Default</Badge>
                        )}
                        {reason.requiresNotes && (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                            Requires Notes
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-slate-500">{reason.description}</div>
                      <div className="text-xs text-slate-400 mt-1">Value: {reason.value}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 mr-4">
                        <Switch
                          checked={reason.isActive}
                          onCheckedChange={() => handleToggleActive(reason)}
                        />
                        <span className={`text-sm ${reason.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {reason.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(reason)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>

                      {!isDefaultReason(reason.id) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeletingReason(reason)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog || !!editingReason} onOpenChange={(open) => {
        if (!open) {
          setShowAddDialog(false);
          setEditingReason(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingReason ? 'Edit Discard Reason' : 'Add Discard Reason'}
            </DialogTitle>
            <DialogDescription>
              {editingReason
                ? 'Update the discard reason details.'
                : 'Create a new discard reason for milk containers.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Value (Internal ID) <span className="text-red-500">*</span></Label>
              <Input
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value.toLowerCase().replace(/[^a-z_]/g, '') })}
                placeholder="e.g., expired, broken_container"
                disabled={!!editingReason && isDefaultReason(editingReason.id)}
              />
              {formErrors.value && <p className="text-sm text-red-500">{formErrors.value}</p>}
              <p className="text-xs text-slate-500">Lowercase letters and underscores only. Cannot be changed for default reasons.</p>
            </div>

            <div className="space-y-2">
              <Label>Label <span className="text-red-500">*</span></Label>
              <Input
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="e.g., Expired, Broken Container"
              />
              {formErrors.label && <p className="text-sm text-red-500">{formErrors.label}</p>}
            </div>

            <div className="space-y-2">
              <Label>Description <span className="text-red-500">*</span></Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the reason"
              />
              {formErrors.description && <p className="text-sm text-red-500">{formErrors.description}</p>}
            </div>

            <div className="space-y-2">
              <Label>Icon</Label>
              <Select
                value={formData.iconName}
                onValueChange={(v) => setFormData({ ...formData, iconName: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_ICONS.map((icon) => (
                    <SelectItem key={icon.value} value={icon.value}>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const Icon = ICON_MAP[icon.value] || FileText;
                          return <Icon className="w-4 h-4" />;
                        })()}
                        <span>{icon.label}</span>
                        <span className="text-xs text-slate-400">- {icon.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Switch
                checked={formData.requiresNotes}
                onCheckedChange={(v) => setFormData({ ...formData, requiresNotes: v })}
              />
              <div>
                <div className="font-medium text-sm">Requires Additional Notes</div>
                <div className="text-xs text-slate-500">
                  When enabled, users must provide additional notes when selecting this reason.
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddDialog(false);
              setEditingReason(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-[#003366] hover:bg-[#003366]/90">
              {editingReason ? 'Save Changes' : 'Add Reason'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingReason} onOpenChange={() => setDeletingReason(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Discard Reason?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingReason?.label}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Confirmation */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset all discard reasons to system defaults. Any custom reasons you've added will be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} className="bg-amber-600 hover:bg-amber-700">
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Discard Reasons</DialogTitle>
            <DialogDescription>
              Paste the JSON content to import discard reasons. This will replace all existing reasons.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Paste JSON here..."
              className="w-full h-48 p-3 border rounded-lg font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportDialog(false); setImportJson(''); }}>
              Cancel
            </Button>
            <Button onClick={handleImport} className="bg-[#003366] hover:bg-[#003366]/90">
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { type HealthMetric, type MetricType, type ThresholdOperator } from '@/lib/healthTypes';
import { useHealthConfig } from '@/contexts/HealthConfigContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { db } from '@/demo/db';
import { getImpactedAccountIds } from '@/lib/healthRecalculation';
import { RecalculateConfirmDialog } from './RecalculateConfirmDialog';
import { toast } from 'sonner';

const operators: ThresholdOperator[] = ['<', '<=', '>', '>=', '='];
const typeLabels: Record<MetricType, string> = { number: 'Number', percentage: 'Percentage', boolean: 'Boolean' };

function ThresholdCell({ rule, metricType, onChange }: {
  rule: { operator: ThresholdOperator; value: number };
  metricType: MetricType;
  onChange: (patch: Partial<{ operator: ThresholdOperator; value: number }>) => void;
}) {
  return (
    <div className="flex items-center gap-1 justify-center">
      <Select value={rule.operator} onValueChange={(v) => onChange({ operator: v as ThresholdOperator })}>
        <SelectTrigger className="h-7 w-14 text-xs font-mono px-2 gap-1 [&>svg]:h-3 [&>svg]:w-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map(op => <SelectItem key={op} value={op} className="text-xs font-mono">{op}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input type="number" className="h-7 w-16 text-center text-xs font-mono" value={rule.value} onChange={e => onChange({ value: Number(e.target.value) })} />
      {metricType === 'percentage' && <span className="text-xs text-muted-foreground">%</span>}
    </div>
  );
}

function SortableRow({ m, setMetrics, setDeleteId, handleTypeChange, updateThreshold }: {
  m: HealthMetric;
  setMetrics: React.Dispatch<React.SetStateAction<HealthMetric[]>>;
  setDeleteId: (id: string) => void;
  handleTypeChange: (id: string, t: MetricType) => void;
  updateThreshold: (id: string, band: 'poor' | 'concerning' | 'healthy', patch: Partial<{ operator: ThresholdOperator; value: number }>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-muted/30 border-b">
      <td className="px-1 py-2 align-middle w-8">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </td>
      <td className="px-2 py-2 border-r align-top">
        <div className="flex items-center justify-between mb-1">
          <input className="text-sm font-medium bg-transparent border-b border-transparent hover:border-border focus:border-foreground focus:outline-none w-full mr-2" value={m.name} onChange={e => setMetrics(prev => prev.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} />
          <button onClick={() => setDeleteId(m.id)} className="text-muted-foreground hover:text-primary shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        <input className="text-xs text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-foreground focus:outline-none w-full mb-1" value={m.source} placeholder="Source..." onChange={e => setMetrics(prev => prev.map(x => x.id === m.id ? { ...x, source: e.target.value } : x))} />
        <Select value={m.type} onValueChange={(v) => handleTypeChange(m.id, v as MetricType)}>
          <SelectTrigger className="h-6 text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0 gap-1 w-auto min-w-0 [&>svg]:h-3 [&>svg]:w-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(typeLabels).map(([val, label]) => <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground align-middle">{m.weight}%</td>
      {m.type === 'boolean' ? (
        <td colSpan={3} className="px-3 py-2 border-l align-middle">
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground">true =</span>
            <Switch checked={m.booleanHealthyValue !== false} onCheckedChange={checked => setMetrics(prev => prev.map(x => x.id === m.id ? { ...x, booleanHealthyValue: checked } : x))} />
            <span className={`text-xs font-medium ${m.booleanHealthyValue !== false ? 'text-emerald-700' : 'text-red-700'}`}>{m.booleanHealthyValue !== false ? 'Healthy' : 'Poor'}</span>
          </div>
        </td>
      ) : (
        <>
          <td className="px-3 py-2 border-x align-middle"><ThresholdCell rule={m.poor} metricType={m.type} onChange={patch => updateThreshold(m.id, 'poor', patch)} /></td>
          <td className="px-3 py-2 border-r align-middle"><ThresholdCell rule={m.concerning} metricType={m.type} onChange={patch => updateThreshold(m.id, 'concerning', patch)} /></td>
          <td className="px-3 py-2 align-middle"><ThresholdCell rule={m.healthy} metricType={m.type} onChange={patch => updateThreshold(m.id, 'healthy', patch)} /></td>
        </>
      )}
    </tr>
  );
}

export function HealthConfigureTab() {
  const {
    metrics, setMetrics, saving, saveMetrics,
    profiles, activeProfile, activeProfileId, setActiveProfileId,
  } = useHealthConfig();
  const [newName, setNewName] = useState('');
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [savedSinceLoad, setSavedSinceLoad] = useState(false);
  const [recalcOpen, setRecalcOpen] = useState(false);
  const [recalcAccountIds, setRecalcAccountIds] = useState<string[]>([]);
  const [resolvingImpact, setResolvingImpact] = useState(false);

  const totalWeight = metrics.reduce((s, m) => s + m.weight, 0);
  const weightsValid = totalWeight === 100;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setMetrics(prev => {
        const oldIndex = prev.findIndex(m => m.id === active.id);
        const newIndex = prev.findIndex(m => m.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleWeightChange = (id: string, newWeight: number) => {
    setMetrics(prev => prev.map(m => m.id === id ? { ...m, weight: newWeight } : m));
  };

  const updateThreshold = (id: string, band: 'poor' | 'concerning' | 'healthy', patch: Partial<{ operator: ThresholdOperator; value: number }>) => {
    setMetrics(prev => prev.map(m => m.id === id ? { ...m, [band]: { ...m[band], ...patch } } : m));
  };

  const handleTypeChange = (id: string, newType: MetricType) => {
    setMetrics(prev => prev.map(m => {
      if (m.id !== id) return m;
      if (newType === 'boolean') return { ...m, type: newType, booleanHealthyValue: true, poor: { operator: '<', value: 0 }, concerning: { operator: '<', value: 0 }, healthy: { operator: '>=', value: 0 } };
      return { ...m, type: newType, poor: { operator: '<', value: 30 }, concerning: { operator: '<', value: 70 }, healthy: { operator: '>=', value: 70 } };
    }));
  };

  const handleInlineAdd = () => {
    const name = newName.trim();
    if (!name) return;
    setMetrics(prev => [...prev, { id: `hm-${Date.now()}`, name, icon: 'eye', source: name, weight: 0, type: 'number', poor: { operator: '<', value: 30 }, concerning: { operator: '<', value: 70 }, healthy: { operator: '>=', value: 70 } }]);
    setNewName('');
  };

  const handleSaveAndMarkDirty = async () => {
    await saveMetrics();
    setSavedSinceLoad(true);
  };

  const handleOpenRecalc = async () => {
    if (!activeProfile) return;
    setResolvingImpact(true);
    try {
      const { data: oid } = await db.rpc('get_user_org_id');
      if (!oid) { toast.error('Could not determine your organization.'); return; }
      if (activeProfile.id === 'default-pending') {
        toast.error('Save the profile first.');
        return;
      }
      const ids = await getImpactedAccountIds({
        orgId: oid,
        profileId: activeProfile.id,
        includeUnstagedIfDefault: true,
        isDefaultProfile: !!activeProfile.isDefault,
      });
      setRecalcAccountIds(ids);
      setRecalcOpen(true);
    } finally {
      setResolvingImpact(false);
    }
  };

  return (
    <>
      {/* Profile selector */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-medium text-muted-foreground">Profile</span>
        <Select value={activeProfileId ?? ''} onValueChange={setActiveProfileId}>
          <SelectTrigger className="h-8 w-[180px] text-sm"><SelectValue placeholder="Select profile…" /></SelectTrigger>
          <SelectContent>
            {profiles.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (default)' : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeProfile && (
          <span className="text-xs text-muted-foreground">
            Stages: {activeProfile.stages.length > 0 ? activeProfile.stages.join(', ') : <span className="italic">none</span>}
          </span>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={() => setWeightsOpen(true)} variant="outline">Default Weights</Button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Define health score categories, weights, and thresholds for the selected profile.</p>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="w-8 bg-muted/30" />
                <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground w-[320px] border-r bg-muted/30">Health Scores</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-20 bg-muted/30">Weight</th>
                <th className="text-center px-3 py-2 text-xs font-medium bg-red-50 text-red-700 border-x">Poor</th>
                <th className="text-center px-3 py-2 text-xs font-medium bg-yellow-50 text-yellow-700 border-r">Concerning</th>
                <th className="text-center px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700">Healthy</th>
              </tr>
            </thead>
            <tbody>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={metrics.map(m => m.id)} strategy={verticalListSortingStrategy}>
                  {metrics.map(m => (
                    <SortableRow key={m.id} m={m} setMetrics={setMetrics} setDeleteId={setDeleteId} handleTypeChange={handleTypeChange} updateThreshold={updateThreshold} />
                  ))}
                </SortableContext>
              </DndContext>
              <tr>
                <td />
                <td className="px-2 py-2 border-r" colSpan={5}>
                  <div className="flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input className="text-sm text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-foreground focus:outline-none w-full placeholder:text-muted-foreground/60" placeholder="New metric..." value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleInlineAdd(); }} onBlur={handleInlineAdd} />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="flex items-center justify-between px-3 py-3 border-t gap-3">
            <div className="flex flex-col">
              {!weightsValid ? (
                <span className="text-xs text-destructive">Weights must total 100% (currently {totalWeight}%)</span>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">
                    New logs will use these weights. Past logs keep the configuration they were saved with.
                  </span>
                  {savedSinceLoad && activeProfile && activeProfile.id !== 'default-pending' && (
                    <button
                      type="button"
                      onClick={handleOpenRecalc}
                      disabled={resolvingImpact}
                      className="text-xs text-foreground hover:underline underline-offset-2 decoration-muted-foreground/40 mt-1 text-left disabled:opacity-50"
                    >
                      {resolvingImpact ? 'Resolving impacted accounts…' : 'Recalculate latest score for accounts using this profile →'}
                    </button>
                  )}
                </>
              )}
            </div>
            <Button size="sm" onClick={handleSaveAndMarkDirty} disabled={saving || !weightsValid}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Weights Dialog */}
      <Dialog open={weightsOpen} onOpenChange={setWeightsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-sm font-semibold">Default Weights</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">An account's overall health is calculated using a weighted average. Be sure your total weight equals 100%!</p>
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total</span>
              <span className={`text-sm font-mono font-semibold ${totalWeight === 100 ? 'text-emerald-600' : 'text-destructive'}`}>{totalWeight}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(totalWeight, 100)}%` }} />
            </div>
            <div className="divide-y">
              {metrics.map(m => (
                <div key={m.id} className="flex items-center gap-3 py-3">
                  <span className="text-xs font-medium w-28 truncate">{m.name}</span>
                  <Slider className="flex-1" value={[m.weight]} max={100} step={5} onValueChange={([v]) => handleWeightChange(m.id, v)} />
                  <span className="text-sm font-mono w-10 text-right">{m.weight}%</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter><Button size="sm" onClick={() => setWeightsOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete health metric</AlertDialogTitle>
            <AlertDialogDescription>This will remove "{metrics.find(m => m.id === deleteId)?.name}" from your health score configuration.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setMetrics(prev => prev.filter(m => m.id !== deleteId)); setDeleteId(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {activeProfile && (
        <RecalculateConfirmDialog
          open={recalcOpen}
          onOpenChange={setRecalcOpen}
          accountIds={recalcAccountIds}
          profileId={activeProfile.id}
          profileName={activeProfile.name}
          metrics={activeProfile.metrics}
          contextLabel={`${activeProfile.name} profile`}
        />
      )}
    </>
  );
}

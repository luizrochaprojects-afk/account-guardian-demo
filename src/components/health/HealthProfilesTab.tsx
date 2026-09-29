import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Plus, Settings2, Tag, Trash2, RefreshCw } from 'lucide-react';
import { useHealthConfig } from '@/contexts/HealthConfigContext';
import { type HealthProfile } from '@/lib/healthTypes';
import { db } from '@/demo/db';
import { getImpactedAccountIds } from '@/lib/healthRecalculation';
import { PIPELINE_PHASES } from '@/lib/pipelinePhases';
import { RecalculateConfirmDialog } from './RecalculateConfirmDialog';
import { toast } from 'sonner';

/**
 * The stage catalog comes from PIPELINE_PHASES — the same source the board and
 * `accounts.pipeline_stage` use — so this picker can only ever offer stages an
 * account can actually be in.
 *
 * It used to be a hard-coded SYSTEM_STAGES list of the pre-2026-05 lifecycle
 * labels ('Lead', 'Pilot — Setup', 'Customer', …). When the column was retyped
 * to the `pipeline_stage` enum, this list kept offering labels that no account
 * could hold, so every mapping made here silently matched nothing.
 */
const KNOWN_STAGES = new Set(PIPELINE_PHASES.flatMap(p => p.stages.map(s => s.key as string)));

const STAGE_LABEL_BY_KEY = new Map(
  PIPELINE_PHASES.flatMap(p => p.stages.map(s => [s.key as string, s.label] as const)),
);

/** Falls through to the raw value so a stray legacy label stays visible. */
const stageText = (key: string) => STAGE_LABEL_BY_KEY.get(key) ?? key;

interface StagePickerProps {
  /** Stages currently ticked in the draft. */
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** stage → the profile that currently owns it, for the "already mapped" hint. */
  stageOwner: Map<string, HealthProfile>;
  /** Profile being edited, so we don't label its own stages as owned elsewhere. */
  currentProfileId?: string;
  /** Legacy/unrecognised stage values still stored against profiles. */
  strayStages: string[];
}

/**
 * Stages grouped by pipeline phase, which is how people think about them
 * ("customers get the customer metrics"), with a per-phase select-all so
 * mapping a whole phase is one click rather than five.
 */
function StagePicker({ selected, onChange, stageOwner, currentProfileId, strayStages }: StagePickerProps) {
  const toggle = (stage: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(stage); else next.delete(stage);
    onChange(next);
  };

  const setMany = (stages: string[], on: boolean) => {
    const next = new Set(selected);
    stages.forEach(s => { if (on) next.add(s); else next.delete(s); });
    onChange(next);
  };

  const renderStage = (key: string, label: string) => {
    const owner = stageOwner.get(key);
    const ownedByOther = owner && owner.id !== currentProfileId;
    return (
      <label key={key} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/30 rounded-sm px-1 py-0.5">
        <Checkbox checked={selected.has(key)} onCheckedChange={val => toggle(key, !!val)} />
        <span className="flex-1 truncate">{label}</span>
        {ownedByOther && <span className="text-[10px] text-muted-foreground shrink-0">in {owner.name}</span>}
      </label>
    );
  };

  return (
    <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
      {PIPELINE_PHASES.map(phase => {
        const keys = phase.stages.map(s => s.key as string);
        const allOn = keys.every(k => selected.has(k));
        return (
          <div key={phase.phase}>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{phase.label}</h4>
              <button
                type="button"
                onClick={() => setMany(keys, !allOn)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                {allOn ? 'Clear' : 'Select all'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {phase.stages.map(s => renderStage(s.key as string, s.label))}
            </div>
          </div>
        );
      })}

      {strayStages.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Unrecognised
          </h4>
          <p className="text-[10px] text-muted-foreground mb-1">
            Left over from the old lifecycle labels. No account can be in these — untick to drop them.
          </p>
          <div className="grid grid-cols-2 gap-1">
            {strayStages.map(s => renderStage(s, s))}
          </div>
        </div>
      )}
    </div>
  );
}

export function HealthProfilesTab() {
  const navigate = useNavigate();
  const {
    profiles,
    setActiveProfileId,
    createProfile,
    renameProfile,
    deleteProfile,
    setProfileStages,
  } = useHealthConfig();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStages, setNewStages] = useState<Set<string>>(new Set());
  const [copyFromId, setCopyFromId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const [stagesProfile, setStagesProfile] = useState<HealthProfile | null>(null);
  const [stagesDraft, setStagesDraft] = useState<Set<string>>(new Set());
  const [savingStages, setSavingStages] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<HealthProfile | null>(null);

  const [recalcProfile, setRecalcProfile] = useState<HealthProfile | null>(null);
  const [recalcAccountIds, setRecalcAccountIds] = useState<string[]>([]);
  const [resolvingFor, setResolvingFor] = useState<string | null>(null);

  const openRecalcFor = async (p: HealthProfile) => {
    if (p.id === 'default-pending') {
      toast.error('Save the profile first.');
      return;
    }
    setResolvingFor(p.id);
    try {
      const { data: oid } = await db.rpc('get_user_org_id');
      if (!oid) { toast.error('Could not determine your organization.'); return; }
      const ids = await getImpactedAccountIds({
        orgId: oid,
        profileId: p.id,
        includeUnstagedIfDefault: true,
        isDefaultProfile: !!p.isDefault,
      });
      setRecalcAccountIds(ids);
      setRecalcProfile(p);
    } finally {
      setResolvingFor(null);
    }
  };

  const stageOwner = useMemo(() => {
    const m = new Map<string, HealthProfile>();
    profiles.forEach(p => p.stages.forEach(s => m.set(s, p)));
    return m;
  }, [profiles]);

  // Values stored against a profile that aren't in the enum — the pre-migration
  // labels. Surfaced so they can be cleared rather than sitting there matching
  // nothing.
  const strayStages = useMemo(
    () => Array.from(new Set(profiles.flatMap(p => p.stages))).filter(s => !KNOWN_STAGES.has(s)),
    [profiles],
  );

  // A real stage no profile claims: accounts there are simply not scored.
  const unmappedStages = useMemo(
    () => Array.from(KNOWN_STAGES).filter(s => !stageOwner.has(s)),
    [stageOwner],
  );

  const openStagesDialog = (p: HealthProfile) => {
    setStagesProfile(p);
    setStagesDraft(new Set(p.stages));
  };

  const handleSaveStages = async () => {
    if (!stagesProfile) return;
    setSavingStages(true);
    await setProfileStages(stagesProfile.id, Array.from(stagesDraft));
    setSavingStages(false);
    setStagesProfile(null);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const id = await createProfile(name, Array.from(newStages), copyFromId || undefined);
    setCreating(false);
    if (id) {
      setNewName('');
      setNewStages(new Set());
      setCopyFromId('');
      setCreateOpen(false);
    }
  };

  const goToConfigureFor = (id: string) => {
    setActiveProfileId(id);
    navigate('/health-config?tab=configure');
  };

  const assignUnmappedTo = async (stage: string, profileId: string) => {
    const target = profiles.find(p => p.id === profileId);
    if (!target) return;
    const next = new Set(target.stages);
    next.add(stage);
    await setProfileStages(profileId, Array.from(next));
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">Profiles</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Group lifecycle stages and give each group its own scoring metrics.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> New profile
        </Button>
      </div>

      <div className="space-y-2">
        {profiles.map(p => {
          const canDelete = !p.isDefault && p.stages.length === 0 && p.id !== 'default-pending';
          const isPending = p.id === 'default-pending';
          return (
            <Card key={p.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {renamingId === p.id ? (
                        <>
                          <Input className="h-7 text-sm max-w-[220px]" value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus />
                          <Button size="sm" className="h-7" onClick={async () => { await renameProfile(p.id, renameValue); setRenamingId(null); }}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => setRenamingId(null)}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-medium truncate">{p.name}</span>
                          {p.isDefault && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                          {!isPending && (
                            <button
                              onClick={() => { setRenamingId(p.id); setRenameValue(p.name); }}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Rename profile"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.metrics.length} {p.metrics.length === 1 ? 'metric' : 'metrics'} · {p.stages.length} {p.stages.length === 1 ? 'stage mapped' : 'stages mapped'}
                    </p>
                    <p className="text-xs mt-1">
                      {p.stages.length > 0
                        ? <span className="text-foreground">Stages: {p.stages.map(stageText).join(', ')}</span>
                        : <span className="italic text-muted-foreground">No stages mapped</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => goToConfigureFor(p.id)}>
                      <Settings2 className="h-3.5 w-3.5" /> Edit metrics
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => openStagesDialog(p)} disabled={isPending}>
                      <Tag className="h-3.5 w-3.5" /> Edit stages
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1"
                      onClick={() => openRecalcFor(p)}
                      disabled={isPending || resolvingFor === p.id || p.metrics.length === 0}
                      title={p.metrics.length === 0 ? 'No metrics on this profile' : 'Recalculate scores for accounts using this profile'}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${resolvingFor === p.id ? 'animate-spin' : ''}`} /> Recalculate
                    </Button>
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(p)}
                        aria-label="Delete profile"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">Unmapped stages</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Accounts in these stages are not scored — their Health tab says so rather than showing a
          number from someone else's metrics.
        </p>
        {unmappedStages.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Every stage is mapped to a profile.</p>
        ) : (
          <Card>
            <CardContent className="p-3 space-y-2">
              {unmappedStages.map(stage => (
                <div key={stage} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{stageText(stage)}</span>
                  <Select onValueChange={(val) => assignUnmappedTo(stage, val)}>
                    <SelectTrigger className="h-7 w-[200px] text-xs"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                    <SelectContent>
                      {profiles.filter(p => p.id !== 'default-pending').map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (default)' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create profile dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">New profile</DialogTitle>
            <DialogDescription className="text-xs">Name this scoring profile and optionally assign stages or copy an existing metric set.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input className="h-8 text-sm mt-1" placeholder="e.g. Pilot" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Copy metrics from</label>
              <Select value={copyFromId || 'none'} onValueChange={(v) => setCopyFromId(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Start empty" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Start with no metrics</SelectItem>
                  {profiles.filter(p => p.id !== 'default-pending' && p.metrics.length > 0).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.metrics.length})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Stages to assign</label>
              <p className="text-[11px] text-muted-foreground mt-0.5">Reassigning a stage moves it from its current profile.</p>
              <div className="mt-1">
                <StagePicker
                  selected={newStages}
                  onChange={setNewStages}
                  stageOwner={stageOwner}
                  strayStages={strayStages}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || creating}>{creating ? 'Creating…' : 'Create profile'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit stages dialog */}
      <Dialog open={!!stagesProfile} onOpenChange={(open) => !open && setStagesProfile(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Stages for {stagesProfile?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Stages already mapped to another profile will be reassigned here.
            </DialogDescription>
          </DialogHeader>
          <StagePicker
            selected={stagesDraft}
            onChange={setStagesDraft}
            stageOwner={stageOwner}
            currentProfileId={stagesProfile?.id}
            strayStages={strayStages}
          />
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setStagesProfile(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveStages} disabled={savingStages}>{savingStages ? 'Saving…' : 'Save stages'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete profile</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}" and its metric configuration. Existing logs captured under this profile will remain visible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteTarget) await deleteProfile(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {recalcProfile && (
        <RecalculateConfirmDialog
          open={!!recalcProfile}
          onOpenChange={(open) => { if (!open) setRecalcProfile(null); }}
          accountIds={recalcAccountIds}
          profileId={recalcProfile.id}
          profileName={recalcProfile.name}
          metrics={recalcProfile.metrics}
          contextLabel={`${recalcProfile.name} profile`}
        />
      )}
    </>
  );
}
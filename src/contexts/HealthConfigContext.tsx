import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { type HealthMetric, type HealthProfile, defaultHealthMetrics } from '@/lib/healthTypes';
import { db } from '@/demo/db';
import { DEFAULT_SCORED_STAGES, resolveProfileForStage } from '@/lib/healthProfiles';
import { toast } from 'sonner';
import type { Database } from '@/types/database';

type PipelineStage = Database['public']['Enums']['pipeline_stage'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (v: string) => UUID_RE.test(v);

interface HealthConfigContextType {
  /** All profiles for the org */
  profiles: HealthProfile[];
  /** Currently active profile in the configure UI */
  activeProfileId: string | null;
  setActiveProfileId: (id: string) => void;
  /** Active profile (or first profile, or null) */
  activeProfile: HealthProfile | null;
  /** Metrics of the active profile (back-compat shim) */
  metrics: HealthMetric[];
  /** Replace metrics on the active profile in local state */
  setMetrics: (updater: HealthMetric[] | ((prev: HealthMetric[]) => HealthMetric[])) => void;
  loading: boolean;
  saving: boolean;
  /** Save the active profile's metrics */
  saveMetrics: () => Promise<void>;
  refetch: () => Promise<void>;

  /**
   * Resolve the scoring profile for an account by its `pipeline_stage`.
   * `null` means the stage belongs to no profile — the account is not scored,
   * which is NOT the same as "use the default". See `resolveProfileForStage`.
   */
  getProfileForStage: (stage: string | null | undefined) => HealthProfile | null;

  /** Profile management */
  createProfile: (name: string, stages: string[], copyFromProfileId?: string) => Promise<string | null>;
  renameProfile: (id: string, name: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  setProfileStages: (id: string, stages: string[]) => Promise<void>;
}

const HealthConfigContext = createContext<HealthConfigContextType | null>(null);

function rowToMetric(d: any): HealthMetric {
  return {
    id: d.id,
    name: d.name,
    icon: d.icon,
    source: d.source,
    weight: d.weight,
    type: d.type,
    poor: d.poor,
    concerning: d.concerning,
    healthy: d.healthy,
    booleanHealthyValue: d.boolean_healthy_value,
    profileId: d.profile_id ?? undefined,
  };
}

export function HealthConfigProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<HealthProfile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  const ensureOrgId = useCallback(async (): Promise<string | null> => {
    if (orgId) return orgId;
    const { data } = await db.rpc('get_user_org_id');
    if (data) setOrgId(data);
    return data ?? null;
  }, [orgId]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const oid = await ensureOrgId();
      if (!oid) { setLoading(false); return; }

      // Fetch profiles
      const { data: profileRows } = await db
        .from('health_metric_profiles')
        .select('*')
        .eq('organization_id', oid)
        .order('position', { ascending: true });

      // Fetch all stage mappings + metrics in parallel
      const [{ data: stageRows }, { data: metricRows }] = await Promise.all([
        db.from('health_profile_stages').select('*').eq('organization_id', oid),
        db.from('health_metrics').select('*').eq('organization_id', oid).order('position', { ascending: true }),
      ]);

      let nextProfiles: HealthProfile[] = (profileRows || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        isDefault: p.is_default,
        position: p.position,
        stages: (stageRows || []).filter((s: any) => s.profile_id === p.id).map((s: any) => s.stage),
        metrics: (metricRows || []).filter((m: any) => m.profile_id === p.id).map(rowToMetric),
      }));

      // First-time setup: no profiles exist yet → create a Default profile in memory with default metrics
      if (nextProfiles.length === 0) {
        nextProfiles = [{
          id: 'default-pending',
          name: 'Default',
          isDefault: true,
          position: 0,
          // Derived from PIPELINE_PHASES rather than spelled out: the literal
          // list this replaced is the same shape that drifted out of the enum
          // in the first place. StageDef.key is already typed PipelineStage, so
          // the derivation carries the same guarantee a `satisfies` would.
          stages: [...DEFAULT_SCORED_STAGES],
          metrics: defaultHealthMetrics.map(m => ({ ...m })),
        }];
      }

      setProfiles(nextProfiles);
      setActiveProfileIdState(prev => prev && nextProfiles.find(p => p.id === prev) ? prev : nextProfiles[0]?.id ?? null);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [ensureOrgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const activeProfile = useMemo(
    () => profiles.find(p => p.id === activeProfileId) || profiles[0] || null,
    [profiles, activeProfileId]
  );
  const metrics = activeProfile?.metrics ?? [];

  const setActiveProfileId = useCallback((id: string) => setActiveProfileIdState(id), []);

  const setMetrics: HealthConfigContextType['setMetrics'] = useCallback((updater) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== (activeProfileId || prev[0]?.id)) return p;
      const next = typeof updater === 'function' ? (updater as (prev: HealthMetric[]) => HealthMetric[])(p.metrics) : updater;
      return { ...p, metrics: next };
    }));
  }, [activeProfileId]);

  const saveMetrics = useCallback(async () => {
    const oid = await ensureOrgId();
    if (!oid) { toast.error('Could not determine organization.'); return; }
    if (!activeProfile) { toast.error('No profile selected.'); return; }

    setSaving(true);
    try {
      let profileId = activeProfile.id;

      // If active profile is the in-memory default, persist it first
      if (profileId === 'default-pending') {
        const { data: created, error: pErr } = await db
          .from('health_metric_profiles')
          .insert({ organization_id: oid, name: activeProfile.name, is_default: true, position: 0 })
          .select('id')
          .single();
        if (pErr || !created) throw pErr || new Error('Failed to create profile');
        profileId = created.id;

        // Persist its stage mappings
        if (activeProfile.stages.length > 0) {
          const stageRows = activeProfile.stages.map(s => ({ organization_id: oid, profile_id: profileId, stage: s as PipelineStage }));
          await db.from('health_profile_stages').upsert(stageRows, { onConflict: 'organization_id,stage' });
        }
      }

      // Replace this profile's metrics
      await db.from('health_metrics').delete().eq('organization_id', oid).eq('profile_id', profileId);

      const rows = activeProfile.metrics.map((m, i) => ({
        ...(isValidUUID(m.id) ? { id: m.id } : {}),
        organization_id: oid,
        profile_id: profileId,
        name: m.name,
        icon: m.icon,
        source: m.source,
        weight: m.weight,
        type: m.type,
        poor: m.poor,
        concerning: m.concerning,
        healthy: m.healthy,
        boolean_healthy_value: m.booleanHealthyValue ?? true,
        position: i,
      }));

      if (rows.length > 0) {
        const { error } = await db.from('health_metrics').insert(rows as any);
        if (error) throw error;
      }
      toast.success('Health metrics saved.');
      await fetchAll();
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to save metrics.');
    }
    setSaving(false);
  }, [activeProfile, ensureOrgId, fetchAll]);

  const getProfileForStage = useCallback(
    (stage: string | null | undefined) => resolveProfileForStage(profiles, stage),
    [profiles],
  );

  const createProfile = useCallback(async (name: string, stages: string[], copyFromProfileId?: string): Promise<string | null> => {
    const oid = await ensureOrgId();
    if (!oid) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    const { data, error } = await db
      .from('health_metric_profiles')
      .insert({ organization_id: oid, name: trimmed, is_default: false, position: profiles.length })
      .select('id')
      .single();
    if (error || !data) { toast.error('Failed to create profile.'); return null; }

    if (stages.length > 0) {
      // Reassign stages from any existing profiles to this one (unique constraint on stage)
      await db.from('health_profile_stages').delete().eq('organization_id', oid).in('stage', stages as PipelineStage[]);
      const rows = stages.map(s => ({ organization_id: oid, profile_id: data.id, stage: s as PipelineStage }));
      await db.from('health_profile_stages').insert(rows);
    }

    // Optionally clone metrics from another profile
    if (copyFromProfileId) {
      const source = profiles.find(p => p.id === copyFromProfileId);
      if (source && source.metrics.length > 0) {
        const rows = source.metrics.map((m, i) => ({
          organization_id: oid,
          profile_id: data.id,
          name: m.name,
          icon: m.icon,
          source: m.source,
          weight: m.weight,
          type: m.type,
          poor: m.poor,
          concerning: m.concerning,
          healthy: m.healthy,
          boolean_healthy_value: m.booleanHealthyValue ?? true,
          position: i,
        }));
        const { error: copyErr } = await db.from('health_metrics').insert(rows as any);
        if (copyErr) { console.error(copyErr); toast.error('Profile created, but failed to copy metrics.'); }
      }
    }

    toast.success('Profile created.');
    await fetchAll();
    setActiveProfileIdState(data.id);
    return data.id;
  }, [ensureOrgId, profiles, fetchAll]);

  const renameProfile = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error } = await db.from('health_metric_profiles').update({ name: trimmed }).eq('id', id);
    if (error) { toast.error('Failed to rename profile.'); return; }
    await fetchAll();
  }, [fetchAll]);

  const deleteProfile = useCallback(async (id: string) => {
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;
    if (profile.isDefault) { toast.error('Cannot delete the Default profile.'); return; }
    if (profile.stages.length > 0) { toast.error('Reassign mapped stages before deleting.'); return; }
    const { error } = await db.from('health_metric_profiles').delete().eq('id', id);
    if (error) { toast.error('Failed to delete profile.'); return; }
    toast.success('Profile deleted.');
    await fetchAll();
  }, [profiles, fetchAll]);

  const setProfileStages = useCallback(async (id: string, stages: string[]) => {
    const oid = await ensureOrgId();
    if (!oid) return;
    // Remove any existing mapping for these stages (any profile), then add for this one
    await db.from('health_profile_stages').delete().eq('organization_id', oid).eq('profile_id', id);
    if (stages.length > 0) {
      await db.from('health_profile_stages').delete().eq('organization_id', oid).in('stage', stages as PipelineStage[]);
      const rows = stages.map(s => ({ organization_id: oid, profile_id: id, stage: s as PipelineStage }));
      const { error } = await db.from('health_profile_stages').insert(rows);
      if (error) { toast.error('Failed to update stage mapping.'); return; }
    }
    await fetchAll();
  }, [ensureOrgId, fetchAll]);

  return (
    <HealthConfigContext.Provider value={{
      profiles,
      activeProfileId,
      setActiveProfileId,
      activeProfile,
      metrics,
      setMetrics,
      loading,
      saving,
      saveMetrics,
      refetch: fetchAll,
      getProfileForStage,
      createProfile,
      renameProfile,
      deleteProfile,
      setProfileStages,
    }}>
      {children}
    </HealthConfigContext.Provider>
  );
}

export function useHealthConfig() {
  const ctx = useContext(HealthConfigContext);
  if (!ctx) throw new Error('useHealthConfig must be used within HealthConfigProvider');
  return ctx;
}

/** Resolve the health profile (and its metrics) for an account based on its lifecycle stage. */
export function useAccountHealthProfile(stage: string | null | undefined) {
  const { getProfileForStage, profiles } = useHealthConfig();
  return useMemo(() => getProfileForStage(stage), [getProfileForStage, stage, profiles]);
}
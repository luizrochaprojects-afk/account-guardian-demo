import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/demo/db";
import { useProfile } from "@/hooks/useProfile";
import { DEFAULT_CURRENCY, type CurrencySettings } from "@/lib/currency";

const LS_KEY = (orgId: string) => `org_settings:${orgId}`;

export type OrgSettings = CurrencySettings;

function readCache(orgId: string | null | undefined): OrgSettings | null {
  if (!orgId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY(orgId));
    return raw ? JSON.parse(raw) as OrgSettings : null;
  } catch { return null; }
}

function writeCache(orgId: string, settings: OrgSettings) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(LS_KEY(orgId), JSON.stringify(settings)); } catch { /* ignore */ }
}

export function orgSettingsQueryKey(orgId: string | null | undefined) {
  return ["org_settings", orgId] as const;
}

async function fetchOrgSettings(orgId: string): Promise<OrgSettings> {
  const { data, error } = await db
    .from("org_settings")
    .select("currency_code, currency_symbol")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    // Auto-create default row on first read.
    await db
      .from("org_settings")
      .upsert(
        {
          organization_id: orgId,
          currency_code: DEFAULT_CURRENCY.currencyCode,
          currency_symbol: DEFAULT_CURRENCY.currencySymbol,
        },
        { onConflict: "organization_id" }
      );
    return DEFAULT_CURRENCY;
  }
  return {
    currencyCode: data.currency_code,
    currencySymbol: data.currency_symbol,
  };
}

export function useOrgSettings() {
  const { profile } = useProfile();
  const orgId = profile?.organization_id || null;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: orgSettingsQueryKey(orgId),
    queryFn: () => fetchOrgSettings(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
    initialData: () => readCache(orgId) || undefined,
  });

  // Persist successful fetches to localStorage so first paint is instant on refresh.
  if (query.data && orgId) writeCache(orgId, query.data);

  const settings: OrgSettings = query.data || DEFAULT_CURRENCY;

  const updateCurrency = async (currencyCode: string, currencySymbol: string) => {
    if (!orgId) return;
    const next: OrgSettings = { currencyCode, currencySymbol };
    // Optimistic update
    qc.setQueryData(orgSettingsQueryKey(orgId), next);
    writeCache(orgId, next);
    const { error } = await db
      .from("org_settings")
      .upsert(
        {
          organization_id: orgId,
          currency_code: currencyCode,
          currency_symbol: currencySymbol,
        },
        { onConflict: "organization_id" }
      );
    if (error) {
      // Revert + refetch on failure
      qc.invalidateQueries({ queryKey: orgSettingsQueryKey(orgId) });
      throw error;
    }
  };

  return {
    settings,
    currencyCode: settings.currencyCode,
    currencySymbol: settings.currencySymbol,
    isLoading: query.isLoading && !query.data,
    updateCurrency,
  };
}
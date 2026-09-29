import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/demo/db";
import { useProfile } from "@/hooks/useProfile";

export interface SlaRule {
  id: string;
  organization_id: string;
  name: string;
  priority_filter: string[];
  duration_hours: number | null;
  is_removal: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export function useSlaRulesDB() {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();
  const key = ["sla_rules", orgId];

  const { data: rules = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await db
        .from("sla_rules")
        .select("*")
        .eq("organization_id", orgId!)
        .order("position");
      if (error) throw error;
      return data as SlaRule[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (rule: Partial<SlaRule> & { organization_id: string }) => {
      const { error } = await db.from("sla_rules").upsert(rule as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("sla_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { rules, isLoading, upsert, remove, orgId };
}

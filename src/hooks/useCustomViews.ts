import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/demo/db";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeSavedFilters, type AnyFilters, type ViewEntity } from "@/lib/viewFilters";

export type CustomView = {
  id: string;
  organization_id: string;
  created_by: string | null;
  name: string;
  description: string | null;
  entity_type: ViewEntity;
  filters: AnyFilters;
  is_favorite: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export function useCustomViews(entityType?: ViewEntity) {
  const { profile } = useProfile();
  const { user } = useAuth();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();

  const queryKey = ["custom_views", orgId, entityType ?? "all"];

  const { data: views = [], isLoading } = useQuery({
    queryKey,
    enabled: !!orgId,
    queryFn: async () => {
      let q = db
        .from("custom_views")
        .select("*")
        .eq("organization_id", orgId!)
        .order("position", { ascending: true })
        .order("created_at", { ascending: false });
      if (entityType) q = q.eq("entity_type", entityType);
      const { data, error } = await q;
      if (error) throw error;
      // Normalize legacy single-string filter values (e.g. status: "todo") to
      // the new array shape (e.g. status: ["todo"]) so saved views built before
      // multi-select keep working without a DB migration.
      return ((data || []) as any[]).map(v => ({
        ...v,
        filters: normalizeSavedFilters(v.entity_type as ViewEntity, v.filters),
      })) as unknown as CustomView[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["custom_views"] });
  };

  const createView = useMutation({
    mutationFn: async (input: { name: string; description?: string | null; entity_type: ViewEntity; filters: AnyFilters; is_favorite?: boolean }) => {
      if (!orgId) throw new Error("No organization");
      const { data, error } = await db
        .from("custom_views")
        .insert({
          organization_id: orgId,
          created_by: user?.id ?? null,
          name: input.name,
          description: input.description ?? null,
          entity_type: input.entity_type,
          filters: input.filters as any,
          is_favorite: input.is_favorite ?? false,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CustomView;
    },
    onSuccess: invalidate,
  });

  const updateView = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Pick<CustomView, "name" | "description" | "filters" | "is_favorite" | "position">> }) => {
      const { error } = await db
        .from("custom_views")
        .update(input.patch as any)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteView = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("custom_views").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const duplicateView = useMutation({
    mutationFn: async (v: CustomView) => {
      if (!orgId) throw new Error("No organization");
      const { data, error } = await db
        .from("custom_views")
        .insert({
          organization_id: orgId,
          created_by: user?.id ?? null,
          name: `${v.name} (copy)`,
          entity_type: v.entity_type,
          filters: v.filters as any,
          is_favorite: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CustomView;
    },
    onSuccess: invalidate,
  });

  return {
    views,
    isLoading,
    createView,
    updateView,
    deleteView,
    duplicateView,
  };
}
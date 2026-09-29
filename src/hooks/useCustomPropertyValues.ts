import { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "@/demo/db";
import { useProfile } from "@/hooks/useProfile";
import type { CustomPropertyEntity, CustomProperty } from "./useCustomProperties";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

interface ValueRow {
  id: string;
  property_id: string;
  entity_id: string;
  value: any;
}

/** Single-entity values (for forms / detail panels) */
export function useCustomPropertyValues(entityType: CustomPropertyEntity, entityId: string | null | undefined) {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const [values, setValues] = useState<Record<string, any>>({}); // keyed by property_id
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!orgId || !entityId) { setValues({}); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await db
      .from("custom_property_values")
      .select("property_id, value")
      .eq("organization_id", orgId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);
    if (error) { setLoading(false); return; }
    const map: Record<string, any> = {};
    (data || []).forEach((r: any) => { map[r.property_id] = r.value; });
    setValues(map);
    setLoading(false);
  }, [orgId, entityType, entityId]);

  useEffect(() => { refetch(); }, [refetch]);

  const setValue = async (propertyId: string, value: any) => {
    if (!orgId || !entityId) return;
    // Optimistic
    setValues(prev => ({ ...prev, [propertyId]: value }));
    const { error } = await db.from("custom_property_values").upsert(
      {
        organization_id: orgId,
        property_id: propertyId,
        entity_type: entityType,
        entity_id: entityId,
        value,
      },
      { onConflict: "property_id,entity_id" }
    );
    if (error) { toast.error(error.message); refetch(); }
  };

  return { values, loading, setValue, refetch };
}

/** Bulk values for tables — values[entityId][propertyId] */
export function useCustomPropertyValuesBulk(
  entityType: CustomPropertyEntity,
  entityIds: string[],
  properties: CustomProperty[]
) {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;

  // Stable id-set: sort + dedupe so reorder/pagination doesn't refetch.
  const stableIds = useMemo(
    () => Array.from(new Set(entityIds)).sort(),
    [entityIds]
  );
  const idsKey = stableIds.join(",");
  const hasProps = properties.length > 0;

  const { data: valuesByEntity = {} } = useQuery({
    queryKey: ["custom_property_values_bulk", orgId, entityType, idsKey],
    enabled: !!orgId && stableIds.length > 0 && hasProps,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("custom_property_values")
        .select("property_id, entity_id, value")
        .eq("organization_id", orgId!)
        .eq("entity_type", entityType)
        .in("entity_id", stableIds);
      if (error) throw error;
      const map: Record<string, Record<string, any>> = {};
      (data || []).forEach((r: any) => {
        if (!map[r.entity_id]) map[r.entity_id] = {};
        map[r.entity_id][r.property_id] = r.value;
      });
      return map;
    },
  });

  return valuesByEntity;
}

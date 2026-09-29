import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/demo/db";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";

export type CustomPropertyType =
  | "text"
  | "long_text"
  | "number"
  | "currency"
  | "date"
  /**
   * Month precision. NOT offered in PropertyFormDialog's TYPE_OPTIONS and not
   * accepted by the `custom_properties.type` check constraint — it exists so
   * typed columns that are month-shaped by design (accounts.incumbent_last_renewal)
   * can render through PropertyField instead of hand-rolling an input.
   */
  | "month"
  | "select"
  | "multi_select"
  | "checkbox"
  | "url"
  | "email"
  | "phone";

export type CustomPropertyEntity = "account" | "contact";

export interface CustomProperty {
  id: string;
  organization_id: string;
  entity_type: CustomPropertyEntity;
  key: string;
  label: string;
  type: CustomPropertyType;
  /**
   * `select`/`multi_select`: the allowed values. `text`: optional autocomplete
   * suggestions, rendered as a datalist — the field stays free text.
   */
  options: string[];
  /**
   * Display label per option, when the stored value is not what a human should
   * read (a Postgres enum member like `biennial` vs "Every 2 years"). Absent
   * for user-created properties, where value and label are the same string.
   */
  option_labels?: Record<string, string>;
  description: string | null;
  is_required: boolean;
  is_system: boolean;
  show_in_create: boolean;
  default_value: any;
  position: number;
  created_at: string;
  updated_at: string;
}

export function useCustomProperties(entityType: CustomPropertyEntity) {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();
  const key = ["custom_properties", orgId, entityType] as const;

  const { data: properties = [], isLoading: loading, refetch } = useQuery({
    queryKey: key,
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await db
        .from("custom_properties")
        .select("*")
        .eq("organization_id", orgId!)
        .eq("entity_type", entityType)
        .order("position", { ascending: true });
      if (error) { toast.error("Failed to load properties"); throw error; }
      return ((data as any[]) || []).map(d => ({
        ...d,
        options: Array.isArray(d.options) ? d.options : [],
      })) as CustomProperty[];
    },
  });

  // Realtime sync
  useEffect(() => {
    if (!orgId) return;
    const channel = db
      // Unique channel name per hook instance — Supabase dedupes by name,
      // so a shared name causes "cannot add callbacks after subscribe()" when
      // a second instance mounts and reuses the already-subscribed channel.
      .channel(`custom_properties:${entityType}:${orgId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "custom_properties", filter: `organization_id=eq.${orgId}` },
        () => qc.invalidateQueries({ queryKey: key })
      )
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [orgId, entityType, qc]);

  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "field";

  const createProperty = async (input: {
    label: string;
    type: CustomPropertyType;
    options?: string[];
    description?: string;
    is_required?: boolean;
    show_in_create?: boolean;
    default_value?: any;
  }) => {
    if (!orgId) return;
    const baseKey = slugify(input.label);
    let key = baseKey;
    let i = 1;
    const existingKeys = new Set(properties.map(p => p.key));
    while (existingKeys.has(key)) { key = `${baseKey}_${i++}`; }
    const position = properties.length;
    const { error } = await db.from("custom_properties").insert({
      organization_id: orgId,
      entity_type: entityType,
      key,
      label: input.label.trim(),
      type: input.type,
      options: input.options || [],
      description: input.description || null,
      is_required: input.is_required ?? false,
      show_in_create: input.show_in_create ?? true,
      default_value: input.default_value ?? null,
      position,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Property created");
    refetch();
  };

  const updateProperty = async (id: string, patch: Partial<CustomProperty>) => {
    const { error } = await db.from("custom_properties").update(patch as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    refetch();
  };

  const deleteProperty = async (id: string) => {
    const { error } = await db.from("custom_properties").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Property deleted");
    refetch();
  };

  const reorder = async (orderedIds: string[]) => {
    if (!orgId) return;
    await Promise.all(
      orderedIds.map((id, idx) =>
        db.from("custom_properties").update({ position: idx }).eq("id", id)
      )
    );
    refetch();
  };

  return { properties, loading, createProperty, updateProperty, deleteProperty, reorder, refetch };
}

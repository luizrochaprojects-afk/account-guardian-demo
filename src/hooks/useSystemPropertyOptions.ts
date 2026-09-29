import { useMemo } from "react";
import { useCustomProperties, type CustomPropertyEntity } from "./useCustomProperties";

/**
 * Reads `options` for a system-managed select property by its stable `key`.
 * Falls back to the provided defaults until properties have loaded or if the
 * system property has been (somehow) removed.
 */
export function useSystemPropertyOptions(
  entityType: CustomPropertyEntity,
  key: string,
  fallback: string[] = []
) {
  const { properties, loading } = useCustomProperties(entityType);
  const options = useMemo(() => {
    const prop = properties.find(p => p.key === key && p.is_system);
    if (!prop) return fallback;
    return prop.options.length > 0 ? prop.options : fallback;
  }, [properties, key, fallback]);
  return { options, loading };
}

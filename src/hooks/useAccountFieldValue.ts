import { useCallback } from "react";
import { useAccounts, type Account } from "@/contexts/AccountsContext";
import { useCustomPropertyValues } from "@/hooks/useCustomPropertyValues";
import type { CustomProperty } from "@/hooks/useCustomProperties";

/**
 * System property keys map to columns on the `accounts` row.
 * Maps property `key` -> Account field name (camelCase used by AccountsContext).
 */
export const SYSTEM_KEY_TO_ACCOUNT_FIELD: Record<string, keyof Account> = {
  industry: "industry",
  segment: "segment",
  customer_since: "customerSince",
  pipeline_stage: "lifecycleStage",
  code_prefix: "codePrefix",
  mrr: "mrr",
  arr: "arr",
  // Incumbent displacement. These are typed columns on `accounts` (two Postgres
  // enums, one real `date`) because run_incumbent_window_gate() does date
  // arithmetic over them nightly — the descriptors in `custom_properties` only
  // say how to render them. A key seeded as `is_system` but missing from this
  // map falls through to `custom_property_values` and writes the EAV table
  // instead of the column, silently, so this map and the system-property seed
  // must change together.
  incumbent_vendor: "incumbent_vendor",
  incumbent_last_renewal: "incumbent_last_renewal",
  incumbent_cycle: "incumbent_cycle",
  incumbent_evidence: "incumbent_evidence",
};

export function isSystemAccountKey(key: string) {
  return key in SYSTEM_KEY_TO_ACCOUNT_FIELD;
}

/**
 * Unified read/write hook for an account property — system or custom.
 * For system keys, value lives on the `accounts` row.
 * For custom keys, value lives in `custom_property_values`.
 */
export function useAccountFieldValue(account: Account, property: CustomProperty) {
  const { updateAccount } = useAccounts();
  const isCustom = !property.is_system || !isSystemAccountKey(property.key);
  const { values, setValue: setCustomValue } = useCustomPropertyValues(
    "account",
    isCustom ? account.id : null
  );

  const value = isCustom
    ? values[property.id]
    : (account as any)[SYSTEM_KEY_TO_ACCOUNT_FIELD[property.key]];

  const setValue = useCallback(
    async (next: any) => {
      if (isCustom) {
        await setCustomValue(property.id, next);
        return;
      }
      const field = SYSTEM_KEY_TO_ACCOUNT_FIELD[property.key];
      // Clearing must write NULL, not "". These keys resolve to real columns,
      // and `date` / enum columns reject the empty string outright (`invalid
      // input syntax for type date: ""`), so an emptied Last renewal would fail
      // the update rather than clear it.
      //
      // The nullable set is matched by key prefix, which holds only as long as
      // every typed non-text column is named incumbent_*. Widen this to a real
      // per-key type map before adding a date or enum column under another name.
      const nullable = String(field).startsWith("incumbent_");
      const patch: Partial<Account> = {
        [field]: next === "" || next === undefined ? (nullable ? null : "") : next,
      } as any;
      // Auto-derive ARR from MRR
      if (property.key === "mrr") {
        patch.arr = Number(next) * 12;
      }
      await updateAccount(account.id, patch);
    },
    [isCustom, property.id, property.key, setCustomValue, updateAccount, account.id]
  );

  return { value, setValue, isCustom };
}

import type { CustomProperty } from "@/hooks/useCustomProperties";

/**
 * Properties that belong on the "Add Account" create form.
 *
 * The create form is data-driven — it renders whichever properties this returns.
 * A property opts in via `show_in_create`. Fields that only make sense after an
 * account exists (churn date, realized MRR, derived ARR, internal codes) set it
 * to false and drop off the form without disappearing from the account itself.
 *
 * A legacy row that predates the column (undefined flag) is treated as visible,
 * matching the DB default so nothing silently vanishes mid-migration.
 */
export function visibleCreateProps<T extends Pick<CustomProperty, "show_in_create">>(
  props: T[],
): T[] {
  return props.filter((p) => p.show_in_create !== false);
}

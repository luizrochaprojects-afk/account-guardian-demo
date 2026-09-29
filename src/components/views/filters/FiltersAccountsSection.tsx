import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MultiSelectFilter, type MultiSelectOption } from "@/components/listing";
import { cn } from "@/lib/utils";

export interface CustomPropFilterItem {
  property: { id: string; label: string; options: string[] };
  selected: string[];
  onChange: (vals: string[]) => void;
}

export interface FiltersAccountsSectionProps {
  healthOptions: MultiSelectOption[];
  segmentOptions: MultiSelectOption[];
  /** Org members, with a leading '__unassigned' entry. Same list for both roles. */
  ownerOptions: MultiSelectOption[];

  healthFilter: string[];
  segmentFilter: string[];
  revenueOwnerFilter: string[];
  deliveryOwnerFilter: string[];
  /** "Accounts I'm on", either side. Independent of the two lists above. */
  onlyMine: boolean;
  includeChurned: boolean;

  onHealthChange: (v: string[]) => void;
  onSegmentChange: (v: string[]) => void;
  onRevenueOwnerChange: (v: string[]) => void;
  onDeliveryOwnerChange: (v: string[]) => void;
  onOnlyMineChange: (v: boolean) => void;
  onIncludeChurnedChange: (v: boolean) => void;

  customPropFilters?: CustomPropFilterItem[];
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex-1 min-w-0 flex items-center gap-1 flex-wrap">{children}</div>
    </div>
  );
}

export function FiltersAccountsSection(p: FiltersAccountsSectionProps) {
  return (
    <div className="px-3 py-2 space-y-0.5">
      <Row label="Health">
        <MultiSelectFilter label="Health" options={p.healthOptions} selected={p.healthFilter} onChange={p.onHealthChange} searchable={false} />
      </Row>
      <Row label="Segment">
        <MultiSelectFilter label="Segment" options={p.segmentOptions} selected={p.segmentFilter} onChange={p.onSegmentChange} />
      </Row>
      <Row label="Revenue owner">
        <MultiSelectFilter label="Revenue owner" options={p.ownerOptions} selected={p.revenueOwnerFilter} onChange={p.onRevenueOwnerChange} />
      </Row>
      <Row label="Delivery owner">
        <MultiSelectFilter label="Delivery owner" options={p.ownerOptions} selected={p.deliveryOwnerFilter} onChange={p.onDeliveryOwnerChange} />
      </Row>
      <Row label="Mine">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 px-2 text-[11px] gap-1 border-dashed font-normal",
            p.onlyMine && "border-solid bg-accent/40",
          )}
          onClick={() => p.onOnlyMineChange(!p.onlyMine)}
        >
          {p.onlyMine ? "✓ " : ""}My accounts
        </Button>
      </Row>
      <Row label="Churned">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 px-2 text-[11px] gap-1 border-dashed font-normal",
            p.includeChurned && "border-solid bg-accent/40",
          )}
          onClick={() => p.onIncludeChurnedChange(!p.includeChurned)}
        >
          {p.includeChurned ? "✓ " : ""}Include churned
        </Button>
      </Row>
      {p.customPropFilters?.map(item => (
        <Row key={item.property.id} label={item.property.label}>
          <MultiSelectFilter
            label={item.property.label}
            options={item.property.options.map(o => ({ value: o, label: o }))}
            selected={item.selected}
            onChange={item.onChange}
          />
        </Row>
      ))}
    </div>
  );
}

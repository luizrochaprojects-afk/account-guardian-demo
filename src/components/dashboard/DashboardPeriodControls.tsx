import { useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PERIOD_PRESETS, type DashboardPeriod } from '@/hooks/useDashboardPeriod';

export interface DashboardPeriodControlsProps {
  period: DashboardPeriod;
}

/**
 * Fully controlled period picker.
 *
 * A control that owns its own URL writes AND hydrates itself from the URL
 * through a mount effect races every other reader of the same window. Here
 * `useDashboardPeriod` is the only writer and this component just renders
 * state and calls setters, so no hydration effect exists to go wrong.
 */
export function DashboardPeriodControls({ period }: DashboardPeriodControlsProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(() => format(period.since, 'yyyy-MM-dd'));

  const handlePreset = (next: string) => {
    if (!next) return; // ToggleGroup emits '' when toggling off — ignore
    if (next === 'custom') {
      setCustomDraft(format(period.since, 'yyyy-MM-dd'));
      setCustomOpen(true);
      return;
    }
    period.setPreset(next as typeof period.preset);
  };

  const applyCustom = () => {
    const parsed = parseISO(customDraft);
    if (!isValid(parsed)) return;
    period.setSince(parsed);
    setCustomOpen(false);
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Window</span>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={period.preset}
            onValueChange={handlePreset}
            size="sm"
            variant="outline"
            className="justify-start"
          >
            {PERIOD_PRESETS.filter((p) => p.key !== 'custom').map((p) => (
              <ToggleGroupItem key={p.key} value={p.key} aria-label={p.label}>
                {p.label}
              </ToggleGroupItem>
            ))}
            <Popover open={customOpen} onOpenChange={setCustomOpen}>
              <PopoverTrigger asChild>
                <ToggleGroupItem value="custom" aria-label="Custom date">
                  Custom
                </ToggleGroupItem>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Show metrics since</div>
                <Input
                  type="date"
                  value={customDraft}
                  onChange={(e) => setCustomDraft(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={applyCustom}>
                    Apply
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </ToggleGroup>
          {period.preset === 'custom' && (
            <span className="text-xs text-muted-foreground">
              since {format(period.since, 'MMM d, yyyy')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

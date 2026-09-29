import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check, X } from "lucide-react";
import type { CustomProperty } from "@/hooks/useCustomProperties";
import { useEffect, useState } from "react";
import { useOrgSettings } from "@/hooks/useOrgSettings";
import { formatCurrencyValue, DEFAULT_CURRENCY } from "@/lib/currency";
import {
  normalizeEmail,
  isValidEmail,
  formatPhoneAsYouType,
  formatPhoneDisplay,
  toE164,
} from "@/lib/inputFormat";

interface Props {
  property: CustomProperty;
  value: any;
  onChange: (v: any) => void;
  size?: "sm" | "md";
  /**
   * Activate the editor as soon as it mounts: open the menu for select /
   * multi_select, focus the input for everything else. Used by inline row
   * editing, where the click on the row already *is* the intent to edit.
   */
  autoOpen?: boolean;
  /**
   * Called when an overlay editor (select / multi_select) closes, so an inline
   * caller can leave edit mode. Overlay content is portalled, so blur can't be
   * used for this — see the comment in CompanyInfoPanel's AccountPropertyRow.
   */
  onDismiss?: () => void;
  /**
   * Rendered onto the underlying control so a caller can pair it with its own
   * <Label htmlFor>. Inline editing doesn't need it (the row is the label);
   * form layouts do.
   */
  id?: string;
  /**
   * Normalization hook, fired on blur with the current value. Kept separate
   * from onChange so a caller can canonicalize once the user is done typing
   * without fighting the caret on every keystroke.
   */
  onBlur?: (v: any) => void;
}

export function PropertyField({ property, value, onChange, size = "md", autoOpen, onDismiss, id, onBlur }: Props) {
  const h = size === "sm" ? "h-7" : "h-8";
  const txt = size === "sm" ? "text-[12px]" : "text-xs";
  const blur = onBlur ? () => onBlur(value) : undefined;

  // The system "phone" property is rendered with phone formatting even if its
  // type is still 'text' (defensive — the migration sets type='phone').
  const isPhone = property.type === "phone" || property.key === "phone";
  const isEmail = property.type === "email";

  if (isPhone) {
    return <PhoneField id={id} h={h} txt={txt} value={value} onChange={onChange} autoFocus={autoOpen} placeholder={property.description || ""} />;
  }
  if (isEmail) {
    return <EmailField id={id} h={h} txt={txt} value={value} onChange={onChange} autoFocus={autoOpen} placeholder={property.description || ""} />;
  }

  switch (property.type) {
    case "text":
    case "url": {
      // Suggestions, not a closed list: a datalist keeps the field free text,
      // so a value nobody predicted is still typeable.
      const listId = property.options.length ? `${id ?? property.id}-list` : undefined;
      return (
        <>
          <Input
            id={id}
            list={listId}
            className={`${h} ${txt}`}
            type={property.type === "url" ? "url" : "text"}
            value={value ?? ""}
            autoFocus={autoOpen}
            onChange={e => onChange(e.target.value)}
            onBlur={blur}
            placeholder={property.description || ""}
          />
          {listId && (
            <datalist id={listId}>
              {property.options.map(o => <option key={o} value={o} />)}
            </datalist>
          )}
        </>
      );
    }
    case "long_text":
      return (
        <Textarea
          id={id}
          className={`${txt} min-h-[60px]`}
          value={value ?? ""}
          autoFocus={autoOpen}
          onChange={e => onChange(e.target.value)}
          onBlur={blur}
          placeholder={property.description || ""}
        />
      );
    case "number":
      return (
        <Input
          className={`${h} ${txt}`}
          type="number"
          value={value ?? ""}
          autoFocus={autoOpen}
          onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "currency":
      return <CurrencyField id={id} h={h} txt={txt} value={value} onChange={onChange} autoFocus={autoOpen} />;
    case "date":
      return (
        <Input
          id={id}
          className={`${h} ${txt}`}
          type="date"
          value={value ?? ""}
          autoFocus={autoOpen}
          onChange={e => onChange(e.target.value || null)}
        />
      );
    case "month":
      // Stored as a real date (first of the month) so SQL can do arithmetic on
      // it; only the input is month-precision. The slice/suffix pair is the
      // whole adapter.
      return (
        <Input
          id={id}
          className={`${h} ${txt}`}
          type="month"
          value={value ? String(value).slice(0, 7) : ""}
          autoFocus={autoOpen}
          onChange={e => onChange(e.target.value ? `${e.target.value}-01` : null)}
        />
      );
    case "checkbox":
      return (
        <div className="flex items-center h-7">
          <Checkbox checked={!!value} autoFocus={autoOpen} onCheckedChange={v => onChange(!!v)} />
        </div>
      );
    case "select":
      return (
        <Select
          value={value ?? ""}
          defaultOpen={autoOpen}
          onValueChange={v => onChange(v || null)}
          onOpenChange={o => { if (!o) onDismiss?.(); }}
        >
          <SelectTrigger id={id} className={`${h} ${txt}`}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {property.options.map(o => (
              <SelectItem key={o} value={o}>{property.option_labels?.[o] ?? o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multi_select":
      return (
        <MultiSelectField
          property={property}
          value={value}
          onChange={onChange}
          autoOpen={autoOpen}
          onDismiss={onDismiss}
        />
      );
    default:
      return null;
  }
}

// ---------- Currency field ----------

/**
 * Split out so `useOrgSettings` (which reaches for QueryClient + Auth) fires
 * only for the one type that needs the org's currency symbol. Kept at the top
 * level of PropertyField it made every field type — and every component that
 * renders one — require the full provider stack.
 */
function CurrencyField({
  h, txt, value, onChange, autoFocus, id,
}: { h: string; txt: string; value: any; onChange: (v: any) => void; autoFocus?: boolean; id?: string }) {
  const { currencySymbol } = useOrgSettings();
  const sym = currencySymbol || DEFAULT_CURRENCY.currencySymbol;
  const padLeft = sym.length <= 1 ? "pl-5" : sym.length === 2 ? "pl-7" : "pl-9";
  return (
    <div className="relative">
      <span className={`pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 ${txt} text-muted-foreground`}>
        {sym}
      </span>
      <Input
        id={id}
        className={`${h} ${txt} ${padLeft}`}
        type="number"
        value={value ?? ""}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );
}

// ---------- Email field with on-blur normalize + validation ----------

function EmailField({
  h, txt, value, onChange, placeholder, autoFocus, id,
}: { h: string; txt: string; value: any; onChange: (v: any) => void; placeholder?: string; autoFocus?: boolean; id?: string }) {
  const [touched, setTouched] = useState(false);
  const v = (value ?? "") as string;
  const invalid = touched && v.trim() !== "" && !isValidEmail(v);
  return (
    <div className="w-full">
      <Input
        id={id}
        className={`${h} ${txt} ${invalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
        type="email"
        autoFocus={autoFocus}
        value={v}
        onChange={e => onChange(e.target.value)}
        onBlur={() => {
          setTouched(true);
          const normalized = normalizeEmail(v);
          if (normalized !== v) onChange(normalized);
        }}
        placeholder={placeholder}
        autoComplete="email"
      />
      {invalid && <p className="text-[10px] text-destructive mt-0.5">Invalid email</p>}
    </div>
  );
}

// ---------- Phone field with as-you-type mask + E.164 storage ----------

function PhoneField({
  h, txt, value, onChange, placeholder, autoFocus, id,
}: { h: string; txt: string; value: any; onChange: (v: any) => void; placeholder?: string; autoFocus?: boolean; id?: string }) {
  const [touched, setTouched] = useState(false);
  // Local display state so we can show the mask; canonical value is what we
  // propagate via onChange. Re-seed when the upstream value changes (e.g. on
  // form open/edit) but ONLY if it's a different canonical value, to avoid
  // fighting the user's caret while typing.
  const [display, setDisplay] = useState<string>(() => formatPhoneDisplay((value ?? "") as string));
  useEffect(() => {
    const incoming = (value ?? "") as string;
    const incomingCanonical = toE164(incoming) ?? incoming;
    const currentCanonical = toE164(display) ?? display;
    if (incomingCanonical !== currentCanonical) {
      setDisplay(formatPhoneDisplay(incoming));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const raw = display.trim();
  const invalid = touched && raw !== "" && toE164(raw) === null;

  return (
    <div className="w-full">
      <Input
        id={id}
        className={`${h} ${txt} ${invalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
        type="tel"
        inputMode="tel"
        autoFocus={autoFocus}
        value={display}
        onChange={e => {
          const next = formatPhoneAsYouType(e.target.value);
          setDisplay(next);
          // Propagate the canonical E.164 if valid, otherwise the raw entry
          // so the form keeps state during typing.
          const e164 = toE164(next);
          onChange(e164 ?? next);
        }}
        onBlur={() => {
          setTouched(true);
          const e164 = toE164(display);
          if (e164) {
            // Snap display to canonical international format.
            setDisplay(formatPhoneDisplay(e164));
            onChange(e164);
          }
        }}
        placeholder={placeholder || "(11) 98765-4321"}
        autoComplete="tel"
      />
      {invalid && <p className="text-[10px] text-destructive mt-0.5">Invalid phone number</p>}
    </div>
  );
}

function MultiSelectField({ property, value, onChange, autoOpen, onDismiss }: Props) {
  const [open, setOpen] = useState(!!autoOpen);
  const arr: string[] = Array.isArray(value) ? value : [];
  const toggle = (o: string) => {
    if (arr.includes(o)) onChange(arr.filter(x => x !== o));
    else onChange([...arr, o]);
  };
  // Dismiss only on close — never on toggle, so several options can be picked.
  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) onDismiss?.(); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs justify-between w-full font-normal">
          <span className="truncate">{arr.length === 0 ? "Select…" : arr.join(", ")}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-1">
        {property.options.map(o => {
          const active = arr.includes(o);
          return (
            <button
              key={o}
              onClick={() => toggle(o)}
              className={`flex items-center justify-between w-full px-2 py-1 rounded-sm text-left text-[12px] transition-colors ${active ? "bg-accent" : "hover:bg-muted/50"}`}
            >
              <span>{o}</span>
              {active && <Check className="h-3 w-3" />}
            </button>
          );
        })}
        {property.options.length === 0 && (
          <div className="px-2 py-2 text-[11px] text-muted-foreground">No options defined</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatPropertyValue(
  property: CustomProperty,
  value: any,
  currencySymbol?: string,
): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (property.type) {
    case "currency":
      return formatCurrencyValue(value, currencySymbol);
    case "checkbox":
      return value ? "Yes" : "No";
    case "multi_select":
      return Array.isArray(value) && value.length > 0 ? value.join(", ") : "—";
    case "date":
      return new Date(value).toLocaleDateString('en-US');
    case "month": {
      // Formatted off the ISO string, never through Date: `new Date('2026-01-01')`
      // is UTC midnight, so a local-time formatter renders December for anyone
      // west of UTC.
      const [y, m] = String(value).split("-");
      const name = MONTH_NAMES[Number(m) - 1];
      return name ? `${name} ${y}` : String(value);
    }
    case "select":
      return property.option_labels?.[String(value)] ?? String(value);
    case "phone":
      return formatPhoneDisplay(String(value));
    default:
      // System "phone" property may still be type 'text' in some legacy rows.
      if (property.key === "phone") return formatPhoneDisplay(String(value));
      return String(value);
  }
}

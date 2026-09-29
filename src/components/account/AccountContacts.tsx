import { useState } from 'react';
import {
  ROLE_OPTIONS, ROLE_COLORS, ROLE_PRIORITY, ROLE_FULL_LABELS, type DealRole,
} from '@/lib/dealCoverage';
import { useContactsDB, type DbContact } from '@/hooks/useContactsDB';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ContactDialog } from '@/components/account/ContactDialog';
import { LogInteractionDialog } from '@/components/account/LogInteractionDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { User, Plus, Pencil, Trash2, Copy, Check, PhoneCall, CircleDot, Circle, Linkedin } from 'lucide-react';
import { formatDate } from '@/lib/formatDate';

interface AccountContactsProps {
  contacts: DbContact[];
  accountId: string;
  compact?: boolean;
}

// Shape + color together, not color alone: active/inactive communicated by dot
// color only is invisible to a red-green colorblind user, especially when the
// label text is the same weight for both.
const ENGAGEMENT: Record<string, { icon: typeof CircleDot; className: string; label: string }> = {
  active: { icon: CircleDot, className: 'text-emerald-600', label: 'Active' },
  moderate: { icon: CircleDot, className: 'text-amber-600', label: 'Moderate' },
  inactive: { icon: Circle, className: 'text-muted-foreground', label: 'Inactive' },
};

const ENGAGEMENT_OPTIONS = ['active', 'moderate', 'inactive'];

// Roles come from role_in_deal, not contact_type. The two were the same idea
// spelled twice — "Exec. Sponsor" here and "Decision maker" in Deal coverage,
// on the same person — and only role_in_deal has a CHECK constraint and is read
// by the closed_won gate.
const typeLabel = Object.fromEntries(ROLE_OPTIONS.map(o => [o.value, o.label]));

function roleOf(c: DbContact): DealRole {
  return (c.role_in_deal as DealRole) ?? 'none';
}

function sortByType(a: DbContact, b: DbContact) {
  return ROLE_PRIORITY.indexOf(roleOf(a)) - ROLE_PRIORITY.indexOf(roleOf(b));
}

export function AccountContacts({ contacts: dbContacts, accountId, compact = false }: AccountContactsProps) {
  // Use the DB hook for CRUD - the parent passes initial data but we manage our own
  const { contacts, updateContact, deleteContact } = useContactsDB(accountId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<DbContact | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [logContactIds, setLogContactIds] = useState<string[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState('');

  function openCreate() {
    setEditingContact(null);
    setDialogOpen(true);
  }

  function openEdit(c: DbContact) {
    setEditingContact(c);
    setDialogOpen(true);
  }

  async function handleDelete() {
    if (deleteId) {
      await deleteContact(deleteId);
      setDeleteId(null);
    }
  }

  if (compact) {
    return (
      <div>
        {/* Label rendered by parent panel section header */}
        <div className="space-y-1.5">
          {[...contacts].sort(sortByType).slice(0, 3).map(c => (
            <div key={c.id} className="flex items-center gap-2 text-xs">
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-muted-foreground truncate">{c.role}</div>
              </div>
              <span className={`text-[10px] px-1 py-0 rounded-sm border ${ROLE_COLORS[roleOf(c)] || ''}`}>
                {typeLabel[roleOf(c)] || roleOf(c)}
              </span>
            </div>
          ))}
          {contacts.length > 3 && (
            <div className="text-xs text-muted-foreground">+{contacts.length - 3} more</div>
          )}
          {contacts.length === 0 && (
            <div className="text-xs text-muted-foreground">No contacts</div>
          )}
        </div>
      </div>
    );
  }

  const sorted = [...contacts].sort(sortByType);
  // A fully-empty column is a large slice of the table saying nothing —
  // collapse it instead of rendering a column of dashes.
  const showPhone = sorted.some((c) => !!c.phone);

  async function copyEmail(c: DbContact) {
    if (!c.email) return;
    await navigator.clipboard.writeText(c.email);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId((id) => (id === c.id ? null : id)), 1500);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground font-medium">Contacts ({contacts.length})</div>
        {sorted.length > 0 && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openCreate}>
            <Plus className="h-3 w-3 mr-1" /> Add contact
          </Button>
        )}
      </div>

      {sorted.length > 0 ? (
        <div className="border rounded-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Role</th>
                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Type</th>
                {showPhone && <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Phone</th>}
                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Engagement</th>
                <th className="px-2 py-1.5 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map(c => {
                const engagement = ENGAGEMENT[c.engagement_level] || ENGAGEMENT.inactive;
                const EngagementIcon = engagement.icon;
                return (
                  <tr key={c.id} className="hover:bg-muted/50 group">
                    <td className="px-2 py-1.5 font-medium">
                      <span className="inline-flex items-center gap-1">
                        {c.name}
                        {c.linkedin_url && (
                          <a
                            href={c.linkedin_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-muted-foreground hover:text-foreground"
                            title="Open LinkedIn profile"
                            aria-label={`Open ${c.name}'s LinkedIn profile`}
                          >
                            <Linkedin className="h-3 w-3" />
                          </a>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {editingRoleId === c.id ? (
                        <Input
                          autoFocus
                          value={roleDraft}
                          onChange={(e) => setRoleDraft(e.target.value)}
                          onBlur={() => { updateContact(c.id, { role: roleDraft.trim() || null }); setEditingRoleId(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingRoleId(null); }}
                          className="h-6 text-xs"
                        />
                      ) : (
                        <button
                          className="w-full text-left hover:bg-muted/60 rounded-sm px-1 -mx-1 py-0.5"
                          onClick={() => { setRoleDraft(c.role || ''); setEditingRoleId(c.id); }}
                        >
                          {c.role || <span className="text-muted-foreground">+ Add role</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <Select value={roleOf(c)} onValueChange={(v) => updateContact(c.id, { role_in_deal: v as DealRole })}>
                        <SelectTrigger
                          className={`h-6 w-auto min-w-0 gap-1 px-1.5 border-none shadow-none text-xs rounded-sm [&>svg]:h-3 [&>svg]:w-3 ${ROLE_COLORS[roleOf(c)] || ''}`}
                          title={ROLE_FULL_LABELS[roleOf(c)]}
                        >
                          <SelectValue>{typeLabel[roleOf(c)] || roleOf(c)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value} title={ROLE_FULL_LABELS[o.value]}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    {showPhone && <td className="px-2 py-1.5 text-muted-foreground font-mono">{c.phone || '—'}</td>}
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {c.email ? (
                        <span className="inline-flex items-center gap-1">
                          {c.email}
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded-sm"
                            onClick={() => copyEmail(c)}
                            title="Copy email"
                            aria-label={`Copy ${c.name}'s email`}
                          >
                            {copiedId === c.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-1.5">
                      <Select value={c.engagement_level} onValueChange={(v) => updateContact(c.id, { engagement_level: v })}>
                        <SelectTrigger className="h-6 w-auto min-w-0 gap-1 px-1 border-none shadow-none text-xs rounded-sm [&>svg]:h-3 [&>svg]:w-3">
                          <SelectValue>
                            <span className={`inline-flex items-center gap-1 ${engagement.className}`}>
                              <EngagementIcon className="h-2 w-2 fill-current" />
                              <span className={c.engagement_level === 'inactive' ? 'text-muted-foreground' : 'font-medium'}>{engagement.label}</span>
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {ENGAGEMENT_OPTIONS.map((v) => (
                            <SelectItem key={v} value={v}>{ENGAGEMENT[v].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-muted-foreground pl-0.5">
                        {c.last_interaction ? `last contact ${formatDate(c.last_interaction)}` : 'no contact logged'}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-0.5 hover:bg-muted rounded-sm" onClick={() => setLogContactIds([c.id])} title="Log interaction"><PhoneCall className="h-3 w-3 text-muted-foreground" /></button>
                        <button className="p-0.5 hover:bg-muted rounded-sm" onClick={() => openEdit(c)} title="Edit contact"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                        <button className="p-0.5 hover:bg-muted rounded-sm" onClick={() => setDeleteId(c.id)} title="Delete contact"><Trash2 className="h-3 w-3 text-destructive" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          compact
          title="No contacts yet"
          description="Add the people involved in this account to track relationships, decision-makers and deal coverage."
          action={<Button size="sm" onClick={openCreate}>Add first contact</Button>}
        />
      )}

      <ContactDialog
        accountId={accountId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingContact={editingContact}
      />

      {logContactIds && (
        <LogInteractionDialog
          accountId={accountId}
          open={!!logContactIds}
          onOpenChange={(o) => { if (!o) setLogContactIds(null); }}
          initialContactIds={logContactIds}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this contact?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

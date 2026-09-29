import { useEffect, useState } from 'react';
import { ROLE_OPTIONS, type DealRole } from '@/lib/dealCoverage';
import { useContactsDB, type DbContact } from '@/hooks/useContactsDB';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

interface ContactDialogProps {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingContact?: DbContact | null;
}

type FormState = { name: string; role: string; email: string; phone: string; department: string; linkedinUrl: string; roleInDeal: DealRole; engagementLevel: 'active' | 'moderate' | 'inactive' };

const defaultForm: FormState = { name: '', role: '', email: '', phone: '', department: '', linkedinUrl: '', roleInDeal: 'none', engagementLevel: 'active' };

export function ContactDialog({ accountId, open, onOpenChange, editingContact = null }: ContactDialogProps) {
  const { addContact, updateContact } = useContactsDB(accountId);
  const [form, setForm] = useState<FormState>(defaultForm);

  useEffect(() => {
    if (!open) return;
    if (editingContact) {
      setForm({
        name: editingContact.name, role: editingContact.role || '', email: editingContact.email || '', phone: editingContact.phone || '',
        department: editingContact.department || '', linkedinUrl: editingContact.linkedin_url || '', roleInDeal: (editingContact.role_in_deal as DealRole) ?? 'none',
        engagementLevel: editingContact.engagement_level as any,
      });
    } else {
      setForm({ ...defaultForm });
    }
  }, [open, editingContact]);

  function updateForm(patch: Partial<FormState>) {
    setForm(prev => ({ ...prev, ...patch }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    if (editingContact) {
      await updateContact(editingContact.id, {
        name: form.name, role: form.role, email: form.email, phone: form.phone,
        department: form.department, linkedin_url: form.linkedinUrl.trim() || null, role_in_deal: form.roleInDeal, engagement_level: form.engagementLevel,
      });
    } else {
      await addContact({
        name: form.name, role: form.role, email: form.email, phone: form.phone,
        department: form.department, linkedin_url: form.linkedinUrl.trim() || null, role_in_deal: form.roleInDeal, engagement_level: form.engagementLevel,
        account_id: accountId,
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingContact ? 'Edit contact' : 'Add contact'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input className="h-8 text-sm mt-1" value={form.name} onChange={e => updateForm({ name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <Input className="h-8 text-sm mt-1" value={form.role} onChange={e => updateForm({ role: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Contact Type</label>
              <Select value={form.roleInDeal} onValueChange={v => updateForm({ roleInDeal: v as DealRole })}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Engagement</label>
              <Select value={form.engagementLevel} onValueChange={v => updateForm({ engagementLevel: v as any })}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input className="h-8 text-sm mt-1" value={form.email} onChange={e => updateForm({ email: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input className="h-8 text-sm mt-1" value={form.phone} onChange={e => updateForm({ phone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Department</label>
              <Input className="h-8 text-sm mt-1" value={form.department} onChange={e => updateForm({ department: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">LinkedIn</label>
              <Input
                className="h-8 text-sm mt-1"
                placeholder="linkedin.com/in/..."
                value={form.linkedinUrl}
                onChange={e => updateForm({ linkedinUrl: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>{editingContact ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

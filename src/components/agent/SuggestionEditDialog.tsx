import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AccountMatchPill } from './AccountMatchPill';
import type {
  SuggestionWithContext, TaskSuggestionPayload, NoteSuggestionPayload, IncumbentCaptureSuggestionPayload,
} from '@/types/agent';
import type { ApproveEdits } from '@/hooks/useAgentSuggestions';

// SuggestionEditDialog — minimal edit-then-approve flow. We intentionally
// don't use react-hook-form/zod here: the field set is small, every field
// is optional, and the server already validates.
// Submitting calls onSubmit(edits) where edits only carries diff-from-stored
// fields (empty strings stripped).

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suggestion: SuggestionWithContext;
  initialAccountId: string | null;
  onSubmit: (edits: ApproveEdits) => Promise<void>;
}

export function SuggestionEditDialog({ open, onOpenChange, suggestion, initialAccountId, onSubmit }: Props) {
  const isTask = suggestion.type === 'task';
  const isIncumbent = suggestion.type === 'incumbent_capture';
  const initialPayload = suggestion.payload as TaskSuggestionPayload & NoteSuggestionPayload;
  const initialIncumbent = suggestion.payload as unknown as IncumbentCaptureSuggestionPayload;

  const [title, setTitle] = useState(initialPayload.title ?? '');
  const [description, setDescription] = useState(initialPayload.description ?? '');
  const [dueDate, setDueDate] = useState(initialPayload.due_date ?? '');
  const [assignee, setAssignee] = useState(initialPayload.assignee_user_id ?? '');
  const [content, setContent] = useState(initialPayload.content_markdown ?? '');
  const [vendor, setVendor] = useState(initialIncumbent.incumbent_vendor ?? '');
  const [evidence, setEvidence] = useState(initialIncumbent.incumbent_evidence ?? '');
  const [lastRenewal, setLastRenewal] = useState(initialIncumbent.incumbent_last_renewal ?? '');
  const [cycle, setCycle] = useState(initialIncumbent.incumbent_cycle ?? 'unknown');
  const [accountId, setAccountId] = useState<string | null>(initialAccountId);
  const [submitting, setSubmitting] = useState(false);

  // Reset form whenever the dialog opens with a (potentially new) suggestion.
  // Suggestion payloads are immutable for the row's lifetime, so keying on
  // `suggestion.id` is enough — exhaustive-deps disabled to avoid resetting
  // every keystroke as `initialPayload` is destructured fresh on each render.
  useEffect(() => {
    if (!open) return;
    setTitle(initialPayload.title ?? '');
    setDescription(initialPayload.description ?? '');
    setDueDate(initialPayload.due_date ?? '');
    setAssignee(initialPayload.assignee_user_id ?? '');
    setContent(initialPayload.content_markdown ?? '');
    setVendor(initialIncumbent.incumbent_vendor ?? '');
    setEvidence(initialIncumbent.incumbent_evidence ?? '');
    setLastRenewal(initialIncumbent.incumbent_last_renewal ?? '');
    setCycle(initialIncumbent.incumbent_cycle ?? 'unknown');
    setAccountId(initialAccountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggestion.id, initialAccountId]);

  const handleSubmit = async () => {
    const edits: ApproveEdits = {};
    if (accountId && accountId !== suggestion.account_id) edits.account_id = accountId;
    if (isIncumbent) {
      if (vendor !== (initialIncumbent.incumbent_vendor ?? '')) edits.incumbent_vendor = vendor;
      if (evidence !== (initialIncumbent.incumbent_evidence ?? '')) edits.incumbent_evidence = evidence;
      if (lastRenewal !== (initialIncumbent.incumbent_last_renewal ?? '')) edits.incumbent_last_renewal = lastRenewal;
      if (cycle !== (initialIncumbent.incumbent_cycle ?? 'unknown')) edits.incumbent_cycle = cycle;
    } else {
      if (title !== (initialPayload.title ?? '')) edits.title = title;
      if (isTask) {
        if (description !== (initialPayload.description ?? '')) edits.description = description;
        if (dueDate !== (initialPayload.due_date ?? '')) edits.due_date = dueDate;
        if (assignee !== (initialPayload.assignee_user_id ?? '')) edits.assignee_user_id = assignee;
      } else {
        if (content !== (initialPayload.content_markdown ?? '')) edits.content_markdown = content;
      }
    }
    setSubmitting(true);
    try {
      await onSubmit(edits);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!accountId && !submitting && (
    isIncumbent ? vendor.trim().length > 0 && evidence.trim().length > 0 : title.trim().length > 0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Edit & approve {isIncumbent ? 'incumbent capture' : isTask ? 'task' : 'note'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Account</Label>
            <AccountMatchPill
              accountId={accountId}
              suggestedName={suggestion.suggested_account_name}
              confidence={suggestion.confidence_score}
              onSelect={(id) => setAccountId(id)}
            />
          </div>

          {isIncumbent ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="sug-vendor">Incumbent vendor</Label>
                <Input id="sug-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sug-evidence">Evidence (verbatim quote)</Label>
                <Textarea id="sug-evidence" rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sug-renewal">Last renewal (optional)</Label>
                  <Input id="sug-renewal" type="date" value={lastRenewal} onChange={(e) => setLastRenewal(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sug-cycle">Cycle</Label>
                  <Select value={cycle} onValueChange={(v) => setCycle(v as typeof cycle)}>
                    <SelectTrigger id="sug-cycle"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="biennial">Biennial</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="sug-title">Title</Label>
                <Input id="sug-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              {isTask ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="sug-desc">Description</Label>
                    <Textarea id="sug-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="sug-due">Due</Label>
                      <Input id="sug-due" placeholder="2026-06-01 or Q3" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sug-assignee">Assignee email</Label>
                      <Input id="sug-assignee" placeholder="name@example.com" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="sug-content">Content (markdown)</Label>
                  <Textarea id="sug-content" rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

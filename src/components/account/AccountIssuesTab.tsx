import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useTasksDB } from '@/hooks/useProjectsDB';
import { useProfile } from '@/hooks/useProfile';
import { db } from '@/demo/db';
import { TaskStatusIcon } from '@/components/TaskStatusIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SectionCard, SectionAddButton } from '@/components/ui/section-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { AccountIssueRow } from '@/components/account/AccountIssueRow';
import { isTerminalStatus, splitIssuesByCompletion } from '@/lib/issueSort';
import type { DbTask } from '@/hooks/useProjectsDB';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { TableSkeleton } from '@/components/ui/skeleton';

// Lazy: the panel drags in DocumentEditor + dnd-kit. Keep them out of the
// account route's initial load — only fetched when an issue is opened.
const IssueDetailPanel = lazy(() =>
  import('@/components/issues/IssueDetailPanel').then(m => ({ default: m.IssueDetailPanel })),
);

interface AccountIssuesTabProps {
  accountId: string;
}

/**
 * The account's issues: open work first, finished work collapsed below.
 * Production pairs this with projects and customer requests in a Delivery tab;
 * the portfolio edition keeps the issue list alone.
 */
export function AccountIssuesTab({ accountId }: AccountIssuesTabProps) {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const { tasks: allTasks, addTask, updateTask, deleteTask: removeTask } = useTasksDB(undefined, orgId || undefined);
  // Standalone issues: directly attached to this account, no milestone
  const standaloneIssues = useMemo(
    () => allTasks.filter(t => t.account_id === accountId && !t.milestone_id && !t.parent_id),
    [allTasks, accountId],
  );
  // Finished issues collapse out of the way so the active list stays short.
  const { open: openIssues, done: doneIssues } = useMemo(
    () => splitIssuesByCompletion(standaloneIssues),
    [standaloneIssues],
  );
  const [doneOpen, setDoneOpen] = useState(false);

  // Inline standalone-issue create state
  const [newIssueOpen, setNewIssueOpen] = useState(false);
  const [newIssueName, setNewIssueName] = useState("");
  const [deleteIssueId, setDeleteIssueId] = useState<string | null>(null);

  // Issue detail panel (mounted in a right-side Sheet, essentials only —
  // no documents/relations/requests/SLA sections for standalone account issues)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const selectedIssue = selectedIssueId ? allTasks.find(t => t.id === selectedIssueId) : undefined;
  const selectedSubTasks = selectedIssue ? allTasks.filter(t => t.parent_id === selectedIssue.id) : [];
  const selectedParent = selectedIssue?.parent_id
    ? allTasks.find(t => t.id === selectedIssue.parent_id) || null
    : null;

  async function createStandaloneIssue() {
    const name = newIssueName.trim();
    if (!name || !orgId) return;
    const { error } = await addTask({
      name,
      organization_id: orgId,
      account_id: accountId,
      milestone_id: null,
      status: 'todo',
      assigned_role: 'CSM',
    } as any);
    if (error) { toast.error('Failed to create issue'); return; }
    setNewIssueName("");
    setNewIssueOpen(false);
  }

  // Completing an issue moves it out of the open list — open the Completed
  // section so it's clear where it went instead of looking like a deletion.
  function changeIssueStatus(task: DbTask, status: string) {
    if (isTerminalStatus(status) && !isTerminalStatus(task.status)) setDoneOpen(true);
    updateTask(task.id, { status, is_done: status === 'done' });
  }

  // Org members
  const [orgMembers, setOrgMembers] = useState<{ user_id: string; display_name: string | null }[]>([]);
  useEffect(() => {
    if (!orgId) return;
    db.from('profiles').select('user_id, display_name').eq('organization_id', orgId)
      .then(({ data }) => setOrgMembers(data || []));
  }, [orgId]);

  const openIssueCreate = () => { setNewIssueOpen(true); setNewIssueName(""); };

  return (
    <div className="space-y-6">
      {/* Standalone Issues (not tied to a project/milestone) */}
      <SectionCard
        title="Issues"
        action={standaloneIssues.length > 0 && !newIssueOpen && (
          <SectionAddButton label="Add issue" onClick={openIssueCreate} />
        )}
      >
        {newIssueOpen && (
          <div className="border rounded-sm p-2 mb-2 flex items-center gap-2">
            <TaskStatusIcon status="todo" size={14} />
            <Input
              autoFocus
              placeholder="Issue title..."
              value={newIssueName}
              onChange={e => setNewIssueName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') createStandaloneIssue();
                if (e.key === 'Escape') { setNewIssueOpen(false); setNewIssueName(""); }
              }}
              className="h-7 text-xs border-dashed"
            />
            <Button size="sm" className="h-7 text-xs" onClick={createStandaloneIssue} disabled={!newIssueName.trim()}>Create</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setNewIssueOpen(false); setNewIssueName(""); }}>Cancel</Button>
          </div>
        )}

        {standaloneIssues.length === 0 && !newIssueOpen && (
          <EmptyState
            compact
            title="No issues yet"
            description="Track standalone work items for this account."
            action={<Button size="sm" variant="outline" onClick={openIssueCreate}>Create issue</Button>}
          />
        )}

        {openIssues.length > 0 && (
          <div className="border rounded-sm divide-y">
            {openIssues.map(t => (
              <AccountIssueRow
                key={t.id}
                task={t}
                orgMembers={orgMembers}
                isSelected={selectedIssueId === t.id}
                onUpdate={patch => updateTask(t.id, patch)}
                onStatusChange={v => changeIssueStatus(t, v)}
                onOpenPanel={() => setSelectedIssueId(t.id)}
                onDelete={() => setDeleteIssueId(t.id)}
              />
            ))}
          </div>
        )}

        {/* Everything is finished — say so rather than reusing "No issues yet", which would be a lie. */}
        {openIssues.length === 0 && doneIssues.length > 0 && (
          <div className="border rounded-sm px-3 py-6 text-center text-xs text-muted-foreground">
            No open issues.
          </div>
        )}

        {doneIssues.length > 0 && (
          <Collapsible open={doneOpen} onOpenChange={setDoneOpen} className="mt-2">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 h-7 px-1 -mx-1 rounded-sm text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className={cn("h-3 w-3 transition-transform", doneOpen && "rotate-180")} />
                Completed · {doneIssues.length}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border rounded-sm divide-y mt-1.5">
                {doneIssues.map(t => (
                  <AccountIssueRow
                    key={t.id}
                    task={t}
                    orgMembers={orgMembers}
                    isSelected={selectedIssueId === t.id}
                    onUpdate={patch => updateTask(t.id, patch)}
                    onStatusChange={v => changeIssueStatus(t, v)}
                    onOpenPanel={() => setSelectedIssueId(t.id)}
                    onDelete={() => setDeleteIssueId(t.id)}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </SectionCard>

      {/* Issue detail — the shared panel in a right-side sheet.
          Only the essential props are passed; documents/relations/requests/SLA
          sections stay out (they're optional in IssueDetailPanelProps). */}
      <Sheet open={!!selectedIssue} onOpenChange={open => { if (!open) setSelectedIssueId(null); }}>
        <SheetContent
          side="right"
          className="p-0 gap-0 w-[340px] sm:max-w-[340px] [&>button]:hidden"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Issue details</SheetTitle>
          {selectedIssue && (
            <Suspense fallback={<TableSkeleton rows={5} label="Loading issues" />}>
            <IssueDetailPanel
              task={selectedIssue}
              parentTask={selectedParent}
              subTasks={selectedSubTasks}
              orgMembers={orgMembers}
              milestones={[]}
              onUpdate={async patch => { await updateTask(selectedIssue.id, patch); }}
              onDelete={() => { setSelectedIssueId(null); setDeleteIssueId(selectedIssue.id); }}
              onClose={() => setSelectedIssueId(null)}
              onSelectTask={setSelectedIssueId}
            />
            </Suspense>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Issue confirmation */}
      <AlertDialog open={!!deleteIssueId} onOpenChange={() => setDeleteIssueId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this issue?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteIssueId) {
                  if (selectedIssueId === deleteIssueId) setSelectedIssueId(null);
                  await removeTask(deleteIssueId);
                  setDeleteIssueId(null);
                  toast.success('Issue deleted');
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

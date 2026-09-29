import { useState, useEffect, useMemo } from 'react';
import { CornerDownRight, MoreHorizontal, Trash2, Copy, Pencil, Plus, X as XIcon, FileText, ArrowLeft, Triangle, Ban, AlertTriangle, Link2, GripVertical, ListTree, MessageSquare, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TaskStatusIcon, PriorityIcon, STATUS_LABELS, PRIORITY_LABELS, type TaskStatus, type TaskPriority } from '@/components/TaskStatusIcon';
import { InlineDueDate } from '@/components/InlineDueDate';
import { MilestoneIcon } from '@/components/MilestoneIcon';
import { DocumentEditor } from '@/components/DocumentEditor';
import { SlaDetailCard } from '@/components/SlaDetailCard';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DbTask } from '@/hooks/useProjectsDB';
import type { TaskDocument } from '@/hooks/useTaskDocumentsDB';
import type { ResolvedRelation, RelationType } from '@/hooks/useTaskRelationsDB';
import type { CustomerRequest } from '@/hooks/useCustomerRequestsDB';
import { EditableTitle } from '@/components/EditableTitle';
import { IncumbentWindowActions } from '@/components/account/IncumbentWindowActions';
import {
  isIncumbentWindowTask,
  snoozeIncumbentPatch,
  discardIncumbentPatch,
} from '@/lib/incumbentAccount';
import { transitionStage } from '@/lib/transitionStage';
import { useAccounts, type Account } from '@/contexts/AccountsContext';
import { useQueryClient } from '@tanstack/react-query';

const ALL_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'];
const ALL_PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'no_priority'];

const RELATION_TYPES: { value: RelationType | 'blocked_by'; label: string; icon: React.ReactNode }[] = [
  { value: 'blocks', label: 'Blocks', icon: <Ban className="h-3 w-3" /> },
  { value: 'blocked_by', label: 'Blocked by', icon: <AlertTriangle className="h-3 w-3" /> },
  { value: 'related', label: 'Related to', icon: <Link2 className="h-3 w-3" /> },
  { value: 'duplicate', label: 'Duplicate of', icon: <Copy className="h-3 w-3" /> },
];

/* ── Tiny shared row used in the meta grid. Uniform 28px height. ── */
function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-muted-foreground text-[11px] flex items-center h-7">{label}</span>
      <div className="flex items-center min-h-7 min-w-0">{children}</div>
    </>
  );
}

function EmptyValue() {
  return <span className="text-muted-foreground/50">—</span>;
}

/* ── Sortable sub-issue row ── */
function SortableSubIssue({ sub, orgMembers, onSelect }: {
  sub: DbTask; orgMembers: Array<{ user_id: string; display_name: string | null }>; onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sub.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-1.5 py-1 px-1 rounded-sm hover:bg-muted/30 cursor-pointer group"
      onClick={() => onSelect(sub.id)}
    >
      <button {...attributes} {...listeners} className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity touch-none" onClick={e => e.stopPropagation()}>
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </button>
      <TaskStatusIcon status={(sub.status as TaskStatus) || 'todo'} size={14} />
      <span className={cn("text-xs flex-1 truncate", sub.status === 'done' && 'line-through text-muted-foreground')}>{sub.name}</span>
      {sub.assign_to && (
        <span className="text-[10px] text-muted-foreground">
          {orgMembers.find(m => m.user_id === sub.assign_to)?.display_name?.[0] || '?'}
        </span>
      )}
    </div>
  );
}

function RelationRow({ relation, onRemove, onNavigate }: {
  relation: ResolvedRelation;
  onRemove: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 group">
      <TaskStatusIcon status={(relation.related_task_status as TaskStatus) || 'todo'} size={13} />
      <button onClick={() => onNavigate(relation.related_task_id)} className="text-xs truncate flex-1 text-left hover:underline">
        {relation.related_task_name}
      </button>
      <button onClick={() => onRemove(relation.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-opacity">
        <XIcon className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}

/* ── Compact, collapsible pill used for Sub-issues / Documents / Requests / Relations ── */
function SectionPill({
  icon, label, count, expanded, onToggle, onAdd, children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  children?: React.ReactNode;
}) {
  const isEmpty = count === 0;
  return (
    <div className={cn(
      'rounded-sm border border-transparent',
      expanded && 'border-border/50 bg-muted/20 col-span-2',
    )}>
      <button
        type="button"
        onClick={() => { if (isEmpty) { onAdd?.(); } else { onToggle(); } }}
        className="w-full flex items-center gap-1.5 px-1.5 h-7 rounded-sm hover:bg-muted/40 text-left"
      >
        <span className="text-muted-foreground shrink-0 flex items-center">{icon}</span>
        <span className="text-[11px] font-medium text-foreground/80 truncate">
          {label}
          {count > 0 && <span className="ml-1 text-muted-foreground/70 font-normal">· {count}</span>}
        </span>
        <span className="ml-auto flex items-center gap-0.5 shrink-0">
          {!isEmpty && (
            <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
          )}
          {onAdd && (
            <span
              role="button"
              tabIndex={-1}
              aria-label={`Add ${label}`}
              onClick={(e) => { e.stopPropagation(); onAdd(); }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center"
            >
              <Plus className="h-3 w-3" />
            </span>
          )}
        </span>
      </button>
      {expanded && !isEmpty && children && (
        <div className="px-1.5 pb-2 pt-0.5">{children}</div>
      )}
    </div>
  );
}

export interface IssueDetailPanelProps {
  task: DbTask;
  parentTask?: DbTask | null;
  subTasks: DbTask[];
  orgMembers: Array<{ user_id: string; display_name: string | null }>;
  milestones: Array<{ id: string; title: string }>;
  // labels
  projectName?: string | null;
  milestoneName?: string | null;
  // callbacks
  onUpdate: (patch: Partial<DbTask>) => void | Promise<void>;
  onDelete: () => void;
  onClose: () => void;
  onSelectTask: (id: string) => void;
  onAddSubIssue?: () => void;
  onReorderSubIssues?: (orderedIds: string[]) => void;
  onEditDetails?: () => void;
  // optional sections
  documents?: TaskDocument[];
  onAddDocument?: () => Promise<{ id: string; title: string } | null>;
  onUpdateDocument?: (id: string, patch: Partial<TaskDocument>) => void;
  onDeleteDocument?: (id: string) => void;
  relations?: {
    blocks: ResolvedRelation[];
    blockedBy: ResolvedRelation[];
    related: ResolvedRelation[];
    duplicateOf: ResolvedRelation[];
    duplicatedBy: ResolvedRelation[];
    addRelation: (sourceId: string, targetId: string, type: RelationType) => Promise<unknown>;
    removeRelation: (id: string) => void;
    candidates: Array<{ task: DbTask; projectName?: string }>;
    setSearch: (s: string) => void;
    search: string;
  };
  requests?: {
    items: CustomerRequest[];
    accounts: Array<{ id: string; name: string }>;
    accountMap: Record<string, string>;
    addRequest: (input: { account_id: string; title: string; body?: string; task_id?: string | null; contact_name?: string | null }) => Promise<unknown>;
    deleteRequest: (id: string) => void;
    toggleImportant: (id: string) => void;
  };
  slaRules?: any[];
}

export function IssueDetailPanel(props: IssueDetailPanelProps) {
  const {
    task, parentTask, subTasks, orgMembers, milestones,
    projectName, milestoneName,
    onUpdate, onDelete, onClose, onSelectTask,
    onAddSubIssue, onReorderSubIssues, onEditDetails,
    documents, onAddDocument, onUpdateDocument, onDeleteDocument,
    relations, requests, slaRules,
  } = props;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  // Used only by the incumbent renewal-window actions below.
  const qc = useQueryClient();
  const { updateAccount } = useAccounts();

  // Document viewer state
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [docTitleDraft, setDocTitleDraft] = useState('');
  const activeDoc = activeDocId && documents ? documents.find(d => d.id === activeDocId) : null;
  useEffect(() => { setActiveDocId(null); }, [task.id]);

  // Relation dialog state
  const [relationDialogOpen, setRelationDialogOpen] = useState(false);
  const [relationTypeFilter, setRelationTypeFilter] = useState<RelationType | 'blocked_by'>('related');

  // Request dialog state
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({ title: '', accountId: '', contactName: '', body: '' });

  // Which compact section is expanded (only one at a time)
  type SectionKey = 'sub' | 'docs' | 'requests' | 'relations';
  const [expandedSection, setExpandedSection] = useState<SectionKey | null>(null);
  const toggleSection = (k: SectionKey) => setExpandedSection(s => (s === k ? null : k));
  useEffect(() => { setExpandedSection(null); }, [task.id]);

  const code = (task as any).code as string | undefined;
  const status = (task.status as TaskStatus) || 'todo';
  const priority = (task.priority as TaskPriority) || 'no_priority';

  const handleSubDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id || !onReorderSubIssues) return;
    const oldI = subTasks.findIndex(s => s.id === active.id);
    const newI = subTasks.findIndex(s => s.id === over.id);
    if (oldI === -1 || newI === -1) return;
    onReorderSubIssues(arrayMove(subTasks, oldI, newI).map(s => s.id));
  };

  const totalRelations = relations
    ? relations.blocks.length + relations.blockedBy.length + relations.related.length + relations.duplicateOf.length + relations.duplicatedBy.length
    : 0;

  // ── Document viewer (full-panel takeover) ──
  if (activeDoc && onUpdateDocument && onDeleteDocument) {
    return (
      <div className="w-[340px] shrink-0 h-full overflow-y-auto flex flex-col border-l">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <button onClick={() => setActiveDocId(null)} className="p-1 rounded hover:bg-muted" aria-label="Back">
            <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <input
            className="flex-1 text-sm font-semibold bg-transparent outline-none placeholder:text-muted-foreground/50"
            value={docTitleDraft}
            onChange={e => setDocTitleDraft(e.target.value)}
            onBlur={() => { if (docTitleDraft.trim() && docTitleDraft !== activeDoc.title) onUpdateDocument(activeDoc.id, { title: docTitleDraft.trim() }); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
          <button onClick={() => { onDeleteDocument(activeDoc.id); setActiveDocId(null); }} className="p-1 rounded hover:bg-muted" aria-label="Delete document">
            <Trash2 className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col px-4 py-2">
          <DocumentEditor
            content={activeDoc.content}
            onChange={(v) => onUpdateDocument(activeDoc.id, { content: v })}
            placeholder="Start writing..."
          />
        </div>
        <div className="px-4 py-2 border-t">
          <p className="text-[10px] text-muted-foreground">Last edited {new Date(activeDoc.updated_at).toLocaleDateString('en-US')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[340px] shrink-0 h-full overflow-y-auto flex flex-col border-l bg-background">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-3 border-b">
        {parentTask && (
          <button
            onClick={() => onSelectTask(parentTask.id)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mb-1.5"
          >
            <CornerDownRight className="h-3 w-3 rotate-180" /> <span className="truncate">{parentTask.name}</span>
          </button>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              {code && (
                <button
                  onClick={() => { navigator.clipboard.writeText(code); toast.success('Code copied'); }}
                  className="font-mono text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                  title="Click to copy"
                >{code}</button>
              )}
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <TaskStatusIcon status={status} size={11} />
                {STATUS_LABELS[status]}
              </span>
            </div>
            <EditableTitle as="h2" value={task.name} onSave={v => onUpdate({ name: v })} placeholder="Issue title" />
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded hover:bg-muted" aria-label="More actions">
                  <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {onEditDetails && (
                  <DropdownMenuItem onClick={onEditDetails} className="text-xs gap-2">
                    <Pencil className="h-3.5 w-3.5" /> Edit details
                  </DropdownMenuItem>
                )}
                {code && (
                  <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(code); toast.success('Code copied'); }} className="text-xs gap-2">
                    <Copy className="h-3.5 w-3.5" /> Copy code
                  </DropdownMenuItem>
                )}
                {(onEditDetails || code) && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={onDelete} className="text-xs gap-2 text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" /> Delete issue
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Close (Esc)">
              <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Top fixed block: properties + compact section pills */}
        <div className="shrink-0 px-4 pt-4 pb-3 space-y-3 border-b">
          {/* Properties */}
          <div className="grid grid-cols-[78px_1fr] gap-y-0.5 text-xs items-center">
            <MetaRow label="Status">
              <Select value={status} onValueChange={v => onUpdate({ status: v, is_done: v === 'done' } as Partial<DbTask>)}>
                <SelectTrigger className="h-7 w-auto text-xs border-none shadow-none px-1.5 -mx-1.5 gap-1 rounded-sm justify-start hover:bg-muted/50 data-[state=open]:bg-muted/50 [&>svg]:ml-0.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-0 hover:[&>svg]:opacity-50 data-[state=open]:[&>svg]:opacity-50">
                  <span className="flex items-center gap-1.5">
                    <TaskStatusIcon status={status} size={13} />
                    <span>{STATUS_LABELS[status]}</span>
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-1.5"><TaskStatusIcon status={s} size={12} />{STATUS_LABELS[s]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </MetaRow>

            <MetaRow label="Priority">
              <Select value={priority} onValueChange={v => onUpdate({ priority: v === 'no_priority' ? null : v } as Partial<DbTask>)}>
                <SelectTrigger className="h-7 w-auto text-xs border-none shadow-none px-1.5 -mx-1.5 gap-1 rounded-sm justify-start hover:bg-muted/50 data-[state=open]:bg-muted/50 [&>svg]:ml-0.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-0 hover:[&>svg]:opacity-50 data-[state=open]:[&>svg]:opacity-50">
                  <span className={cn("flex items-center gap-1.5", !task.priority && "text-muted-foreground")}>
                    <PriorityIcon priority={priority} size={13} />
                    <span>{PRIORITY_LABELS[priority]}</span>
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {ALL_PRIORITIES.map(p => (
                    <SelectItem key={p} value={p}>
                      <span className="flex items-center gap-1.5"><PriorityIcon priority={p} size={12} />{PRIORITY_LABELS[p]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </MetaRow>

            {projectName !== undefined && (
              <MetaRow label="Project">
                {projectName ? <span className="truncate" title={projectName}>{projectName}</span> : <EmptyValue />}
              </MetaRow>
            )}

            <MetaRow label="Milestone">
              {milestones.length > 0 ? (
                <Select
                  value={task.milestone_id || '__none'}
                  onValueChange={v => onUpdate({ milestone_id: v === '__none' ? null : v } as Partial<DbTask>)}
                >
                  <SelectTrigger className="h-7 w-auto text-xs border-none shadow-none px-1.5 -mx-1.5 gap-1 rounded-sm justify-start hover:bg-muted/50 data-[state=open]:bg-muted/50 [&>svg]:ml-0.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-0 hover:[&>svg]:opacity-50 data-[state=open]:[&>svg]:opacity-50">
                    <span className={cn("flex items-center gap-1.5", !task.milestone_id && "text-muted-foreground/70")}>
                      <MilestoneIcon size={12} />
                      <span className="truncate">{milestoneName || (task.milestone_id ? milestones.find(m => m.id === task.milestone_id)?.title : '') || 'No milestone'}</span>
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No milestone</SelectItem>
                    {milestones.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-1.5"><MilestoneIcon size={12} />{m.title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : <EmptyValue />}
            </MetaRow>

            <MetaRow label="Assignee">
              <Select
                value={task.assign_to || '__unassigned'}
                onValueChange={v => onUpdate({ assign_to: v === '__unassigned' ? null : v } as Partial<DbTask>)}
              >
                <SelectTrigger className="h-7 w-auto text-xs border-none shadow-none px-1.5 -mx-1.5 gap-1 rounded-sm justify-start hover:bg-muted/50 data-[state=open]:bg-muted/50 [&>svg]:ml-0.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-0 hover:[&>svg]:opacity-50 data-[state=open]:[&>svg]:opacity-50">
                  <span className={cn("truncate", !task.assign_to && "text-muted-foreground/70")}>
                    {task.assign_to
                      ? (orgMembers.find(m => m.user_id === task.assign_to)?.display_name || 'Assigned')
                      : 'Unassigned'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned">Unassigned</SelectItem>
                  {orgMembers.map(m => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.display_name || 'Unnamed'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </MetaRow>

            <MetaRow label="Due">
              <div className="px-1.5 -mx-1.5 rounded-sm hover:bg-muted/50 transition-colors">
                <InlineDueDate
                  value={task.due_date}
                  isDone={status === 'done' || status === 'cancelled'}
                  onCommit={v => onUpdate({ due_date: v } as Partial<DbTask>)}
                  variant="label"
                />
              </div>
            </MetaRow>

            {slaRules && (
              <MetaRow label="SLA">
                <SlaDetailCard task={task as any} slaRules={slaRules} />
              </MetaRow>
            )}
          </div>

          {/* Compact section pills (Sub-issues / Documents / Requests / Relations) */}
          <div className="grid grid-cols-2 gap-1">
            <SectionPill
              icon={<ListTree className="h-3.5 w-3.5" />}
              label="Sub-issues"
              count={subTasks.length}
              expanded={expandedSection === 'sub'}
              onToggle={() => toggleSection('sub')}
              onAdd={onAddSubIssue}
            >
              {onReorderSubIssues ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubDragEnd}>
                  <SortableContext items={subTasks.map(s => s.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-0.5">
                      {subTasks.map(sub => (
                        <SortableSubIssue key={sub.id} sub={sub} orgMembers={orgMembers} onSelect={onSelectTask} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="space-y-0.5">
                  {subTasks.map(sub => (
                    <div key={sub.id} className="flex items-center gap-2 py-1 px-1 rounded-sm hover:bg-muted/30 cursor-pointer" onClick={() => onSelectTask(sub.id)}>
                      <TaskStatusIcon status={(sub.status as TaskStatus) || 'todo'} size={14} />
                      <span className={cn("text-xs flex-1 truncate", sub.status === 'done' && 'line-through text-muted-foreground')}>{sub.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionPill>

            {documents && onAddDocument && onUpdateDocument && onDeleteDocument && (
              <SectionPill
                icon={<FileText className="h-3.5 w-3.5" />}
                label="Documents"
                count={documents.length}
                expanded={expandedSection === 'docs'}
                onToggle={() => toggleSection('docs')}
                onAdd={async () => { const r = await onAddDocument(); if (r) { setActiveDocId(r.id); setDocTitleDraft(r.title); } }}
              >
                <div className="space-y-0.5">
                  {documents.map(doc => (
                    <div key={doc.id}
                      className="flex items-center gap-2 py-1 px-1 rounded-sm hover:bg-muted/30 cursor-pointer group"
                      onClick={() => { setActiveDocId(doc.id); setDocTitleDraft(doc.title); }}
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs flex-1 truncate">{doc.title}</span>
                      <button
                        onClick={e => { e.stopPropagation(); onDeleteDocument(doc.id); }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-opacity"
                      >
                        <XIcon className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </SectionPill>
            )}

            {requests && (
              <SectionPill
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label="Requests"
                count={requests.items.length}
                expanded={expandedSection === 'requests'}
                onToggle={() => toggleSection('requests')}
                onAdd={() => { setRequestForm({ title: '', accountId: '', contactName: '', body: '' }); setRequestDialogOpen(true); }}
              >
                <div className="space-y-0.5">
                  {requests.items.map(req => (
                    <div key={req.id} className="flex items-center gap-1.5 py-1 px-1 rounded-sm hover:bg-muted/30 group">
                      <button onClick={() => requests.toggleImportant(req.id)} className="shrink-0">
                        <Triangle className={cn("h-3 w-3", req.is_important ? "fill-amber-500 text-amber-500" : "text-muted-foreground/30")} />
                      </button>
                      <span className="text-xs flex-1 truncate">{req.title}</span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">{requests.accountMap[req.account_id] || '—'}</span>
                      <button onClick={() => requests.deleteRequest(req.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-opacity">
                        <XIcon className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </SectionPill>
            )}

            {relations && (
              <SectionPill
                icon={<Link2 className="h-3.5 w-3.5" />}
                label="Relations"
                count={totalRelations}
                expanded={expandedSection === 'relations'}
                onToggle={() => toggleSection('relations')}
                onAdd={() => { setRelationTypeFilter('related'); relations.setSearch(''); setRelationDialogOpen(true); }}
              >
                <div className="space-y-1">
                  {relations.blocks.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-destructive mb-0.5">Blocks</p>
                      {relations.blocks.map(r => <RelationRow key={r.id} relation={r} onRemove={relations.removeRelation} onNavigate={onSelectTask} />)}
                    </div>
                  )}
                  {relations.blockedBy.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-orange-500 mb-0.5">Blocked by</p>
                      {relations.blockedBy.map(r => <RelationRow key={r.id} relation={r} onRemove={relations.removeRelation} onNavigate={onSelectTask} />)}
                    </div>
                  )}
                  {relations.related.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Related</p>
                      {relations.related.map(r => <RelationRow key={r.id} relation={r} onRemove={relations.removeRelation} onNavigate={onSelectTask} />)}
                    </div>
                  )}
                  {(relations.duplicateOf.length > 0 || relations.duplicatedBy.length > 0) && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Duplicate</p>
                      {[...relations.duplicateOf, ...relations.duplicatedBy].map(r => <RelationRow key={r.id} relation={r} onRemove={relations.removeRelation} onNavigate={onSelectTask} />)}
                    </div>
                  )}
                </div>
              </SectionPill>
            )}
          </div>

          {/* The account behind a renewal-window task is normally sitting in
              closed_lost, so it is invisible on the board. These actions are
              the only place it can be acted on without hunting for it. */}
          {isIncumbentWindowTask(task.tags) && (
            <IncumbentWindowActions
              accountId={task.account_id}
              onReopen={async () => {
                if (!task.account_id) return;
                try {
                  // Back into active outreach: the renewal window opening is
                  // exactly the moment the account is workable again.
                  await transitionStage(task.account_id, 'working', {});
                  await onUpdate({ is_done: true, status: 'done' } as Partial<DbTask>);
                  await qc.invalidateQueries({ queryKey: ['accounts'] });
                  toast.success('Account reopened');
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : 'Could not reopen the account');
                }
              }}
              onSnooze={async (days) => {
                if (!task.account_id) return;
                await updateAccount(
                  task.account_id,
                  snoozeIncumbentPatch(days, new Date()) as Partial<Account>,
                );
                await onUpdate({ is_done: true, status: 'done' } as Partial<DbTask>);
                toast.success(`Window pushed out ${days} days`);
              }}
              onDiscard={async (reason) => {
                if (!task.account_id) return;
                await updateAccount(
                  task.account_id,
                  discardIncumbentPatch(reason) as Partial<Account>,
                );
                await onUpdate({ is_done: true, status: 'done' } as Partial<DbTask>);
                toast.success('Window discarded');
              }}
            />
          )}

          {/* Success criteria (read-only legacy field) */}
          {(task.success_criteria || []).length > 0 && (
            <div className="pt-1">
              <p className="text-[10px] font-medium text-muted-foreground/70 mb-1.5">Success criteria</p>
              <ul className="list-disc list-inside space-y-0.5">
                {(task.success_criteria || []).map((c, i) => (
                  <li key={i} className="text-xs text-muted-foreground">{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Description — fills remaining height */}
        <div className="flex-1 min-h-0 flex flex-col px-4 pt-3 pb-3">
          <DocumentEditor
            content={task.objective || ''}
            onChange={(v) => onUpdate({ objective: v } as Partial<DbTask>)}
            placeholder="Write a description, or press / for commands"
          />
        </div>
      </div>

      {/* Add Request Dialog */}
      {requests && (
        <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogTitle className="text-sm font-semibold">Add customer request</DialogTitle>
            <div className="space-y-3 mt-2">
              <Select value={requestForm.accountId} onValueChange={v => setRequestForm(f => ({ ...f, accountId: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select account..." /></SelectTrigger>
                <SelectContent>
                  {requests.accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Request title" value={requestForm.title} onChange={e => setRequestForm(f => ({ ...f, title: e.target.value }))} className="h-8 text-xs" />
              <Input placeholder="Contact name (optional)" value={requestForm.contactName} onChange={e => setRequestForm(f => ({ ...f, contactName: e.target.value }))} className="h-8 text-xs" />
              <Textarea placeholder="Description (optional)" value={requestForm.body} onChange={e => setRequestForm(f => ({ ...f, body: e.target.value }))} className="text-xs min-h-[60px]" />
              <div className="flex justify-end">
                <Button size="sm" className="h-7 text-xs" disabled={!requestForm.title.trim() || !requestForm.accountId} onClick={async () => {
                  await requests.addRequest({ account_id: requestForm.accountId, title: requestForm.title.trim(), body: requestForm.body.trim(), task_id: task.id, contact_name: requestForm.contactName.trim() || null });
                  setRequestDialogOpen(false);
                }}>Add request</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Relation Dialog */}
      {relations && (
        <Dialog open={relationDialogOpen} onOpenChange={setRelationDialogOpen}>
          <DialogContent className="max-w-md p-0 gap-0">
            <div className="px-4 py-2.5 border-b">
              <DialogTitle className="text-xs text-muted-foreground font-normal">Add relation</DialogTitle>
            </div>
            <div className="px-4 py-2 border-b flex gap-1">
              {RELATION_TYPES.map(rt => (
                <button
                  key={rt.value}
                  onClick={() => setRelationTypeFilter(rt.value)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors",
                    relationTypeFilter === rt.value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >{rt.icon} {rt.label}</button>
              ))}
            </div>
            <Command className="border-none">
              <CommandInput placeholder="Search issues…" value={relations.search} onValueChange={relations.setSearch} />
              <CommandList>
                <CommandEmpty>No issues found.</CommandEmpty>
                <CommandGroup>
                  {relations.candidates.map(entry => (
                    <CommandItem
                      key={entry.task.id}
                      value={`${(entry.task as any).code || ''} ${entry.task.name}`}
                      onSelect={async () => {
                        if (relationTypeFilter === 'blocked_by') {
                          await relations.addRelation(entry.task.id, task.id, 'blocks');
                        } else {
                          await relations.addRelation(task.id, entry.task.id, relationTypeFilter as RelationType);
                        }
                        setRelationDialogOpen(false);
                      }}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <TaskStatusIcon status={(entry.task.status as TaskStatus) || 'todo'} size={14} />
                      {(entry.task as any).code && <span className="font-mono text-[10px] text-muted-foreground">{(entry.task as any).code}</span>}
                      <span className="text-xs flex-1 truncate">{entry.task.name}</span>
                      {entry.projectName && <span className="text-[10px] text-muted-foreground">{entry.projectName}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
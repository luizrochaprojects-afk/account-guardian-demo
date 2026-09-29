import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useTasksDB, useProjectsDB, type DbTask } from "@/hooks/useProjectsDB";
import { useProfile } from "@/hooks/useProfile";
import { useAccounts } from "@/contexts/AccountsContext";
import { db } from "@/demo/db";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X as XIcon, Plus, Upload, Trash2, ChevronRight, ChevronDown, CornerDownRight, GripVertical, Link2, Ban, AlertTriangle, Copy, FileText, ArrowLeft, Triangle, Flame, ListChecks, SearchX, MoreHorizontal, Pencil } from "lucide-react";
import { MilestoneIcon } from "@/components/MilestoneIcon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SlaIndicator } from "@/components/SlaIndicator";
import { SlaDetailCard } from "@/components/SlaDetailCard";
import { InlineDueDate, isOverdue, formatDueLabel } from "@/components/InlineDueDate";
import { useSlaRulesDB } from "@/hooks/useSlaRulesDB";
import { matchSlaRule, applySlaFields, getSlaStatus, SLA_STATUS_LABELS, type SlaStatus } from "@/lib/slaUtils";
import { matchesDueDate, type DueDateBucket } from "@/lib/dateRanges";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLoading } from "@/components/ui/list-loading";
import { SaveViewButton } from "@/components/views/SaveViewButton";
import { ViewPill } from "@/components/views/ViewPill";
import { ExportViewButton } from "@/components/views/ExportViewButton";
import { useCustomViews } from "@/hooks/useCustomViews";
import { useViewDisplayPersist } from "@/hooks/useViewDisplayPersist";
import { ViewDraftHeader } from "@/components/views/ViewDraftHeader";
import { DisplayOptionsPopover } from "@/components/views/DisplayOptionsPopover";
import { FilterPopover } from "@/components/views/FilterPopover";
import { FiltersIssuesSection } from "@/components/views/filters/FiltersIssuesSection";
import { usePeekFocus } from "@/hooks/usePeekFocus";
import { PeekCard } from "@/components/peek/PeekCard";
import { IssuePeekContent } from "@/components/peek/IssuePeekContent";
import { IssuePeekSkeleton } from "@/components/peek/PeekSkeleton";
import { useTaskDocumentsDB, type TaskDocument } from "@/hooks/useTaskDocumentsDB";
import { useCustomerRequestsDB } from "@/hooks/useCustomerRequestsDB";
import { DocumentEditor } from "@/components/DocumentEditor";
import { IssueDetailPanel } from "@/components/issues/IssueDetailPanel";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { TaskStatusIcon, PriorityIcon, STATUS_LABELS, PRIORITY_LABELS, type TaskStatus, type TaskPriority } from "@/components/TaskStatusIcon";
import { useIssueTemplatesDB, type IssueTemplate } from "@/hooks/useIssueTemplatesDB";
import { useTaskRelationsDB, useAllTaskRelations, type RelationType, type ResolvedRelation } from "@/hooks/useTaskRelationsDB";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { MultiSelectFilter, FilterChipGroup, ListToolbar, type MultiSelectOption } from "@/components/listing";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const RELATION_TYPES: { value: RelationType | 'blocked_by'; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'blocks', label: 'Blocks', icon: <Ban className="h-3 w-3" />, color: 'text-destructive' },
  { value: 'blocked_by', label: 'Blocked by', icon: <AlertTriangle className="h-3 w-3" />, color: 'text-orange-500' },
  { value: 'related', label: 'Related to', icon: <Link2 className="h-3 w-3" />, color: 'text-muted-foreground' },
  { value: 'duplicate', label: 'Duplicate of', icon: <Copy className="h-3 w-3" />, color: 'text-muted-foreground' },
];

const ALL_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'];
const ALL_PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'no_priority'];
const ROLE_OPTIONS = ['CSM', 'AE', 'AM', 'Support', 'PM', 'Eng'] as const;

/* ── Tiny shared row used in the detail panel meta grid. Keeps row height
   uniform (28px), aligns labels, and renders empty values muted. ── */
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

type ViewFilter = 'parents_only' | 'sub_only';

/* ── Sortable sub-issue row for detail panel ── */
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

/* ── Relation row in detail panel ── */
function RelationRow({ relation, onRemove, onNavigate }: {
  relation: ResolvedRelation;
  onRemove: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 group">
      <TaskStatusIcon status={(relation.related_task_status as TaskStatus) || 'todo'} size={13} />
      <button
        onClick={() => onNavigate(relation.related_task_id)}
        className="text-xs truncate flex-1 text-left hover:underline"
      >
        {relation.related_task_name}
      </button>
      <button
        onClick={() => onRemove(relation.id)}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-opacity"
      >
        <XIcon className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}

export default function Tasks() {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const { tasks, loading: tasksLoading, addTask, updateTask, deleteTask, getSubTasks, reorderSubTasks } = useTasksDB(undefined, orgId || undefined);
  const { projects } = useProjectsDB();
  const { accounts } = useAccounts();
  const { templates: issueTemplates, getDefault: getDefaultTemplate } = useIssueTemplatesDB();
  const { blockedTaskIds, blockingTaskIds, refetch: refetchAllRelations } = useAllTaskRelations();

  const { rules: slaRules } = useSlaRulesDB();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // When `?view=<id>` is in the URL we are viewing a saved custom view.
  // In that mode the page must hydrate filters/display ONLY from the saved
  // view's stored filters — never from the per-page localStorage namespace —
  // and must not write filter changes back into LS (otherwise tweaking a
  // filter inside a view leaks into the underlying /tasks toolbar state and,
  // worse, the LS hydration race can clobber the saved-view filters).
  // We read this BEFORE the LS-backed useState initializers below so the
  // initial render already gets clean defaults on /views/:id.
  const initialViewIdParam = (() => {
    if (typeof window === 'undefined') return null;
    try { return new URLSearchParams(window.location.search).get('view'); } catch { return null; }
  })();
  const isOnSavedView = !!initialViewIdParam;

  // Persisted view state (per-org)
  const TASKS_NS = `tasks:${orgId ?? 'anon'}`;
  const readLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
  const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

  // Multi-select filter state. Empty array = no filter applied.
  const parseArr = (raw: string | null, legacyAllValue = "all"): string[] => {
    if (!raw) return [];
    if (raw === legacyAllValue) return [];
    if (raw.startsWith("[")) { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }
    return raw.split(",").filter(Boolean);
  };
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(() => isOnSavedView ? [] : parseArr(readLS(`${TASKS_NS}:statusFilter`)));
  const [priorityFilter, setPriorityFilter] = useState<string[]>(() => isOnSavedView ? [] : parseArr(readLS(`${TASKS_NS}:priorityFilter`)));
  const [slaFilter, setSlaFilter] = useState<string[]>(() => isOnSavedView ? [] : parseArr(readLS(`${TASKS_NS}:slaFilter`)));
  const [accountFilter, setAccountFilter] = useState<string[]>(() => isOnSavedView ? [] : parseArr(readLS(`${TASKS_NS}:accountFilter`)));
  const [viewFilter, setViewFilter] = useState<ViewFilter[]>(() => isOnSavedView ? [] : parseArr(readLS(`${TASKS_NS}:viewFilter`)) as ViewFilter[]);
  const [hideCompleted, setHideCompleted] = useState(() => isOnSavedView ? false : readLS(`${TASKS_NS}:hideCompleted`) === "1");
  const [dueDateFilter, setDueDateFilter] = useState<DueDateBucket>(
    () => isOnSavedView ? 'any' : ((readLS(`${TASKS_NS}:dueDateFilter`) as DueDateBucket) || 'any'),
  );

  // ── Display options (view-scoped) ─────────────────────────
  const [grouping, setGrouping] = useState<'none'|'status'|'priority'|'account'|'project'|'assignee'>(() =>
    (readLS(`${TASKS_NS}:grouping`) as any) || 'none');
  const [ordering, setOrdering] = useState<'updated'|'created'|'priority'|'dueDate'|'title'>(() =>
    (readLS(`${TASKS_NS}:ordering`) as any) || 'updated');
  const [orderingDir, setOrderingDir] = useState<'asc'|'desc'>(() =>
    (readLS(`${TASKS_NS}:orderingDir`) as any) || 'desc');
  const [completed, setCompleted] = useState<'all'|'hide'|'only'>(() =>
    (readLS(`${TASKS_NS}:completed`) as any) || (readLS(`${TASKS_NS}:hideCompleted`) === '1' ? 'hide' : 'all'));
  const [showSubIssues, setShowSubIssues] = useState<boolean>(() =>
    readLS(`${TASKS_NS}:showSubIssues`) !== '0');
  const [displayProperties, setDisplayProperties] = useState<string[]>(() => {
    const raw = readLS(`${TASKS_NS}:displayProperties`);
    if (raw && raw.startsWith('[')) { try { return JSON.parse(raw); } catch {} }
    return ['status','priority','assignee','dueDate'];
  });

  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:grouping`, grouping); }, [grouping, TASKS_NS, isOnSavedView]);
  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:ordering`, ordering); }, [ordering, TASKS_NS, isOnSavedView]);
  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:orderingDir`, orderingDir); }, [orderingDir, TASKS_NS, isOnSavedView]);
  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:completed`, completed); }, [completed, TASKS_NS, isOnSavedView]);
  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:showSubIssues`, showSubIssues ? '1' : '0'); }, [showSubIssues, TASKS_NS, isOnSavedView]);
  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:displayProperties`, JSON.stringify(displayProperties)); }, [displayProperties, TASKS_NS, isOnSavedView]);

  const showProp = (p: string) => displayProperties.includes(p);

  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:statusFilter`, JSON.stringify(statusFilter)); }, [statusFilter, TASKS_NS, isOnSavedView]);
  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:priorityFilter`, JSON.stringify(priorityFilter)); }, [priorityFilter, TASKS_NS, isOnSavedView]);
  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:slaFilter`, JSON.stringify(slaFilter)); }, [slaFilter, TASKS_NS, isOnSavedView]);
  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:accountFilter`, JSON.stringify(accountFilter)); }, [accountFilter, TASKS_NS, isOnSavedView]);
  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:viewFilter`, JSON.stringify(viewFilter)); }, [viewFilter, TASKS_NS, isOnSavedView]);
  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:hideCompleted`, hideCompleted ? "1" : "0"); }, [hideCompleted, TASKS_NS, isOnSavedView]);
  useEffect(() => { if (isOnSavedView) return; writeLS(`${TASKS_NS}:dueDateFilter`, dueDateFilter); }, [dueDateFilter, TASKS_NS, isOnSavedView]);

  // Hydrate once orgId resolves (in case initial render used 'anon')
  const tasksHydratedRef = useRef(false);
  useEffect(() => {
    if (!orgId || tasksHydratedRef.current) return;
    tasksHydratedRef.current = true;
    // On a saved view, NEVER hydrate filters from localStorage. The saved
    // view's own hydration effect is the single source of truth, otherwise
    // we'd race and clobber `status: ['in_progress']` with `[]` from LS.
    if (isOnSavedView) return;
    const v1 = readLS(`${TASKS_NS}:statusFilter`); if (v1) setStatusFilter(parseArr(v1));
    const v2 = readLS(`${TASKS_NS}:priorityFilter`); if (v2) setPriorityFilter(parseArr(v2));
    const v3 = readLS(`${TASKS_NS}:slaFilter`); if (v3) setSlaFilter(parseArr(v3));
    const v4 = readLS(`${TASKS_NS}:accountFilter`); if (v4) setAccountFilter(parseArr(v4));
    const v5 = readLS(`${TASKS_NS}:viewFilter`); if (v5) setViewFilter(parseArr(v5) as ViewFilter[]);
    const v6 = readLS(`${TASKS_NS}:hideCompleted`); if (v6 !== null) setHideCompleted(v6 === "1");
    const v7 = readLS(`${TASKS_NS}:dueDateFilter`); if (v7) setDueDateFilter(v7 as DueDateBucket);
  }, [orgId, TASKS_NS, isOnSavedView]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  // ?selected=<taskId> IS the open detail panel — read straight off the URL,
  // never mirrored into state.
  //
  // This used to be a useState kept in sync with the URL by a pair of effects,
  // and the two of them deadlocked on arrival from a deep link. On mount the
  // writer ran before the reader's setState had landed, so it saw a null id
  // next to a populated ?selected= and "corrected" the URL by deleting the
  // param; the reader then saw the param gone and cleared the id; the writer
  // put it back. The page flipped between open and closed forever. Deriving
  // the id makes that class of bug unrepresentable: there is only one value
  // now, so there is nothing to disagree with.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTaskId = searchParams.get('selected');

  const setSelectedTaskId = useCallback((id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('selected', id);
      else next.delete('selected');
      return next;
      // replace so opening and closing the panel does not stack history
      // entries the reader has to click Back through.
    }, { replace: true });
  }, [setSearchParams]);

  // Expand the parent chain when the selected task is a sub-issue, so a deep
  // link to one does not land on a row that is collapsed out of sight.
  useEffect(() => {
    if (!selectedTaskId) return;
    const t = tasks.find(x => x.id === selectedTaskId);
    const parentId = t?.parent_id;
    if (!parentId) return;
    // Guarded: an unconditional new Set() every run would re-render forever.
    setExpandedParents(prev => (prev.has(parentId) ? prev : new Set(prev).add(parentId)));
  }, [selectedTaskId, tasks]);

  const [inlineParentId, setInlineParentId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', accountId: '', projectId: '', milestoneId: '', assignedRole: 'CSM', assignTo: '', dueLabel: '', objective: '',
    status: 'todo' as TaskStatus, priority: '' as string, parentId: '' as string, templateId: '' as string,
  });
  const [orgMembers, setOrgMembers] = useState<Array<{ user_id: string; display_name: string | null }>>([]);
  const [allMilestones, setAllMilestones] = useState<Record<string, { title: string; projectId: string }>>({});
  const [formMilestones, setFormMilestones] = useState<Array<{ id: string; title: string }>>([]);

  const accountMap = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a.name])), [accounts]);
  const projectMap = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects]);

  const loadFormMilestones = async (projectId: string) => {
    const { data } = await db.from('milestones').select('id, title').eq('project_id', projectId).order('position');
    setFormMilestones(data || []);
  };

  const loadAllMilestones = useCallback(async () => {
    if (!orgId) return;
    const { data } = await db.from('milestones').select('id, title, project_id');
    if (data) {
      const map: Record<string, { title: string; projectId: string }> = {};
      data.forEach(m => { map[m.id] = { title: m.title, projectId: m.project_id }; });
      setAllMilestones(map);
    }
  }, [orgId]);

  useEffect(() => { loadAllMilestones(); }, [loadAllMilestones]);

  useEffect(() => {
    if (!orgId) return;
    db.from('profiles').select('user_id, display_name').eq('organization_id', orgId)
      .then(({ data }) => setOrgMembers(data || []));
  }, [orgId]);

  const enrichedTasks = useMemo(() => {
    return tasks.map(t => {
      const ms = t.milestone_id ? allMilestones[t.milestone_id] : null;
      const proj = ms ? projectMap[ms.projectId] : null;
      const directAccountId = (t as any).account_id || '';
      const accountId = proj?.account_id || directAccountId;
      return {
        task: t,
        projectName: proj?.name || '',
        projectId: proj?.id || '',
        accountId,
        accountName: accountId ? (accountMap[accountId] || '') : '',
        milestoneName: ms?.title || '',
        isStandalone: !proj && !!directAccountId,
      };
    });
  }, [tasks, allMilestones, projectMap, accountMap]);

  const taskMap = useMemo(() => Object.fromEntries(enrichedTasks.map(e => [e.task.id, e])), [enrichedTasks]);

  // Build flat display list with parent/child hierarchy
  const displayList = useMemo(() => {
    let parentEntries = enrichedTasks.filter(e => !e.task.parent_id);
    const result: Array<typeof enrichedTasks[0] & { indent: boolean }> = [];

    // Apply filters to parents
    const matchesFilter = (e: typeof enrichedTasks[0]) => {
      if (search) {
        const q = search.toLowerCase();
        if (!e.task.name.toLowerCase().includes(q) &&
            !e.projectName.toLowerCase().includes(q) &&
            !((e.task as any).code || '').toLowerCase().includes(q)) return false;
      }
      if (statusFilter.length && !statusFilter.includes(e.task.status)) return false;
      if (priorityFilter.length && !priorityFilter.includes(e.task.priority || 'no_priority')) return false;
      if (accountFilter.length && !accountFilter.includes(e.accountId)) return false;
      // Completed display option (supersedes legacy hideCompleted)
      const isDone = e.task.status === 'done' || e.task.status === 'cancelled';
      if (completed === 'hide' && isDone) return false;
      if (completed === 'only' && !isDone) return false;
      if (slaFilter.length) {
        const s = getSlaStatus(e.task as any);
        // 'at_risk' meta-value matches medium/high risk + breached.
        const matchesAtRisk = slaFilter.includes('at_risk') && (s === 'medium_risk' || s === 'high_risk' || s === 'breached');
        const matchesExact = slaFilter.includes(s);
        if (!matchesAtRisk && !matchesExact) return false;
      }
      if (dueDateFilter !== 'any' && !matchesDueDate((e.task as any).due_date ?? null, dueDateFilter)) return false;
      return true;
    };

    // ── Ordering helper for parent rows ──
    const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, no_priority: 4 };
    const orderVal = (e: typeof enrichedTasks[0]) => {
      const t: any = e.task;
      switch (ordering) {
        case 'created':  return new Date(t.created_at || 0).getTime();
        case 'priority': return priorityRank[t.priority || 'no_priority'] ?? 4;
        case 'dueDate':  return t.due_date ? new Date(t.due_date).getTime() : Number.POSITIVE_INFINITY;
        case 'title':    return (t.name || '').toLowerCase();
        case 'updated':
        default:         return new Date(t.updated_at || 0).getTime();
      }
    };
    const dirMul = orderingDir === 'asc' ? 1 : -1;
    const compare = (a: typeof enrichedTasks[0], b: typeof enrichedTasks[0]) => {
      const va = orderVal(a), vb = orderVal(b);
      if (typeof va === 'string' || typeof vb === 'string') {
        return dirMul * String(va).localeCompare(String(vb));
      }
      return dirMul * ((va as number) - (vb as number));
    };
    parentEntries = [...parentEntries].sort(compare);

    // 'sub_only' wins when it's the only view value selected.
    if (viewFilter.includes('sub_only') && !viewFilter.includes('parents_only')) {
      return enrichedTasks.filter(e => !!e.task.parent_id && matchesFilter(e)).sort(compare).map(e => ({ ...e, indent: true }));
    }

    for (const parent of parentEntries) {
      const subs = enrichedTasks.filter(e => e.task.parent_id === parent.task.id).sort((a, b) => a.task.position - b.task.position);
      const parentMatches = matchesFilter(parent);
      const anySubMatches = showSubIssues && subs.some(s => matchesFilter(s));

      if (viewFilter.includes('parents_only') && !viewFilter.includes('sub_only')) {
        if (parentMatches) result.push({ ...parent, indent: false });
        continue;
      }

      if (parentMatches || anySubMatches) {
        result.push({ ...parent, indent: false });
        if (showSubIssues && expandedParents.has(parent.task.id)) {
          const filteredSubs = search || statusFilter.length || priorityFilter.length
            ? subs.filter(matchesFilter)
            : subs;
          result.push(...filteredSubs.map(s => ({ ...s, indent: true })));
        }
      }
    }

    return result;
  }, [enrichedTasks, search, statusFilter, priorityFilter, slaFilter, accountFilter, viewFilter, completed, expandedParents, ordering, orderingDir, showSubIssues, dueDateFilter]);

  const hasFilters = statusFilter.length > 0 || priorityFilter.length > 0 || viewFilter.length > 0
    || slaFilter.length > 0 || accountFilter.length > 0 || hideCompleted || !!search || dueDateFilter !== 'any';

  /** Group entries from `displayList` by the chosen Display option. Returns a
   * flat array suitable for rendering: each group is an `{ kind:'header', label, count }`
   * sentinel followed by `{ kind:'entry', entry }` items. Sub-issue rows are kept
   * inside their parent's group regardless of their own values. */
  const groupedRows = useMemo(() => {
    const out: Array<
      | { kind: 'header'; label: string; count: number; key: string }
      | { kind: 'entry'; entry: typeof displayList[number] }
    > = [];
    if (grouping === 'none') {
      for (const entry of displayList) out.push({ kind: 'entry', entry });
      return out;
    }
    const groupKeyFor = (entry: typeof displayList[number]): { key: string; label: string } => {
      const t = entry.task as any;
      switch (grouping) {
        case 'status': {
          const s = (t.status as TaskStatus) || 'todo';
          return { key: s, label: STATUS_LABELS[s] || s };
        }
        case 'priority': {
          const p = (t.priority as TaskPriority) || 'no_priority';
          return { key: p as string, label: PRIORITY_LABELS[p] || (p as string) };
        }
        case 'account': {
          const id = entry.accountId || '__none';
          return { key: id, label: id === '__none' ? 'No account' : (entry.accountName || id) };
        }
        case 'project': {
          const id = entry.projectId || '__none';
          return { key: id, label: id === '__none' ? 'No project' : (entry.projectName || id) };
        }
        case 'assignee': {
          const id = t.assign_to || '__unassigned';
          const name = t.assign_to ? (orgMembers.find(m => m.user_id === t.assign_to)?.display_name || 'Member') : 'Unassigned';
          return { key: id, label: name };
        }
        default:
          return { key: '__all', label: '' };
      }
    };
    // Walk display list; sub-issues (entry.indent === true) inherit their preceding
    // parent's group so the parent/child grouping isn't broken across sections.
    const groups = new Map<string, { label: string; entries: typeof displayList }>();
    let lastParentKey: { key: string; label: string } | null = null;
    for (const entry of displayList) {
      const target = entry.indent && lastParentKey ? lastParentKey : groupKeyFor(entry);
      if (!entry.indent) lastParentKey = target;
      const bucket = groups.get(target.key);
      if (bucket) bucket.entries.push(entry);
      else groups.set(target.key, { label: target.label, entries: [entry] });
    }
    for (const [key, { label, entries }] of groups) {
      out.push({ kind: 'header', key, label, count: entries.filter(e => !e.indent).length });
      for (const entry of entries) out.push({ kind: 'entry', entry });
    }
    return out;
  }, [displayList, grouping, orgMembers]);

  const clearFilters = () => {
    setStatusFilter([]); setPriorityFilter([]); setViewFilter([]);
    setSlaFilter([]); setAccountFilter([]); setHideCompleted(false); setSearch("");
    setDueDateFilter('any');
  };

  /* ── Multi-select option lists (counts mirror Linear) ─────────────
     For each facet, count tasks that pass *every other* active filter,
     so toggling Status doesn't make the Status counts collapse. */
  const facetCount = useCallback((excluded: 'status' | 'priority' | 'account' | 'sla' | 'view') => {
    return enrichedTasks.filter(e => {
      if (search) {
        const q = search.toLowerCase();
        if (!e.task.name.toLowerCase().includes(q) &&
            !e.projectName.toLowerCase().includes(q) &&
            !((e.task as any).code || '').toLowerCase().includes(q)) return false;
      }
      if (excluded !== 'status' && statusFilter.length && !statusFilter.includes(e.task.status)) return false;
      if (excluded !== 'priority' && priorityFilter.length && !priorityFilter.includes(e.task.priority || 'no_priority')) return false;
      if (excluded !== 'account' && accountFilter.length && !accountFilter.includes(e.accountId)) return false;
      if (hideCompleted && (e.task.status === 'done' || e.task.status === 'cancelled')) return false;
      if (excluded !== 'sla' && slaFilter.length) {
        const s = getSlaStatus(e.task as any);
        const matchesAtRisk = slaFilter.includes('at_risk') && (s === 'medium_risk' || s === 'high_risk' || s === 'breached');
        if (!matchesAtRisk && !slaFilter.includes(s)) return false;
      }
      return true;
    });
  }, [enrichedTasks, search, statusFilter, priorityFilter, accountFilter, slaFilter, hideCompleted]);

  const statusOptions: MultiSelectOption[] = useMemo(() => {
    const pool = facetCount('status');
    return ALL_STATUSES.map(s => ({
      value: s,
      label: STATUS_LABELS[s],
      icon: <TaskStatusIcon status={s} size={12} />,
      count: pool.filter(e => e.task.status === s).length,
    }));
  }, [facetCount]);

  const priorityOptions: MultiSelectOption[] = useMemo(() => {
    const pool = facetCount('priority');
    return ALL_PRIORITIES.map(p => ({
      value: p,
      label: PRIORITY_LABELS[p],
      icon: <PriorityIcon priority={p} size={12} />,
      count: pool.filter(e => (e.task.priority || 'no_priority') === p).length,
    }));
  }, [facetCount]);

  const accountOptions: MultiSelectOption[] = useMemo(() => {
    const pool = facetCount('account');
    return [...accounts]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(a => ({
        value: a.id,
        label: a.name,
        count: pool.filter(e => e.accountId === a.id).length,
      }));
  }, [facetCount, accounts]);

  const slaOptions: MultiSelectOption[] = useMemo(() => {
    const pool = facetCount('sla');
    const slaValues: SlaStatus[] = ["low_risk","medium_risk","high_risk","breached","achieved","failed","no_sla"];
    const atRiskCount = pool.filter(e => {
      const s = getSlaStatus(e.task as any);
      return s === 'medium_risk' || s === 'high_risk' || s === 'breached';
    }).length;
    return [
      { value: 'at_risk', label: 'At risk or breached', icon: <Flame className="h-3 w-3 text-destructive" />, count: atRiskCount },
      ...slaValues.map(s => ({
        value: s,
        label: SLA_STATUS_LABELS[s],
        icon: <Flame className="h-3 w-3" />,
        count: pool.filter(e => getSlaStatus(e.task as any) === s).length,
      })),
    ];
  }, [facetCount]);

  const viewOptions: MultiSelectOption[] = [
    { value: 'parents_only', label: 'Parent issues only' },
    { value: 'sub_only', label: 'Sub-issues only' },
  ];

  const dueDateOptions: { value: DueDateBucket; label: string }[] = [
    { value: 'any',        label: 'Any' },
    { value: 'overdue',    label: 'Overdue' },
    { value: 'today',      label: 'Today' },
    { value: 'tomorrow',   label: 'Tomorrow' },
    { value: 'this_week',  label: 'This week' },
    { value: 'this_month', label: 'This month' },
    { value: 'no_date',    label: 'No date' },
  ];
  const dueDateLabelFor = (v: string) => dueDateOptions.find(o => o.value === v)?.label || v;

  /* Lookup helpers for chips */
  const labelFor = (opts: MultiSelectOption[], v: string) => opts.find(o => o.value === v)?.label || v;

  // Custom view tracking
  const viewIdParam = searchParams.get('view');
  const { views: savedViews } = useCustomViews('issues');
  const activeSavedView = viewIdParam ? savedViews.find(v => v.id === viewIdParam) : null;
  const issueFilters = {
    status: statusFilter, priority: priorityFilter, sla: slaFilter, account: accountFilter, view: viewFilter,
    hideCompleted: completed === 'hide', search,
    dueDate: dueDateFilter,
    grouping, ordering, orderingDir, completed, showSubIssues, displayProperties,
  };

  // Patch handler used by DisplayOptionsPopover (via ViewDraftHeader)
  const handleDisplayChange = useCallback((patch: any) => {
    if (patch.grouping !== undefined) setGrouping(patch.grouping);
    if (patch.ordering !== undefined) setOrdering(patch.ordering);
    if (patch.orderingDir !== undefined) setOrderingDir(patch.orderingDir);
    if (patch.completed !== undefined) {
      setCompleted(patch.completed);
      setHideCompleted(patch.completed === 'hide');
    }
    if (patch.showSubIssues !== undefined) setShowSubIssues(patch.showSubIssues);
    if (patch.displayProperties !== undefined) setDisplayProperties(patch.displayProperties);
  }, []);

  // Apply saved view's display options when loaded
  useEffect(() => {
    if (!activeSavedView) return;
    const f = activeSavedView.filters as any;
    // Filters
    if (Array.isArray(f.status)) setStatusFilter(f.status);
    if (Array.isArray(f.priority)) setPriorityFilter(f.priority);
    if (Array.isArray(f.sla)) setSlaFilter(f.sla);
    if (Array.isArray(f.account)) setAccountFilter(f.account);
    if (Array.isArray(f.view)) setViewFilter(f.view as ViewFilter[]);
    if (typeof f.hideCompleted === 'boolean') setHideCompleted(f.hideCompleted);
    if (typeof f.search === 'string') setSearch(f.search);
    if (typeof f.dueDate === 'string') setDueDateFilter(f.dueDate);
    // Display options
    if (f.grouping !== undefined) setGrouping(f.grouping);
    if (f.ordering !== undefined) setOrdering(f.ordering);
    if (f.orderingDir !== undefined) setOrderingDir(f.orderingDir);
    if (f.completed !== undefined) { setCompleted(f.completed); setHideCompleted(f.completed === 'hide'); }
    if (f.showSubIssues !== undefined) setShowSubIssues(f.showSubIssues);
    if (f.displayProperties !== undefined) setDisplayProperties(f.displayProperties);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSavedView?.id, activeSavedView?.updated_at]);

  // Auto-persist display option / column changes back to the saved view so
  // they survive a page refresh on /views/:id.
  useViewDisplayPersist(activeSavedView, issueFilters);

  const isDraftMode = searchParams.get('draft') === '1';
  const isEditMode = !!activeSavedView && searchParams.get('edit') === '1';
  const draftActive = isDraftMode || isEditMode;

  // Peek preview (Linear-style): Space toggles, arrows/J/K move focus.
  const peekItems = useMemo(() => displayList.map(e => ({ id: e.task.id })), [displayList]);
  const { focusedId, setFocusedId, peekOpen } = usePeekFocus(peekItems);
  const focusedEntry = useMemo(
    () => (focusedId ? displayList.find(e => e.task.id === focusedId) : null),
    [focusedId, displayList],
  );
  const focusedSubs = useMemo(
    () => (focusedEntry ? tasks.filter(s => s.parent_id === focusedEntry.task.id) : []),
    [focusedEntry, tasks],
  );

  const toggleExpand = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const cycleStatus = async (task: DbTask) => {
    const order: TaskStatus[] = ['todo', 'in_progress', 'done'];
    const idx = order.indexOf(task.status as TaskStatus);
    const next = order[(idx + 1) % order.length];
    await updateTask(task.id, { status: next, is_done: next === 'done' });

    // Auto-close parent when all sub-issues are done
    if (next === 'done' && task.parent_id) {
      const siblings = tasks.filter(t => t.parent_id === task.parent_id && t.id !== task.id);
      if (siblings.every(s => s.status === 'done')) {
        await updateTask(task.parent_id, { status: 'done', is_done: true });
      }
    }
  };

  const applyTemplate = (templateId: string) => {
    const tpl = issueTemplates.find(t => t.id === templateId);
    if (!tpl) return;
    setSelectedTemplateId(templateId);
    setForm(f => ({
      ...f,
      templateId,
      status: (tpl.default_status as TaskStatus) || f.status,
      priority: tpl.default_priority || f.priority,
      assignedRole: tpl.default_assigned_role || f.assignedRole,
      objective: tpl.body_template || f.objective,
    }));
  };

  const openCreate = (parentId?: string) => {
    setEditingTaskId(null);
    const defaultTpl = getDefaultTemplate();
    const tplId = defaultTpl?.id || '';
    setSelectedTemplateId(tplId || null);
    setForm({
      name: '', accountId: '', projectId: '', milestoneId: '',
      assignedRole: defaultTpl?.default_assigned_role || 'CSM',
      assignTo: '', dueLabel: '',
      objective: defaultTpl?.body_template || '',
      status: (defaultTpl?.default_status as TaskStatus) || 'todo',
      priority: defaultTpl?.default_priority || '',
      parentId: parentId || '',
      templateId: tplId,
    });
    setFormMilestones([]);
    if (parentId) {
      const parent = tasks.find(t => t.id === parentId);
      if (parent?.milestone_id) {
        const ms = allMilestones[parent.milestone_id];
        if (ms) {
          setForm(f => ({ ...f, projectId: ms.projectId, milestoneId: parent.milestone_id! }));
          loadFormMilestones(ms.projectId);
        }
      }
    }
    setDialogOpen(true);
  };

  const openEdit = (task: DbTask) => {
    const entry = taskMap[task.id];
    setEditingTaskId(task.id);
    setForm({
      name: task.name,
      accountId: entry?.accountId || (task as any).account_id || '',
      projectId: entry?.projectId || '',
      milestoneId: task.milestone_id || '',
      assignedRole: task.assigned_role || 'CSM',
      assignTo: task.assign_to || '',
      dueLabel: task.due_label || '',
      objective: task.objective || '',
      status: (task.status as TaskStatus) || 'todo',
      priority: task.priority || '',
      parentId: task.parent_id || '',
      templateId: (task as any).template_id || '',
    });
    if (entry?.projectId) loadFormMilestones(entry.projectId);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const slaFields = applySlaFields(matchSlaRule(form.priority || null, slaRules));
    if (editingTaskId) {
      await updateTask(editingTaskId, {
        name: form.name.trim(),
        assigned_role: form.assignedRole,
        assign_to: form.assignTo || null,
        due_label: form.dueLabel.trim() || null,
        objective: form.objective.trim() || null,
        status: form.status,
        priority: form.priority || null,
        is_done: form.status === 'done',
        ...slaFields,
      });
    } else {
      if (!orgId) return;
      const milestoneId = form.milestoneId || (form.parentId ? tasks.find(t => t.id === form.parentId)?.milestone_id : null);
      const parentAccountId = form.parentId ? (tasks.find(t => t.id === form.parentId) as any)?.account_id : null;
      const accountId = form.accountId || parentAccountId || null;
      // Need either a milestone (which derives account) OR an explicit account
      if (!milestoneId && !accountId) return;
      await addTask({
        name: form.name.trim(),
        milestone_id: milestoneId || null,
        account_id: accountId,
        organization_id: orgId,
        assigned_role: form.assignedRole || 'CSM',
        assign_to: form.assignTo || null,
        due_label: form.dueLabel.trim() || null,
        objective: form.objective.trim() || null,
        status: form.status,
        priority: form.priority || null,
        parent_id: form.parentId || null,
        is_done: form.status === 'done',
        template_id: form.templateId || null,
        ...slaFields,
      } as any);
      loadAllMilestones();
    }
    setDialogOpen(false);
  };

  const handleInlineAddSub = async (parentId: string) => {
    if (!inlineName.trim() || !orgId) return;
    const parent = tasks.find(t => t.id === parentId);
    await addTask({
      name: inlineName.trim(),
      milestone_id: parent?.milestone_id || '',
      organization_id: orgId,
      parent_id: parentId,
      status: 'todo',
      assigned_role: 'CSM',
    });
    setInlineName("");
    setInlineParentId(null);
    setExpandedParents(prev => new Set(prev).add(parentId));
  };

  const handleDelete = async () => {
    if (!deleteTaskId) return;
    await deleteTask(deleteTaskId);
    if (selectedTaskId === deleteTaskId) setSelectedTaskId(null);
    setDeleteTaskId(null);
  };

  const handleSubIssueDragEnd = useCallback((parentId: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const subs = getSubTasks(parentId);
    const oldIndex = subs.findIndex(s => s.id === active.id);
    const newIndex = subs.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(subs, oldIndex, newIndex);
    reorderSubTasks(parentId, reordered.map(s => s.id));
  }, [getSubTasks, reorderSubTasks]);

  const selectedEntry = selectedTaskId ? taskMap[selectedTaskId] : null;
  const selectedSubTasks = selectedTaskId ? getSubTasks(selectedTaskId) : [];
  const selectedParent = selectedEntry?.task.parent_id ? taskMap[selectedEntry.task.parent_id] : null;

  // Relations for selected task
  const { relations, blocks, blockedBy, related, duplicateOf, duplicatedBy, addRelation, removeRelation, refetch: refetchRelations } = useTaskRelationsDB(selectedTaskId || undefined);
  const [relationDialogOpen, setRelationDialogOpen] = useState(false);
  const [relationTypeFilter, setRelationTypeFilter] = useState<RelationType | 'blocked_by'>('related');
  const [relationSearch, setRelationSearch] = useState('');

  // Documents for selected task
  const { documents: taskDocuments, addDocument: addTaskDocument, updateDocument: updateTaskDocument, deleteDocument: deleteTaskDocument } = useTaskDocumentsDB(selectedTaskId || undefined);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [docTitleDraft, setDocTitleDraft] = useState('');
  const activeDoc = activeDocId ? taskDocuments.find(d => d.id === activeDocId) : null;

  // Reset active doc when switching tasks
  useEffect(() => { setActiveDocId(null); }, [selectedTaskId]);

  // Customer requests for selected task
  const { requests: taskRequests, addRequest: addTaskRequest, deleteRequest: deleteTaskRequest, toggleImportant: toggleTaskRequestImportant } = useCustomerRequestsDB({ taskId: selectedTaskId || undefined });
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({ title: '', accountId: '', contactName: '', body: '' });

  // Inline description editor state (sidebar)
  const [editingDescription, setEditingDescription] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  useEffect(() => { setEditingDescription(false); }, [selectedTaskId]);

  // Milestones for the selected task's project (used by sidebar Milestone select)
  const [selectedProjectMilestones, setSelectedProjectMilestones] = useState<Array<{ id: string; title: string }>>([]);
  useEffect(() => {
    const projId = selectedEntry?.projectId;
    if (!projId) { setSelectedProjectMilestones([]); return; }
    let cancelled = false;
    db.from('milestones').select('id, title').eq('project_id', projId).order('position').then(({ data }) => {
      if (!cancelled) setSelectedProjectMilestones(data || []);
    });
    return () => { cancelled = true; };
  }, [selectedEntry?.projectId]);


  const existingRelatedIds = useMemo(() => new Set(relations.map(r => r.related_task_id)), [relations]);

  const relationCandidates = useMemo(() => {
    if (!relationDialogOpen) return [];
    return enrichedTasks.filter(e =>
      e.task.id !== selectedTaskId &&
      !e.task.parent_id && // exclude sub-issues for cleaner UX
      !existingRelatedIds.has(e.task.id) &&
      (relationSearch ? e.task.name.toLowerCase().includes(relationSearch.toLowerCase()) : true)
    ).slice(0, 20);
  }, [relationDialogOpen, enrichedTasks, selectedTaskId, existingRelatedIds, relationSearch]);

  const handleAddRelation = async (targetId: string) => {
    if (!selectedTaskId) return;
    if (relationTypeFilter === 'blocked_by') {
      // Reverse: target blocks this task
      await addRelation(targetId, selectedTaskId, 'blocks');
    } else {
      await addRelation(selectedTaskId, targetId, relationTypeFilter as RelationType);
    }
    refetchAllRelations();
    setRelationDialogOpen(false);
    setRelationSearch('');
  };

  const handleRemoveRelation = async (id: string) => {
    await removeRelation(id);
    refetchAllRelations();
  };

  return (
    <AppLayout>
      <div className="flex h-full divide-x">
        <div className="flex-1 h-full overflow-auto flex flex-col">
          {draftActive ? (
            <ViewDraftHeader
              entity="issues"
              currentFilters={issueFilters}
              accountMap={accountMap}
              existingView={isEditMode ? activeSavedView : null}
              onDisplayChange={handleDisplayChange}
              activeFilterCount={
                (statusFilter.length > 0 ? 1 : 0) +
                (priorityFilter.length > 0 ? 1 : 0) +
                (accountFilter.length > 0 ? 1 : 0) +
                (viewFilter.length > 0 ? 1 : 0) +
                (slaFilter.length > 0 ? 1 : 0) +
                (hideCompleted ? 1 : 0) +
                (dueDateFilter !== 'any' ? 1 : 0)
              }
              filterSlot={
                <FilterPopover
                  activeCount={
                    (statusFilter.length > 0 ? 1 : 0) +
                    (priorityFilter.length > 0 ? 1 : 0) +
                    (accountFilter.length > 0 ? 1 : 0) +
                    (viewFilter.length > 0 ? 1 : 0) +
                    (slaFilter.length > 0 ? 1 : 0) +
                    (hideCompleted ? 1 : 0) +
                    (dueDateFilter !== 'any' ? 1 : 0)
                  }
                >
                  <FiltersIssuesSection
                    statusOptions={statusOptions}
                    priorityOptions={priorityOptions}
                    accountOptions={accountOptions}
                    viewOptions={viewOptions}
                    slaOptions={slaOptions}
                    dueDateOptions={dueDateOptions}
                    statusFilter={statusFilter}
                    priorityFilter={priorityFilter}
                    accountFilter={accountFilter}
                    viewFilter={viewFilter as string[]}
                    slaFilter={slaFilter}
                    hideCompleted={hideCompleted}
                    dueDateFilter={dueDateFilter}
                    onStatusChange={setStatusFilter}
                    onPriorityChange={setPriorityFilter}
                    onAccountChange={setAccountFilter}
                    onViewChange={(v) => setViewFilter(v as ViewFilter[])}
                    onSlaChange={setSlaFilter}
                    onHideCompletedChange={setHideCompleted}
                    onDueDateChange={setDueDateFilter}
                  />
                </FilterPopover>
              }
            />
          ) : (
            <PageHeader
              title="Issues"
              description={`${displayList.length} issues`}
              chip={activeSavedView ? <ViewPill name={activeSavedView.name} /> : null}
              actions={
                <>
                  {activeSavedView && (
                    <ExportViewButton
                      entity="issues"
                      filters={issueFilters as any}
                      viewName={activeSavedView.name}
                    />
                  )}
                  <SaveViewButton entity="issues" filters={issueFilters} />
                  {!activeSavedView && (
                    <DisplayOptionsPopover
                      entity="issues"
                      value={issueFilters as any}
                      onChange={handleDisplayChange}
                    />
                  )}
                  <Button size="sm" onClick={() => openCreate()}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Issue
                  </Button>
                </>
              }
            />
          )}

          {!draftActive && (
            <ListToolbar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search issues…"
              count={`${displayList.length} of ${tasks.length}`}
              showClear={hasFilters}
              onClear={clearFilters}
              filterTrigger={
                activeSavedView ? (
                  <>
                    <FilterPopover
                    activeCount={
                      (statusFilter.length > 0 ? 1 : 0) +
                      (priorityFilter.length > 0 ? 1 : 0) +
                      (accountFilter.length > 0 ? 1 : 0) +
                      (viewFilter.length > 0 ? 1 : 0) +
                      (slaFilter.length > 0 ? 1 : 0) +
                      (hideCompleted ? 1 : 0) +
                      (dueDateFilter !== 'any' ? 1 : 0)
                    }
                  >
                    <FiltersIssuesSection
                      statusOptions={statusOptions}
                      priorityOptions={priorityOptions}
                      accountOptions={accountOptions}
                      viewOptions={viewOptions}
                      slaOptions={slaOptions}
                      dueDateOptions={dueDateOptions}
                      statusFilter={statusFilter}
                      priorityFilter={priorityFilter}
                      accountFilter={accountFilter}
                      viewFilter={viewFilter as string[]}
                      slaFilter={slaFilter}
                      hideCompleted={hideCompleted}
                      dueDateFilter={dueDateFilter}
                      onStatusChange={setStatusFilter}
                      onPriorityChange={setPriorityFilter}
                      onAccountChange={setAccountFilter}
                      onViewChange={(v) => setViewFilter(v as ViewFilter[])}
                      onSlaChange={setSlaFilter}
                      onHideCompletedChange={setHideCompleted}
                      onDueDateChange={setDueDateFilter}
                    />
                    </FilterPopover>
                    <DisplayOptionsPopover
                      entity="issues"
                      value={issueFilters as any}
                      onChange={handleDisplayChange}
                    />
                  </>
                ) : (
                  <>
                    <MultiSelectFilter label="Status" options={statusOptions} selected={statusFilter} onChange={setStatusFilter} />
                    <MultiSelectFilter label="Priority" options={priorityOptions} selected={priorityFilter} onChange={setPriorityFilter} />
                    <MultiSelectFilter label="Account" options={accountOptions} selected={accountFilter} onChange={setAccountFilter} />
                    <MultiSelectFilter label="Type" options={viewOptions} selected={viewFilter as string[]} onChange={(v) => setViewFilter(v as ViewFilter[])} searchable={false} />
                    <MultiSelectFilter label="SLA" options={slaOptions} selected={slaFilter} onChange={setSlaFilter} />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-7 px-2 text-[11px] gap-1 border-dashed font-normal",
                            dueDateFilter !== 'any' && "border-solid bg-accent/40",
                          )}
                          title="Filter issues by due date"
                        >
                          {dueDateFilter === 'any' ? 'Due' : (
                            <span className="flex items-center gap-1">
                              <span className="text-muted-foreground">Due:</span>
                              <span>{dueDateLabelFor(dueDateFilter)}</span>
                            </span>
                          )}
                          <ChevronDown className="h-3 w-3 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[160px] p-1">
                        {dueDateOptions.map(o => (
                          <button
                            key={o.value}
                            onClick={() => setDueDateFilter(o.value)}
                            className={cn(
                              "flex items-center w-full px-2 py-1 rounded-sm text-left text-[12px] transition-colors",
                              dueDateFilter === o.value ? "bg-accent" : "hover:bg-muted/50",
                            )}
                          >
                            {o.label}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-7 text-[11px] border-dashed gap-1 font-normal",
                        slaFilter.includes('at_risk') && "border-solid bg-accent text-destructive",
                      )}
                      onClick={() => setSlaFilter(slaFilter.includes('at_risk') ? slaFilter.filter(v => v !== 'at_risk') : [...slaFilter, 'at_risk'])}
                      title="Show only issues with SLA at risk or breached"
                    >
                      <Flame className="h-3.5 w-3.5" />
                      SLA at risk
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn("h-7 text-[11px] border-dashed font-normal", hideCompleted && "border-solid bg-accent")}
                      onClick={() => setHideCompleted(v => !v)}
                    >
                      {hideCompleted ? "Show completed" : "Hide completed"}
                    </Button>
                  </>
                )
              }
              filterChips={
                activeSavedView ? null : (<>
                  <FilterChipGroup
                    label="Status"
                    values={statusFilter.map(v => ({ value: v, label: labelFor(statusOptions, v) }))}
                    onRemove={(v) => setStatusFilter(statusFilter.filter(x => x !== v))}
                    onClearAll={() => setStatusFilter([])}
                  />
                  <FilterChipGroup
                    label="Priority"
                    values={priorityFilter.map(v => ({ value: v, label: labelFor(priorityOptions, v) }))}
                    onRemove={(v) => setPriorityFilter(priorityFilter.filter(x => x !== v))}
                    onClearAll={() => setPriorityFilter([])}
                  />
                  <FilterChipGroup
                    label="Account"
                    values={accountFilter.map(v => ({ value: v, label: labelFor(accountOptions, v) }))}
                    onRemove={(v) => setAccountFilter(accountFilter.filter(x => x !== v))}
                    onClearAll={() => setAccountFilter([])}
                  />
                  <FilterChipGroup
                    label="Type"
                    values={viewFilter.map(v => ({ value: v, label: labelFor(viewOptions, v) }))}
                    onRemove={(v) => setViewFilter(viewFilter.filter(x => x !== v) as ViewFilter[])}
                    onClearAll={() => setViewFilter([])}
                  />
                  <FilterChipGroup
                    label="SLA"
                    values={slaFilter.map(v => ({ value: v, label: labelFor(slaOptions, v) }))}
                    onRemove={(v) => setSlaFilter(slaFilter.filter(x => x !== v))}
                    onClearAll={() => setSlaFilter([])}
                  />
                </>)
              }
            />
          )}

          {/* Issue list */}
          <div className="flex-1 overflow-auto px-6 pt-4 pb-6">
            <div className="border rounded-sm">
              {/* Header — column visibility driven by displayProperties */}
              {(() => {
                const cols = [
                  '20px', '16px', '1fr',
                  showProp('project') && '100px',
                  showProp('assignee') && '100px',
                  showProp('priority') && '80px',
                  showProp('sla') && '24px',
                  showProp('dueDate') && '90px',
                ].filter(Boolean).join(' ');
                return (
                  <div className="grid gap-2 px-3 py-1.5 border-b text-[11px] font-medium text-muted-foreground bg-muted/30" style={{ gridTemplateColumns: cols }}>
                    <span /><span /><span>Issue</span>
                    {showProp('project') && <span>Project</span>}
                    {showProp('assignee') && <span>Assignee</span>}
                    {showProp('priority') && <span>Priority</span>}
                    {showProp('sla') && <span><Flame className="h-3 w-3 mx-auto" /></span>}
                    {showProp('dueDate') && <span>Due</span>}
                  </div>
                );
              })()}

              {tasksLoading ? (
                <ListLoading />
              ) : displayList.length === 0 ? (
                tasks.length === 0 ? (
                  <EmptyState
                    icon={ListChecks}
                    title="No issues yet"
                    description="Track work, blockers, and follow-ups across your accounts."
                    action={
                      <Button size="sm" onClick={() => openCreate()}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Issue
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={SearchX}
                    title="No results"
                    description="Try adjusting your search or filters."
                    action={
                      hasFilters ? (
                        <Button size="sm" variant="outline" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                )
              ) : (
                groupedRows.map(row => {
                  if (row.kind === 'header') {
                    return (
                      <div
                        key={`group-${row.key}`}
                        className="px-3 py-1.5 border-b bg-muted/30 flex items-center gap-2 text-[11px] font-medium text-muted-foreground sticky top-0 z-[1]"
                      >
                        <span className="">{row.label || '—'}</span>
                        <span className="text-muted-foreground/70">{row.count}</span>
                      </div>
                    );
                  }
                  const entry = row.entry;
                  const t = entry.task;
                  const subs = tasks.filter(s => s.parent_id === t.id);
                  const hasSubs = subs.length > 0 && !entry.indent;
                  const isExpanded = expandedParents.has(t.id);
                  const assigneeName = t.assign_to ? orgMembers.find(m => m.user_id === t.assign_to)?.display_name || 'Assigned' : '';
                  const rowCols = [
                    '20px', '16px', '1fr',
                    showProp('project') && '100px',
                    showProp('assignee') && '100px',
                    showProp('priority') && '80px',
                    showProp('sla') && '24px',
                    showProp('dueDate') && '90px',
                  ].filter(Boolean).join(' ');

                  return (
                    <div key={t.id}>
                      <div
                        className={cn(
                          "grid gap-2 px-3 py-1.5 items-center cursor-pointer border-b transition-colors text-xs",
                          selectedTaskId === t.id ? 'bg-accent' : 'hover:bg-muted/30',
                          focusedId === t.id && 'border-l-2 border-l-foreground/40 -ml-[2px] pl-[14px]',
                          entry.indent && 'pl-8',
                          t.status === 'done' && 'opacity-50',
                        )}
                        style={{ gridTemplateColumns: rowCols }}
                        onClick={() => setSelectedTaskId(selectedTaskId === t.id ? null : t.id)}
                        onMouseEnter={() => setFocusedId(t.id)}
                      >
                        {/* Expand chevron */}
                        <span className="flex items-center justify-center">
                          {hasSubs ? (
                            <button onClick={e => { e.stopPropagation(); toggleExpand(t.id); }} className="p-0.5 rounded hover:bg-muted">
                              <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                            </button>
                          ) : entry.indent ? (
                            <CornerDownRight className="h-3 w-3 text-muted-foreground/40" />
                          ) : null}
                        </span>

                        {/* Status icon */}
                        <button
                          onClick={e => { e.stopPropagation(); cycleStatus(t); }}
                          className="flex items-center justify-center"
                          title={STATUS_LABELS[(t.status as TaskStatus) || 'todo']}
                        >
                          <TaskStatusIcon status={(t.status as TaskStatus) || 'todo'} size={16} />
                        </button>

                        {/* Name */}
                        <span className={cn("truncate flex items-center gap-1", t.status === 'done' && 'line-through text-muted-foreground')}>
                          {(t as any).code && <span className="font-mono text-[10px] text-muted-foreground">{(t as any).code}</span>}
                          {t.name}
                          {hasSubs && <span className="text-[10px] text-muted-foreground">{subs.filter(s => s.status === 'done').length}/{subs.length}</span>}
                          {blockedTaskIds.has(t.id) && <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" title="Blocked" />}
                          {blockingTaskIds.has(t.id) && <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive shrink-0" title="Blocking" />}
                        </span>

                        {/* Project */}
                        {showProp('project') && <span className="text-muted-foreground truncate">
                          {entry.projectName
                            ? entry.projectName
                            : entry.isStandalone
                              ? <span className="italic text-muted-foreground/70">{entry.accountName || 'Standalone'}</span>
                              : ''}
                        </span>}

                        {/* Assignee (inline) */}
                        {showProp('assignee') && <span className="truncate" onClick={e => e.stopPropagation()}>
                          <Select
                            value={t.assign_to || 'unassigned'}
                            onValueChange={v => updateTask(t.id, { assign_to: v === 'unassigned' ? null : v })}
                          >
                            <SelectTrigger className="h-6 w-full text-xs border-none shadow-none p-0 gap-1 bg-transparent hover:bg-muted/40 rounded-sm px-1">
                              <span className="truncate text-muted-foreground">{assigneeName || '—'}</span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {orgMembers.map(m => (
                                <SelectItem key={m.user_id} value={m.user_id}>{m.display_name || 'Member'}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </span>}

                        {/* Priority (inline) */}
                        {showProp('priority') && <span className="flex items-center" onClick={e => e.stopPropagation()}>
                          <Select
                            value={t.priority || 'no_priority'}
                            onValueChange={v => updateTask(t.id, { priority: v === 'no_priority' ? null : v })}
                          >
                            <SelectTrigger className="h-6 w-full text-xs border-none shadow-none p-0 gap-1 bg-transparent hover:bg-muted/40 rounded-sm px-1">
                              <PriorityIcon priority={(t.priority as TaskPriority) || null} size={14} />
                            </SelectTrigger>
                            <SelectContent>
                              {ALL_PRIORITIES.map(p => (
                                <SelectItem key={p} value={p}>
                                  <span className="flex items-center gap-1.5"><PriorityIcon priority={p} size={12} />{PRIORITY_LABELS[p]}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </span>}

                        {/* SLA */}
                        {showProp('sla') && <span className="flex items-center justify-center">
                          <SlaIndicator task={t as any} />
                        </span>}

                        {/* Due (inline) */}
                        {showProp('dueDate') && <span className="truncate" onClick={e => e.stopPropagation()}>
                          <InlineDueDate
                            value={(t as any).due_date}
                            isDone={t.status === 'done' || t.status === 'cancelled'}
                            onCommit={v => updateTask(t.id, { due_date: v } as any)}
                          />
                        </span>}
                      </div>

                      {/* Inline sub-issue add row */}
                      {hasSubs && isExpanded && inlineParentId === t.id && (
                        <div className="grid grid-cols-[20px_16px_1fr_100px_100px_80px_24px_90px] gap-2 px-3 py-1 items-center border-b pl-8">
                          <span />
                          <TaskStatusIcon status="todo" size={14} />
                          <Input
                            autoFocus
                            placeholder="Sub-issue title..."
                            value={inlineName}
                            onChange={e => setInlineName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleInlineAddSub(t.id);
                              if (e.key === 'Escape') { setInlineParentId(null); setInlineName(""); }
                            }}
                            className="h-6 text-xs border-dashed"
                          />
                          <span /><span /><span /><span /><span />
                        </div>
                      )}

                      {/* Add sub-issue button at end of expanded list */}
                      {hasSubs && isExpanded && inlineParentId !== t.id && (
                        <div className="pl-8 px-3 py-1 border-b">
                          <button
                            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                            onClick={() => { setInlineParentId(t.id); setInlineName(""); }}
                          >
                            <Plus className="h-3 w-3" /> Add sub-issue
                          </button>
                        </div>
                      )}

                      {/* Show add sub-issue button for parent issues without subs when expanded */}
                      {!hasSubs && !entry.indent && isExpanded && (
                        <div className="pl-8 px-3 py-1 border-b">
                          {inlineParentId === t.id ? (
                            <Input
                              autoFocus
                              placeholder="Sub-issue title..."
                              value={inlineName}
                              onChange={e => setInlineName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleInlineAddSub(t.id);
                                if (e.key === 'Escape') { setInlineParentId(null); setInlineName(""); }
                              }}
                              className="h-6 text-xs border-dashed max-w-xs"
                            />
                          ) : (
                            <button
                              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                              onClick={() => { setInlineParentId(t.id); setInlineName(""); }}
                            >
                              <Plus className="h-3 w-3" /> Add sub-issue
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg p-0 gap-0">
            <div className="px-4 py-2.5 border-b flex items-center justify-between">
              <DialogTitle className="text-xs text-muted-foreground font-normal">
                Issues › {editingTaskId ? 'Edit issue' : (form.parentId ? 'New sub-issue' : 'New issue')}
              </DialogTitle>
              {!editingTaskId && issueTemplates.length > 0 && (
                <Select
                  value={selectedTemplateId || '__none'}
                  onValueChange={v => {
                    if (v === '__none') {
                      setSelectedTemplateId(null);
                      setForm(f => ({ ...f, templateId: '', status: 'todo', priority: '', assignedRole: 'CSM', objective: '' }));
                    } else {
                      applyTemplate(v);
                    }
                  }}
                >
                  <SelectTrigger className="h-6 w-auto text-[11px] border-dashed gap-1 px-2">
                    <SelectValue placeholder="Template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No template</SelectItem>
                    {issueTemplates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="px-4 py-3 space-y-2">
              <Input
                autoFocus
                className="border-none shadow-none focus-visible:ring-0 text-base font-medium px-0 h-auto py-1 placeholder:text-muted-foreground/60"
                placeholder="Issue title"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
              <Textarea
                className="border-none shadow-none focus-visible:ring-0 text-sm px-0 min-h-[60px] resize-none placeholder:text-muted-foreground/50"
                placeholder="Add description..."
                value={form.objective}
                onChange={e => setForm(f => ({ ...f, objective: e.target.value }))}
              />
            </div>
            <div className="px-4 py-2.5 border-t space-y-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Status */}
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as TaskStatus }))}>
                  <SelectTrigger className="h-7 w-auto text-xs border-dashed gap-1 px-2">
                    <span className="flex items-center gap-1.5"><TaskStatusIcon status={form.status} size={12} />{STATUS_LABELS[form.status]}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map(s => (
                      <SelectItem key={s} value={s}>
                        <span className="flex items-center gap-1.5"><TaskStatusIcon status={s} size={12} />{STATUS_LABELS[s]}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Priority */}
                <Select value={form.priority || '__none'} onValueChange={v => setForm(f => ({ ...f, priority: v === '__none' ? '' : v }))}>
                  <SelectTrigger className={cn("h-7 w-auto text-xs border-dashed gap-1 px-2", !form.priority && "text-muted-foreground")}>
                    <SelectValue placeholder="No priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No priority</SelectItem>
                    {ALL_PRIORITIES.filter(p => p !== 'no_priority').map(p => (
                      <SelectItem key={p} value={p}>
                        <span className="flex items-center gap-1.5"><PriorityIcon priority={p} size={12} />{PRIORITY_LABELS[p]}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Account (used when no project, to scope the issue & generate code) */}
                {!form.parentId && !form.projectId && (
                  <Select
                    value={form.accountId || '__none'}
                    onValueChange={v => setForm(f => ({ ...f, accountId: v === '__none' ? '' : v }))}
                  >
                    <SelectTrigger className={cn("h-7 w-auto text-xs border-dashed gap-1 px-2", !form.accountId && "text-muted-foreground")}>
                      <SelectValue placeholder="Account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No account</SelectItem>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}

                {/* Project (optional) */}
                {!form.parentId && (
                  <Select
                    value={form.projectId || '__none'}
                    onValueChange={v => {
                      if (v === '__none') {
                        setForm(f => ({ ...f, projectId: '', milestoneId: '' }));
                        setFormMilestones([]);
                      } else {
                        const proj = projects.find(p => p.id === v);
                        setForm(f => ({ ...f, projectId: v, milestoneId: '', accountId: proj?.account_id || f.accountId }));
                        loadFormMilestones(v);
                      }
                    }}
                  >
                    <SelectTrigger className={cn("h-7 w-auto text-xs border-dashed gap-1 px-2", !form.projectId && "text-muted-foreground")}>
                      <SelectValue placeholder="No project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No project</SelectItem>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}

                {/* Milestone (only when a project is selected) */}
                {!form.parentId && form.projectId && (
                  <Select value={form.milestoneId} onValueChange={v => setForm(f => ({ ...f, milestoneId: v }))} disabled={!form.projectId}>
                    <SelectTrigger className="h-7 w-auto text-xs border-dashed gap-1 px-2"><SelectValue placeholder="Milestone" /></SelectTrigger>
                    <SelectContent>
                      {formMilestones.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}

                {/* Assignee */}
                <Select value={form.assignTo || '__unassigned'} onValueChange={v => setForm(f => ({ ...f, assignTo: v === '__unassigned' ? '' : v }))}>
                  <SelectTrigger className="h-7 w-auto text-xs border-dashed gap-1 px-2"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned">Unassigned</SelectItem>
                    {orgMembers.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name || 'Unnamed'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm" className="h-7 text-xs"
                  onClick={handleSave}
                  disabled={
                    !form.name.trim() ||
                    (!editingTaskId && !form.parentId && !form.accountId && (!form.projectId || !form.milestoneId))
                  }
                >
                  {editingTaskId ? 'Save' : 'Create issue'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Unified Detail Side Panel */}
        {selectedEntry && (
          <IssueDetailPanel
            task={selectedEntry.task}
            parentTask={selectedParent?.task || null}
            subTasks={selectedSubTasks}
            orgMembers={orgMembers}
            milestones={selectedProjectMilestones}
            projectName={selectedEntry.projectName || null}
            milestoneName={selectedEntry.milestoneName || null}
            onUpdate={async (patch) => { await updateTask(selectedEntry.task.id, patch as any); }}
            onDelete={() => setDeleteTaskId(selectedEntry.task.id)}
            onClose={() => setSelectedTaskId(null)}
            onSelectTask={setSelectedTaskId}
            onAddSubIssue={() => openCreate(selectedEntry.task.id)}
            onReorderSubIssues={(ids) => reorderSubTasks(selectedEntry.task.id, ids)}
            onEditDetails={() => openEdit(selectedEntry.task)}
            documents={taskDocuments}
            onAddDocument={async () => {
              const r = await addTaskDocument('Untitled document');
              return r?.data ? { id: r.data.id, title: r.data.title } : null;
            }}
            onUpdateDocument={(id, patch) => updateTaskDocument(id, patch as any)}
            onDeleteDocument={deleteTaskDocument}
            relations={{
              blocks, blockedBy, related, duplicateOf, duplicatedBy,
              addRelation,
              removeRelation: handleRemoveRelation,
              candidates: relationCandidates.map(e => ({ task: e.task, projectName: e.projectName })),
              setSearch: setRelationSearch,
              search: relationSearch,
            }}
            requests={{
              items: taskRequests,
              accounts,
              accountMap,
              addRequest: addTaskRequest,
              deleteRequest: deleteTaskRequest,
              toggleImportant: toggleTaskRequestImportant,
            }}
            slaRules={slaRules}
          />
        )}


        {/* Delete confirmation */}
        <AlertDialog open={!!deleteTaskId} onOpenChange={open => !open && setDeleteTaskId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-sm">Delete issue?</AlertDialogTitle>
              <AlertDialogDescription className="text-xs">This will permanently delete this issue and all its sub-issues.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-7 text-xs">Cancel</AlertDialogCancel>
              <AlertDialogAction className="h-7 text-xs" onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Linear-style peek preview */}
      <PeekCard open={peekOpen && !!focusedId} title="Issue peek">
        {focusedEntry ? (
          <IssuePeekContent
            task={focusedEntry.task}
            accountName={focusedEntry.accountName}
            projectName={focusedEntry.projectName}
            milestoneName={focusedEntry.milestoneName}
            assigneeName={
              focusedEntry.task.assign_to
                ? orgMembers.find(m => m.user_id === focusedEntry.task.assign_to)?.display_name || 'Assigned'
                : ''
            }
            subTotal={focusedSubs.length}
            subDone={focusedSubs.filter(s => s.status === 'done').length}
          />
        ) : (
          <IssuePeekSkeleton />
        )}
      </PeekCard>
    </AppLayout>
  );
}

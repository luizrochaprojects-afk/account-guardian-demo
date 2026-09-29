import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sid } from '@/demo/seed/util';

/**
 * A five-stop guided tour of the demo, without a tour library: each stop names
 * a route and a `data-tour` anchor on that screen; the tour navigates there,
 * waits for the anchor to render, rings it and places a card next to it.
 *
 * Opens once on a visitor's first desktop visit that starts on the dashboard
 * (a deep link to an account or to /about is left alone), and from "Take the
 * tour" in the demo banner. Navigating elsewhere mid-tour closes it rather than
 * pulling the visitor back. Hidden below 768px, where the anchored layout has
 * no room.
 */

interface Stop {
  path: string;
  anchor: string;
  title: string;
  body: string;
}

const FEATURED_ACCOUNT = sid('account', 'meridian');

const STOPS: Stop[] = [
  {
    path: '/dashboard',
    anchor: 'hygiene',
    title: 'Start from what needs doing',
    body: 'Every counter here targets zero, and each one implies an action: a deal with no next step, a meeting that never got booked, a signed customer that is not live yet. The analytics sit below it on purpose.',
  },
  {
    path: '/accounts?view=pipeline',
    anchor: 'board',
    title: 'One board, first contact to churn',
    body: 'SDR, Sales and Onboarding are funnels: people move the cards, and the database refuses moves that skip a stage or a gate. The Customer tab is different: a ladder the system files by usage and health, with the reason on every card.',
  },
  {
    path: `/account/${FEATURED_ACCOUNT}`,
    anchor: 'now',
    title: 'The account as the unit of work',
    body: 'The Now block answers "what do I do here today": the next action, what blocks it, and what the meeting agent proposed. Open the Sales tab to answer the qualification checklist and watch the stage gate react.',
  },
  {
    path: '/accounts?view=inbox',
    anchor: 'inbox',
    title: 'The agent proposes, a person approves',
    body: 'Suggestions extracted from meetings land here grouped by meeting, with the excerpt that justifies them. Approve, edit or reject; every decision is in the Audit tab. In this demo the extraction is pre-computed, no model is called.',
  },
  {
    path: '/health-config',
    anchor: 'health',
    title: 'Health you can configure and audit',
    body: 'Each profile scores the stages it owns with its own metrics and thresholds. Every log stores a snapshot of the config it was scored with, so history keeps its meaning when the rules change.',
  },
];

const SEEN_KEY = 'account-guardian-demo:tour-seen';
const OPEN_EVENT = 'account-guardian-demo:open-tour';

/** Opens the tour from anywhere (the banner button). */
export function startTour() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Private mode: the tour just shows again next time.
  }
}

/** Same path, and every query param the stop names (screens add their own). */
function isOnStop(stopPath: string, pathname: string, search: string): boolean {
  const target = new URL(stopPath, 'http://x');
  if (target.pathname !== pathname) return false;
  const here = new URLSearchParams(search);
  for (const [k, v] of target.searchParams) if (here.get(k) !== v) return false;
  return true;
}

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

export function DemoTour() {
  const navigate = useNavigate();
  const location = useLocation();
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // The stop we last navigated for: a location change after that navigation
  // settled means the visitor went somewhere on their own.
  const arrivedAt = useRef<number | null>(null);

  // First desktop visit opens the tour once; the banner can always reopen it.
  useEffect(() => {
    const landing = window.location.pathname;
    if (!readSeen() && isDesktop() && (landing === '/' || landing === '/dashboard')) setIndex(0);
    const open = () => isDesktop() && setIndex(0);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  const stop = index === null ? null : STOPS[index];

  // Go to the stop's screen; once there, leaving it ends the tour.
  useEffect(() => {
    if (!stop || index === null) return;
    const onStop = isOnStop(stop.path, location.pathname, location.search);
    if (onStop) {
      arrivedAt.current = index;
    } else if (arrivedAt.current === index) {
      markSeen();
      setIndex(null);
    } else {
      navigate(stop.path);
    }
  }, [stop, index, location.pathname, location.search, navigate]);

  // Wait for the anchor, then keep its position in sync.
  useLayoutEffect(() => {
    if (!stop) return;
    setRect(null);
    let raf = 0;
    let tries = 0;
    // The anchor usually renders as a skeleton first and grows when its data
    // arrives, so its size is observed rather than measured once.
    let observer: ResizeObserver | null = null;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${stop.anchor}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setRect(el.getBoundingClientRect());
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => setRect(el.getBoundingClientRect()));
          observer.observe(el);
        }
        return;
      }
      if (tries++ < 120) raf = requestAnimationFrame(find);
    };
    find();
    const onChange = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${stop.anchor}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [stop, location.pathname]);

  const close = useCallback(() => {
    markSeen();
    setIndex(null);
  }, []);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, close]);

  if (!stop || index === null) return null;

  const last = index === STOPS.length - 1;
  const CARD_W = 340;
  const CARD_H = 240;
  const margin = 12;
  // Below the anchor if it fits, else above it, else pinned to the bottom-right
  // corner — never on top of the thing it is describing.
  let top = window.innerHeight - CARD_H - 16;
  let left = window.innerWidth - CARD_W - 24;
  if (rect) {
    if (rect.bottom + margin + CARD_H <= window.innerHeight) {
      top = rect.bottom + margin;
      left = Math.min(Math.max(margin, rect.left), window.innerWidth - CARD_W - margin);
    } else if (rect.top - margin - CARD_H >= 0) {
      top = rect.top - margin - CARD_H;
      left = Math.min(Math.max(margin, rect.left), window.innerWidth - CARD_W - margin);
    }
  }

  return (
    <>
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] rounded-md ring-2 ring-primary ring-offset-2 transition-all"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: Math.min(rect.height, window.innerHeight - rect.top - 8) }}
        />
      )}
      <div
        role="dialog"
        aria-label={`Tour, step ${index + 1} of ${STOPS.length}: ${stop.title}`}
        className="fixed z-[61] rounded-lg border bg-background p-4 shadow-lg"
        style={{ top, left, width: CARD_W }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {index + 1} of {STOPS.length}
          </div>
          <button type="button" onClick={close} aria-label="Close tour" className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <h2 className="mt-1 text-sm font-semibold">{stop.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{stop.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={close}>
            Skip
          </Button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="outline" size="sm" onClick={() => setIndex(index - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={() => (last ? close() : setIndex(index + 1))}>
              {last ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

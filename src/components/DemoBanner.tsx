import { Link } from 'react-router-dom';
import { Info, PlayCircle, RotateCcw } from 'lucide-react';
import { resetDemo, hasLocalChanges } from '@/demo/store';
import { startTour } from '@/components/DemoTour';

/**
 * The one line every screen carries: this is a portfolio demo, the data is
 * invented, and whatever you change stays in your browser. Thin on purpose,
 * so it never competes with the product for attention.
 */
export function DemoBanner() {
  const edited = hasLocalChanges();
  return (
    <div
      role="note"
      className="flex h-8 shrink-0 items-center gap-3 border-b bg-muted/60 px-4 text-xs text-muted-foreground"
    >
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        <span className="font-medium text-foreground">Portfolio demo.</span>{' '}
        All companies, people and numbers are fictional.
        <span className="hidden md:inline"> Your changes stay in this browser.</span>
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => startTour()}
          className="hidden items-center gap-1 rounded-sm px-2 py-1 font-medium text-foreground hover:bg-background md:inline-flex"
        >
          <PlayCircle className="h-3.5 w-3.5" aria-hidden /> Take the tour
        </button>
        <Link to="/about" className="rounded-sm px-2 py-1 font-medium text-foreground hover:bg-background">
          About
        </Link>
        <button
          type="button"
          onClick={() => resetDemo()}
          title={edited ? 'Discard your changes and reload the sample data' : 'Reload the sample data'}
          className="inline-flex items-center gap-1 rounded-sm px-2 py-1 font-medium text-foreground hover:bg-background"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Reset demo</span>
        </button>
      </div>
    </div>
  );
}

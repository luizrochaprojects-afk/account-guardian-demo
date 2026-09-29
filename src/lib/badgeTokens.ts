/**
 * Centralized badge color tokens.
 * All type/status/category badges should use these instead of defining per-page palettes.
 */

// Event & note categories
export const categoryColors: Record<string, string> = {
  call: "bg-emerald-50 text-emerald-700 border-emerald-200",
  meeting: "bg-blue-50 text-blue-700 border-blue-200",
  review: "bg-amber-50 text-amber-700 border-amber-200",
  training: "bg-purple-50 text-purple-700 border-purple-200",
  internal: "bg-gray-50 text-gray-700 border-gray-200",
  email: "bg-violet-50 text-violet-700 border-violet-200",
  task: "bg-orange-50 text-orange-700 border-orange-200",
  note: "bg-muted text-muted-foreground border-border",
};

// Account segments
export const segmentColors: Record<string, string> = {
  Enterprise: "bg-emerald-500",
  "Mid-Market": "bg-orange-400",
  "Mid Market": "bg-orange-400",
  SMB: "bg-blue-400",
  Pilot: "bg-violet-400",
};

// Health status
export const healthDotColor: Record<string, string> = {
  healthy: "bg-emerald-500",
  concerning: "bg-yellow-500",
  poor: "bg-destructive",
  no_data: "bg-muted-foreground/40",
};

export const healthLabel: Record<string, string> = {
  healthy: "Healthy",
  concerning: "Concerning",
  poor: "At Risk",
  no_data: "No data",
};

export type HealthBucket = "healthy" | "concerning" | "poor" | "no_data";

/**
 * Score → bucket. Lives next to the labels because two screens grading health
 * differently is the kind of drift nobody notices until the counts disagree:
 * the accounts table and the Campaigns tab's health filter both read this.
 *
 * A zero score is "no data", not "at risk" — an account nobody has scored yet
 * must not be presented as failing.
 */
export function healthBucket(score: number): HealthBucket {
  if (!(score > 0)) return "no_data";
  if (score >= 70) return "healthy";
  if (score >= 40) return "concerning";
  return "poor";
}

// Calendar type config (icon is handled by the component)
export const calendarTypeColors: Record<string, string> = {
  meeting: "bg-blue-50 text-blue-700 border-blue-200",
  call: "bg-emerald-50 text-emerald-700 border-emerald-200",
  task: "bg-orange-50 text-orange-700 border-orange-200",
  email: "bg-violet-50 text-violet-700 border-violet-200",
  review: "bg-amber-50 text-amber-700 border-amber-200",
};

// Group dot colors (for board views)
export const groupDotColors: Record<string, string> = {
  "At Risk": "bg-destructive",
  Concerning: "bg-yellow-500",
  Healthy: "bg-emerald-500",
  Enterprise: "bg-emerald-500",
  "Mid-Market": "bg-orange-400",
  "Mid Market": "bg-orange-400",
  SMB: "bg-blue-400",
  Pilot: "bg-violet-400",
  Onboarding: "bg-blue-400",
  Adopted: "bg-emerald-500",
  Expanding: "bg-violet-400",
  Starter: "bg-blue-400",
  Growth: "bg-emerald-500",
};

// Account avatar colors
export const accountColors = [
  "bg-emerald-600", "bg-red-500", "bg-blue-600", "bg-orange-500",
  "bg-violet-500", "bg-teal-500", "bg-pink-500", "bg-indigo-500",
];

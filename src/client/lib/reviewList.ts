// What the Review page last showed. Coming back from a note, the page draws this
// at once and refetches quietly, instead of starting over from a spinner.
export const reviewList: {
  snapshot: {
    userId: number | undefined; query: string; dueRecords: { id: number }[]; dueTotal: number;
    courseCount: number | null; wisdom: unknown; vaultName: string;
  } | null;
} = { snapshot: null };

// Ratings still on their way. The list waits for them before it refetches: an
// answer from before the rating (the API cache) would bring the note back.
let writes: Promise<unknown> = Promise.resolve();
export function trackReviewWrite(p: Promise<unknown>) {
  const all = Promise.allSettled([writes, p]);
  writes = all;
}
export const reviewWritesDone = () => writes;

// A note rated or taken out of review leaves the list before the refetch answers.
export function dropFromReviewList(recordId: number) {
  const s = reviewList.snapshot;
  if (!s || !s.dueRecords.some((r) => r.id === recordId)) return;
  s.dueRecords = s.dueRecords.filter((r) => r.id !== recordId);
  s.dueTotal = Math.max(0, s.dueTotal - 1);
}

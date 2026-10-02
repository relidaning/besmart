// What in the vault is never a review source: notes directly in the vault root,
// and the top-level folders for personal diaries and records (0_lidaning),
// machine-written notes (claude-maxer) and image attachments (attachs; still shown
// inside the notes that embed them). Shared by the vault scanner, the watcher,
// imports, migration 13 and the garden.
export const VAULT_EXCLUDE = ['0_lidaning', 'claude-maxer', 'attachs'];

export function isExcludedVaultPath(rel: string | null | undefined): boolean {
  if (!rel) return false;
  const parts = rel.split('/');
  if (parts.length === 1 && rel.endsWith('.md')) return true; // a note in the vault root (folders pass)
  return VAULT_EXCLUDE.includes(parts[0]);
}

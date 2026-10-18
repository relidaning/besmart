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

// A note can also opt out on its own with the frontmatter property `review: false`
// (an Obsidian checkbox property; `no`/`off` work too). It stays in the vault but is
// never scheduled, suggested or imported, and adding the property to a note that's
// already a course removes that course (watcher on change, and the startup sync).
const OPT_OUT = /^review:\s*["']?(false|no|off)["']?\s*$/im;

export function isReviewOptOut(text: string): boolean {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/.exec(text);
  return !!m && OPT_OUT.test(m[1]);
}

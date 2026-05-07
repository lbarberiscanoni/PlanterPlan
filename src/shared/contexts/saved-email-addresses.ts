const SAVED_EMAIL_CAP = 5;

/**
 * Prepends an email address with case-insensitive de-duplication and a fixed cap.
 * @param existing The current list of saved email addresses.
 * @param address The address to add.
 * @returns The updated saved email list.
 */
export function mergeSavedEmailAddress(existing: string[], address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) return existing;
  const lower = trimmed.toLowerCase();
  const filtered = existing.filter((e) => typeof e === 'string' && e.toLowerCase() !== lower);
  return [trimmed, ...filtered].slice(0, SAVED_EMAIL_CAP);
}

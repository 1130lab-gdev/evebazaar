const STORAGE_KEY = 'evebazaar.pinnedItems';
const MAX_PINNED = 20;

export interface PinnedItem {
  typeId: number;
  name: string;
}

export function loadPinnedItems(): PinnedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is PinnedItem => typeof p?.typeId === 'number' && typeof p?.name === 'string')
      .slice(0, MAX_PINNED);
  } catch {
    return [];
  }
}

export function savePinnedItems(items: PinnedItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_PINNED)));
  } catch {
    // storage unavailable / full -- pinning is a convenience, not critical
  }
}

export function togglePinnedItem(items: PinnedItem[], item: PinnedItem): PinnedItem[] {
  return items.some((p) => p.typeId === item.typeId)
    ? items.filter((p) => p.typeId !== item.typeId)
    : [item, ...items].slice(0, MAX_PINNED);
}

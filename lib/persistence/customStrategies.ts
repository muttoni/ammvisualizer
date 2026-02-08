import { del, get, set } from 'idb-keyval'
import type { StrategyLibraryItem } from '../sim/types'

const LIBRARY_KEY = 'ammvisualizer-custom-strategies-v1'

export async function loadCustomStrategyLibrary(): Promise<StrategyLibraryItem[]> {
  const raw = await get<StrategyLibraryItem[] | undefined>(LIBRARY_KEY)
  if (!raw || !Array.isArray(raw)) {
    return []
  }

  return raw
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveCustomStrategyItem(item: StrategyLibraryItem): Promise<StrategyLibraryItem[]> {
  const items = await loadCustomStrategyLibrary()
  const next = items.filter((existing) => existing.id !== item.id)
  next.push(item)
  next.sort((a, b) => b.updatedAt - a.updatedAt)
  await set(LIBRARY_KEY, next)
  return next
}

export async function deleteCustomStrategyItem(id: string): Promise<StrategyLibraryItem[]> {
  const items = await loadCustomStrategyLibrary()
  const next = items.filter((item) => item.id !== id)

  if (next.length === 0) {
    await del(LIBRARY_KEY)
    return []
  }

  await set(LIBRARY_KEY, next)
  return next
}

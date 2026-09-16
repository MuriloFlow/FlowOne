export { roleLabel } from '@/lib/roles'

export function initials(name: string): string {
  const first = name.trim().split(/\s+/).find(Boolean)
  return first ? first.slice(0, 1).toUpperCase() : 'F'
}

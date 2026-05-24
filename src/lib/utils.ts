export const CATEGORIES: Record<string, string> = {
  food: '🍔',
  transport: '🚗',
  accommodation: '🏠',
  entertainment: '🎉',
  shopping: '🛍️',
  other: '🧾',
}

export const CURRENCIES: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', INR: '₹',
  JPY: '¥', AUD: 'A$', CAD: 'C$',
}

export function displayName(name: string | null | undefined, email: string): string {
  if (!name || name.includes('@')) return email.split('@')[0]
  return name
}

export function makeCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export interface DebtEntry {
  from: string; to: string; amount: number; fromName: string; toName: string
}

export function simplifyDebts(
  net: Record<string, number>,
  nameMap: Record<string, string>,
): DebtEntry[] {
  const pos: Array<{ id: string; amount: number }> = []
  const neg: Array<{ id: string; amount: number }> = []
  for (const [id, v] of Object.entries(net)) {
    if (v > 0.005) pos.push({ id, amount: v })
    else if (v < -0.005) neg.push({ id, amount: -v })
  }
  const result: DebtEntry[] = []
  let i = 0, j = 0
  while (i < pos.length && j < neg.length) {
    const amount = Math.min(pos[i].amount, neg[j].amount)
    result.push({
      from: neg[j].id, to: pos[i].id,
      amount: Math.round(amount * 100) / 100,
      fromName: nameMap[neg[j].id] || neg[j].id,
      toName: nameMap[pos[i].id] || pos[i].id,
    })
    pos[i].amount -= amount
    neg[j].amount -= amount
    if (pos[i].amount < 0.005) i++
    if (neg[j].amount < 0.005) j++
  }
  return result
}

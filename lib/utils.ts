export const formatPrice = (amount: number): string =>
  `CHF ${amount.toFixed(2)}`

export const formatRelativeTime = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}

export const getConditionLabel = (c: string): string =>
  ({ new: 'Neuf', like_new: 'Comme neuf', good: 'Bon état', fair: 'Correct' }[c] ?? c)

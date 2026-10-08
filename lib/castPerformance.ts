/** 月次実績。予定は除外、0円の実来店は回数・人数に含む。 */
export function getMonthlyNominationMetrics(
  customers: Array<{ id: string | number; nomination_status?: string | null; region?: string | null }>,
  visits: Array<{ customer_id: string | number; is_planned?: boolean | null; nomination_status_at_visit?: string | null }>,
) {
  const meta = new Map(customers.map(c => [String(c.id), c]))
  const local = new Set<string>(), outside = new Set<string>()
  let honshimeiVisits = 0, banaiVisits = 0
  for (const visit of visits) {
    if (visit.is_planned === true) continue
    const id = String(visit.customer_id), customer = meta.get(id)
    if (!customer) continue
    const nomination = visit.nomination_status_at_visit || customer.nomination_status
    if (nomination === '場内') banaiVisits++
    if (nomination !== '本指名') continue
    honshimeiVisits++
    if (customer.region?.trim() === '福岡県') local.add(id)
    else outside.add(id)
  }
  return { honshimeiVisits, localMonthlyPeople: local.size, outsideMonthlyPeople: outside.size, banaiVisits }
}

export const calculateMonthlyAverageSpend = (sales: number, honshimeiVisits: number) =>
  honshimeiVisits > 0 ? Math.round(sales / honshimeiVisits) : 0

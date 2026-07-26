import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { dailyCloseService } from './dailyCloseService'
import type { DailyClose } from './types'

export function useOpenCashSession(locationId?: string) {
  const { accessToken } = useAuth()
  return useQuery<DailyClose | null>({
    enabled: Boolean(locationId),
    queryKey: ['daily-close', 'open-session', locationId],
    queryFn: async () => {
      const closes = await dailyCloseService.list(accessToken)
      return closes.find((close) => close.operationalLocationId === locationId && close.status === 'DRAFT' && (close.cashSessionStatus ?? 'OPEN') === 'OPEN') ?? null
    },
    refetchInterval: 30_000,
  })
}

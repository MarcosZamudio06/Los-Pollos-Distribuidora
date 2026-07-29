import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { getPosDeviceId } from '../../lib/deviceIdentity'
import { cashManagementService, type CashShift } from './cashManagementService'

export function useOpenCashSession(locationId?: string) {
  const { accessToken } = useAuth()
  const deviceId = getPosDeviceId()
  return useQuery<CashShift | null>({
    enabled: Boolean(locationId),
    queryKey: ['cash-shift', 'current', deviceId, locationId],
    queryFn: async () => {
      const shift = await cashManagementService.currentShift(deviceId, accessToken)
      return shift?.operationalLocationId === locationId ? shift : null
    },
    refetchInterval: 30_000,
  })
}

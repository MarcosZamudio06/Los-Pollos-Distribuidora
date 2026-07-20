import { describe, expect, it } from 'vitest'
import { availableBillingRequestActions, billingRequestStatusLabel } from '../status'

describe('billing request status rules', () => {
  it('maps the documented state machine to ADMIN actions', () => {
    expect(availableBillingRequestActions('REQUESTED', 'ADMIN')).toEqual(['IN_REVIEW', 'CANCELLED'])
    expect(availableBillingRequestActions('IN_REVIEW', 'ADMIN')).toEqual(['APPROVED', 'REJECTED', 'CANCELLED'])
    expect(availableBillingRequestActions('REQUESTED', 'BILLING')).toEqual(['IN_REVIEW', 'CANCELLED'])
    expect(availableBillingRequestActions('APPROVED', 'ADMIN')).toEqual([])
  })

  it('keeps sellers and collections from administrative transitions', () => {
    expect(availableBillingRequestActions('REQUESTED', 'SELLER')).toEqual([])
    expect(availableBillingRequestActions('IN_REVIEW', 'COLLECTIONS')).toEqual([])
    expect(billingRequestStatusLabel('IN_REVIEW')).toBe('En revisión')
  })
})

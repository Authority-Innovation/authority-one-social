import {afterEach, describe, expect, it, jest} from '@jest/globals'

// Review edcf058f8 M3: armed, a 403 `enrollment-required` answered to the AO
// bearer sends the person back to Community's terms, for the token THIS
// request carried; a 403 `not-provisioned` goes to the picker instead.
jest.mock('#/features/aoSignature/config', () => ({
  isAOSignatureArmed: () => true,
}))
const mockEnrollment = jest.fn()
const mockNotProvisioned = jest.fn()
jest.mock('#/features/aoSignature/session', () => ({
  noteAOEnrollmentRequired: (t: unknown) => mockEnrollment(t),
  noteAONotProvisioned: (t: unknown) => mockNotProvisioned(t),
}))
jest.mock('../authToken', () => ({
  getSupabaseAccessToken: jest.fn(() => Promise.resolve('aos1.sent')),
}))

import {fetchOwnerAgents} from '../agentsClient'

const realFetch = global.fetch
afterEach(() => {
  global.fetch = realFetch
  jest.clearAllMocks()
})
const refuse = (body: unknown) => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 403,
      json: () => Promise.resolve(body),
    }),
  ) as unknown as typeof fetch
}

describe('agentsClient send-back (armed)', () => {
  it("403 enrollment-required ⇒ Community's terms, for the sent token", async () => {
    refuse({error: 'enrollment-required'})
    const r = await fetchOwnerAgents()
    expect(r.agents).toEqual([])
    expect(mockEnrollment).toHaveBeenCalledWith('aos1.sent')
    expect(mockNotProvisioned).not.toHaveBeenCalled()
  })
  it('403 not-provisioned ⇒ the picker, never the terms', async () => {
    refuse({code: 'not-provisioned'})
    await fetchOwnerAgents()
    expect(mockNotProvisioned).toHaveBeenCalledWith('aos1.sent')
    expect(mockEnrollment).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import actual from '@actual-app/api'
import { initActual } from './actual'

vi.mock('@actual-app/api', () => ({
  default: { init: vi.fn(), downloadBudget: vi.fn() },
}))

const base = { serverURL: 'http://localhost:5006', password: 'server-pw', syncId: 'sync-id', verbose: false }

describe('initActual', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls downloadBudget with only the sync ID when no encryption password is set', async () => {
    await initActual(base)
    expect(vi.mocked(actual.downloadBudget).mock.calls).toEqual([['sync-id']])
  })

  it('passes the encryption password to downloadBudget when set', async () => {
    await initActual({ ...base, encryptionPassword: 'file-key' })
    expect(vi.mocked(actual.downloadBudget).mock.calls).toEqual([['sync-id', { password: 'file-key' }]])
  })
})

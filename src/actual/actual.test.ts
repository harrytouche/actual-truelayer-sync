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

  it.each(['missing-key', 'decrypt-failure'])('adds an env var hint to %s errors', async (code) => {
    vi.mocked(actual.downloadBudget).mockRejectedValueOnce(Object.assign(new Error('API says no.'), { code }))
    await expect(initActual({ ...base, encryptionPassword: 'file-key' })).rejects.toThrow(
      /^API says no\. Set or check ACTUAL_ENCRYPTION_PASSWORD/,
    )
  })

  it('rethrows other errors unchanged', async () => {
    vi.mocked(actual.downloadBudget).mockRejectedValueOnce(
      Object.assign(new Error('Not found.'), { code: 'budget-not-found' }),
    )
    await expect(initActual(base)).rejects.toThrow(/^Not found\.$/)
  })
})

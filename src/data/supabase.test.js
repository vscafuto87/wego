import { describe, it, expect } from 'vitest'
import { computeIsCloudConfigured } from './supabase.js'

describe('computeIsCloudConfigured', () => {
  it('falso se manca l\'url', () => {
    expect(computeIsCloudConfigured('', 'anon-key')).toBe(false)
  })

  it('falso se manca la chiave anonima', () => {
    expect(computeIsCloudConfigured('https://x.supabase.co', '')).toBe(false)
  })

  it('vero se entrambi presenti', () => {
    expect(computeIsCloudConfigured('https://x.supabase.co', 'anon-key')).toBe(true)
  })
})

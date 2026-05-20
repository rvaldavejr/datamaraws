/**
 * __tests__/lib/auth.test.ts
 * Unit tests for authentication logic
 */

// Mock CredentialsProvider so the authorize() options passed in auth.ts are
// directly accessible and callable — without this, NextAuth's CJS bundle in
// the Jest environment does not apply the options spread, leaving authorize()
// as an unreachable default instead of our implementation.
jest.mock('next-auth/providers/credentials', () =>
  jest.fn((options: any) => ({
    id: 'credentials',
    name: options.name ?? 'credentials',
    type: 'credentials',
    credentials: options.credentials ?? {},
    authorize: options.authorize,
  }))
)

import { authOptions } from '@/lib/auth'

describe('Authentication', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    process.env.TALA_USER = 'admin'
    process.env.TALA_PASSWORD = 'tala2026'
  })

  afterAll(() => {
    process.env = originalEnv
  })

  // ── Provider configuration ────────────────────────────────────────────────

  describe('Provider configuration', () => {
    it('has at least one provider configured', () => {
      expect(authOptions.providers.length).toBeGreaterThan(0)
    })

    it('uses the credentials provider type', () => {
      const provider = authOptions.providers[0] as any
      expect(provider.type).toBe('credentials')
    })

    it('exposes an authorize function', () => {
      const provider = authOptions.providers[0] as any
      expect(typeof provider.authorize).toBe('function')
    })

    it('defines username and password credential fields', () => {
      const provider = authOptions.providers[0] as any
      expect(provider.credentials).toHaveProperty('username')
      expect(provider.credentials).toHaveProperty('password')
    })
  })

  // ── authorize() function ──────────────────────────────────────────────────

  describe('authorize()', () => {
    let authorize: (credentials: any) => Promise<any>

    beforeAll(() => {
      authorize = (authOptions.providers[0] as any).authorize
    })

    it('returns a user object for correct credentials', async () => {
      const result = await authorize({ username: 'admin', password: 'tala2026' })
      expect(result).toEqual({
        id: '1',
        name: 'TALA Researcher',
        email: 'tala@feutech.edu.ph',
      })
    })

    it('returns null for a wrong password', async () => {
      const result = await authorize({ username: 'admin', password: 'wrongpass' })
      expect(result).toBeNull()
    })

    it('returns null for a wrong username', async () => {
      const result = await authorize({ username: 'wronguser', password: 'tala2026' })
      expect(result).toBeNull()
    })

    it('returns null when both username and password are wrong', async () => {
      const result = await authorize({ username: 'wrong', password: 'wrong' })
      expect(result).toBeNull()
    })

    it('returns null when credentials are undefined', async () => {
      const result = await authorize(undefined)
      expect(result).toBeNull()
    })

    it('honours TALA_USER env var over the hardcoded default', async () => {
      process.env.TALA_USER = 'researcher'
      process.env.TALA_PASSWORD = 'pass123'
      const result = await authorize({ username: 'researcher', password: 'pass123' })
      expect(result).not.toBeNull()
    })

    it('falls back to "admin" when TALA_USER is unset', async () => {
      delete process.env.TALA_USER
      delete process.env.TALA_PASSWORD
      const result = await authorize({ username: 'admin', password: 'tala2026' })
      expect(result).not.toBeNull()
    })

    it('rejects the hardcoded default once env vars override it', async () => {
      process.env.TALA_USER = 'newuser'
      process.env.TALA_PASSWORD = 'newpass'
      const result = await authorize({ username: 'admin', password: 'tala2026' })
      expect(result).toBeNull()
    })
  })

  // ── Session configuration ─────────────────────────────────────────────────

  describe('Session configuration', () => {
    it('uses JWT session strategy', () => {
      expect(authOptions.session?.strategy).toBe('jwt')
    })

    it('sets the signIn page to /login', () => {
      expect(authOptions.pages?.signIn).toBe('/login')
    })
  })

  // ── Redirect callback ─────────────────────────────────────────────────────

  describe('redirect callback', () => {
    let redirect: (args: { url: string; baseUrl: string }) => Promise<string>

    beforeAll(() => {
      redirect = authOptions.callbacks?.redirect as any
    })

    it('returns the URL when it starts with baseUrl', async () => {
      const result = await redirect({
        url: 'http://localhost:3000/dashboard',
        baseUrl: 'http://localhost:3000',
      })
      expect(result).toBe('http://localhost:3000/dashboard')
    })

    it('redirects to /dashboard when URL is external', async () => {
      const result = await redirect({
        url: 'http://evil.com/phishing',
        baseUrl: 'http://localhost:3000',
      })
      expect(result).toBe('http://localhost:3000/dashboard')
    })

    it('allows the root path through', async () => {
      const result = await redirect({
        url: 'http://localhost:3000/',
        baseUrl: 'http://localhost:3000',
      })
      expect(result).toBe('http://localhost:3000/')
    })

    it('allows any internal sub-path through', async () => {
      const result = await redirect({
        url: 'http://localhost:3000/some/deep/path',
        baseUrl: 'http://localhost:3000',
      })
      expect(result).toBe('http://localhost:3000/some/deep/path')
    })
  })
})

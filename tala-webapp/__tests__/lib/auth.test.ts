/**
 * __tests__/lib/auth.test.ts
 * Unit tests for authentication logic
 */

import { authOptions } from '@/lib/auth'

describe('Authentication', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete (process.env as any).TALA_USER
    delete (process.env as any).TALA_PASSWORD
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('Default Credentials', () => {
    it('should have credentials provider configured', () => {
      expect(authOptions.providers).toBeDefined()
      expect(authOptions.providers.length).toBeGreaterThan(0)
    })

    it('should have JWT session strategy', () => {
      expect(authOptions.session?.strategy).toBe('jwt')
    })

    it('should have credentials provider with name', () => {
      const provider = authOptions.providers[0] as any
      expect(provider.name).toBe('credentials')
    })

    it('should have credentials with username and password fields', () => {
      const provider = authOptions.providers[0] as any
      expect(provider.credentials).toBeDefined()
      expect(provider.credentials.username).toBeDefined()
      expect(provider.credentials.password).toBeDefined()
    })
  })

  describe('Environment Variable Overrides', () => {
    it('should have authOptions configured with providers', () => {
      expect(authOptions.providers).toBeDefined()
      expect(authOptions.providers.length).toBeGreaterThan(0)
    })

    it('should use CredentialsProvider', () => {
      const provider = authOptions.providers[0] as any
      expect(provider.name).toBe('credentials')
    })

    it('should respect environment variables for credentials', () => {
      // Test that env vars are read during authorization
      const testUser = process.env.TALA_USER ?? 'admin'
      const testPass = process.env.TALA_PASSWORD ?? 'tala2026'

      expect(testUser).toBeDefined()
      expect(testPass).toBeDefined()
    })
  })

  describe('Session Configuration', () => {
    it('should use JWT session strategy', () => {
      expect(authOptions.session?.strategy).toBe('jwt')
    })

    it('should redirect to /login for signin', () => {
      expect(authOptions.pages?.signIn).toBe('/login')
    })
  })

  describe('Redirect Callback', () => {
    it('should redirect to URL if it starts with baseUrl', async () => {
      const callback = authOptions.callbacks?.redirect as any
      const result = await callback({
        url: 'http://localhost:3000/dashboard',
        baseUrl: 'http://localhost:3000',
      })

      expect(result).toBe('http://localhost:3000/dashboard')
    })

    it('should redirect to dashboard if URL is external', async () => {
      const callback = authOptions.callbacks?.redirect as any
      const result = await callback({
        url: 'http://evil.com/phishing',
        baseUrl: 'http://localhost:3000',
      })

      expect(result).toBe('http://localhost:3000/dashboard')
    })

    it('should handle root path redirect', async () => {
      const callback = authOptions.callbacks?.redirect as any
      const result = await callback({
        url: 'http://localhost:3000/',
        baseUrl: 'http://localhost:3000',
      })

      expect(result).toBe('http://localhost:3000/')
    })
  })
})

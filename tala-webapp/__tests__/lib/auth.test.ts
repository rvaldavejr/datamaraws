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
    it('should authorize with default credentials (admin/tala2026)', async () => {
      const provider = authOptions.providers[0] as any
      const result = await provider.authorize({
        username: 'admin',
        password: 'tala2026',
      })

      expect(result).toEqual({
        id: '1',
        name: 'TALA Researcher',
        email: 'tala@feutech.edu.ph',
      })
    })

    it('should reject invalid username with default credentials', async () => {
      const provider = authOptions.providers[0] as any
      const result = await provider.authorize({
        username: 'wronguser',
        password: 'tala2026',
      })

      expect(result).toBeNull()
    })

    it('should reject invalid password with default credentials', async () => {
      const provider = authOptions.providers[0] as any
      const result = await provider.authorize({
        username: 'admin',
        password: 'wrongpass',
      })

      expect(result).toBeNull()
    })

    it('should be case-sensitive', async () => {
      const provider = authOptions.providers[0] as any
      const result = await provider.authorize({
        username: 'Admin',
        password: 'tala2026',
      })

      expect(result).toBeNull()
    })
  })

  describe('Environment Variable Overrides', () => {
    it('should respect TALA_USER override', async () => {
      process.env.TALA_USER = 'researcher'
      process.env.TALA_PASSWORD = 'tala2026'

      const provider = authOptions.providers[0] as any
      const result = await provider.authorize({
        username: 'researcher',
        password: 'tala2026',
      })

      expect(result).not.toBeNull()
      expect(result?.name).toBe('TALA Researcher')
    })

    it('should respect TALA_PASSWORD override', async () => {
      process.env.TALA_USER = 'admin'
      process.env.TALA_PASSWORD = 'custom-password-123'

      const provider = authOptions.providers[0] as any
      const result = await provider.authorize({
        username: 'admin',
        password: 'custom-password-123',
      })

      expect(result).not.toBeNull()
    })

    it('should fail with old password when TALA_PASSWORD is changed', async () => {
      process.env.TALA_PASSWORD = 'new-password'

      const provider = authOptions.providers[0] as any
      const result = await provider.authorize({
        username: 'admin',
        password: 'tala2026',
      })

      expect(result).toBeNull()
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

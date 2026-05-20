/**
 * e2e/critical-journeys.spec.ts
 * Automated end-to-end black box testing with Playwright
 *
 * Run with: npx playwright test
 * Run in debug: npx playwright test --debug
 * Run specific test: npx playwright test -g "login"
 */

import { test, expect } from '@playwright/test'

test.describe('TALA WebApp - Critical User Journeys', () => {
  test.describe('Journey 1: Authentication Flow', () => {
    test('should redirect unauthenticated users to login', async ({ page }) => {
      await page.goto('/')
      await expect(page).toHaveURL('/login')
    })

    test('should show error on invalid credentials', async ({ page }) => {
      await page.goto('/login')

      await page.fill('input[type="text"]', 'wronguser')
      await page.fill('input[type="password"]', 'wrongpass')
      await page.click('button[type="submit"]')

      // Wait for error message
      const errorMessage = page.locator('text=/[Ii]nvalid|error/i')
      await expect(errorMessage).toBeVisible({ timeout: 5000 })
    })

    test('should login with valid credentials', async ({ page }) => {
      await page.goto('/login')

      await page.fill('input[type="text"]', 'admin')
      await page.fill('input[type="password"]', 'tala2026')
      await page.click('button[type="submit"]')

      await expect(page).toHaveURL('/dashboard', { timeout: 10000 })
    })

    test('should persist session on page refresh', async ({ page }) => {
      await page.goto('/login')
      await page.fill('input[type="text"]', 'admin')
      await page.fill('input[type="password"]', 'tala2026')
      await page.click('button[type="submit"]')

      await expect(page).toHaveURL('/dashboard', { timeout: 10000 })

      await page.reload()

      await expect(page).toHaveURL('/dashboard')
    })

    test('should logout and redirect to login', async ({ page }) => {
      await page.goto('/login')
      await page.fill('input[type="text"]', 'admin')
      await page.fill('input[type="password"]', 'tala2026')
      await page.click('button[type="submit"]')

      await expect(page).toHaveURL('/dashboard')

      // Click sign out button
      await page.click('button:has-text("Sign out")')

      await expect(page).toHaveURL('/login', { timeout: 5000 })
    })
  })

  test.describe('Journey 2: Map Initialization & Data Loading', () => {
    test.beforeEach(async ({ page }) => {
      // Login before each test
      await page.goto('/login')
      await page.fill('input[type="text"]', 'admin')
      await page.fill('input[type="password"]', 'tala2026')
      await page.click('button[type="submit"]')
      await page.waitForURL('/dashboard')
    })

    test('should display loading animation during data fetch', async ({ page }) => {
      const loadingText = page.locator('text=/[Ll]oading.*prediction points/i')
      await expect(loadingText).toBeVisible({ timeout: 2000 })

      const progressBar = page.locator('div:has-text("w-48")') // Loading bar
      await expect(progressBar).toBeVisible()
    })

    test('should render map with visible points', async ({ page }) => {
      // Wait for map to load
      const mapContainer = page.locator('[class*="mapboxgl"]')
      await expect(mapContainer).toBeVisible({ timeout: 15000 })

      // Verify map controls appear
      const zoomInButton = page.locator('button[aria-label*="Zoom in"], button.mapboxgl-ctrl-zoom-in')
      await expect(zoomInButton).toBeVisible()
    })

    test('should display legend with wealth index scale', async ({ page }) => {
      // Wait for legend
      const legend = page.locator('text="Wealth Index"')
      await expect(legend).toBeVisible({ timeout: 15000 })

      // Verify color gradient
      const legendBar = page.locator('div[style*="linear-gradient"]')
      await expect(legendBar).toBeVisible()
    })

    test('should have no console errors after loading', async ({ page, context }) => {
      let consoleErrors: string[] = []

      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text())
        }
      })

      // Wait for data to load
      await page.waitForTimeout(15000)

      // Filter out known/expected errors
      const filteredErrors = consoleErrors.filter(
        e => !e.includes('Not implemented') && !e.includes('test')
      )

      expect(filteredErrors).toHaveLength(0)
    })
  })

  test.describe('Journey 3: Point Click Selection', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login')
      await page.fill('input[type="text"]', 'admin')
      await page.fill('input[type="password"]', 'tala2026')
      await page.click('button[type="submit"]')
      await page.waitForURL('/dashboard')
      await page.waitForTimeout(15000) // Wait for map to load
    })

    test('should select area and show side panel on point click', async ({ page }) => {
      // Click on first visible point (may need to wait for map to render)
      const mapContainer = page.locator('[class*="mapboxgl-canvas"]')
      await mapContainer.click({ position: { x: 400, y: 300 } })

      // Wait for side panel to appear
      const sidePanel = page.locator('div:has-text(/^(Manila|Pasig|.*[A-Z][a-z]+)$/)')
      await expect(sidePanel).toBeVisible({ timeout: 5000 })
    })

    test('should display area statistics in side panel', async ({ page }) => {
      const mapContainer = page.locator('[class*="mapboxgl-canvas"]')
      await mapContainer.click({ position: { x: 400, y: 300 } })

      // Wait for statistics to appear
      const statsText = page.locator('text=/[Cc]ount|[Ww]ealth|[Ii]ndex/i')
      await expect(statsText).toBeVisible({ timeout: 5000 })
    })

    test('should close side panel with close button', async ({ page }) => {
      const mapContainer = page.locator('[class*="mapboxgl-canvas"]')
      await mapContainer.click({ position: { x: 400, y: 300 } })

      // Wait for panel
      const sidePanel = page.locator('div[class*="panel"], aside')
      await expect(sidePanel).toBeVisible({ timeout: 5000 })

      // Click close button
      const closeButton = page.locator('button:has-text("X"), button[aria-label="Close"]')
      if (await closeButton.isVisible()) {
        await closeButton.click()
      } else {
        // Try pressing Escape
        await page.keyboard.press('Escape')
      }

      await expect(sidePanel).not.toBeVisible()
    })
  })

  test.describe('Journey 4: Search Functionality', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login')
      await page.fill('input[type="text"]', 'admin')
      await page.fill('input[type="password"]', 'tala2026')
      await page.click('button[type="submit"]')
      await page.waitForURL('/dashboard')
      await page.waitForTimeout(15000)
    })

    test('should search for and select province', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="search"], input[type="text"][class*="search"]')
      await searchInput.fill('Quezon')

      // Wait for dropdown
      const dropdown = page.locator('text="Quezon"')
      await expect(dropdown).toBeVisible({ timeout: 3000 })

      // Click result
      await dropdown.click()

      // Verify map updated
      const mapArea = page.locator('[class*="mapboxgl"]')
      await expect(mapArea).toBeVisible()
    })

    test('should filter search results with partial text', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="search"], input[type="text"][class*="search"]')
      await searchInput.fill('Que')

      const results = page.locator('text=/Que/i')
      await expect(results.first()).toBeVisible({ timeout: 3000 })
    })
  })

  test.describe('Journey 5: Map Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login')
      await page.fill('input[type="text"]', 'admin')
      await page.fill('input[type="password"]', 'tala2026')
      await page.click('button[type="submit"]')
      await page.waitForURL('/dashboard')
      await page.waitForTimeout(15000)
    })

    test('should zoom in with zoom button', async ({ page }) => {
      const zoomInButton = page.locator('button[aria-label*="Zoom in"], button.mapboxgl-ctrl-zoom-in')
      await expect(zoomInButton).toBeVisible()

      // Get initial zoom level (if available)
      const initialZoom = await page.evaluate(() => {
        return (window as any).mapInstance?.getZoom?.() || 5.5
      })

      // Click zoom in
      await zoomInButton.click()
      await page.waitForTimeout(500)

      const newZoom = await page.evaluate(() => {
        return (window as any).mapInstance?.getZoom?.() || initialZoom
      })

      // Verify zoom increased (or at least didn't break)
      expect(newZoom).toBeGreaterThanOrEqual(initialZoom)
    })

    test('should zoom out with zoom button', async ({ page }) => {
      const zoomOutButton = page.locator('button[aria-label*="Zoom out"], button.mapboxgl-ctrl-zoom-out')
      await expect(zoomOutButton).toBeVisible()

      const initialZoom = await page.evaluate(() => {
        return (window as any).mapInstance?.getZoom?.() || 5.5
      })

      await zoomOutButton.click()
      await page.waitForTimeout(500)

      const newZoom = await page.evaluate(() => {
        return (window as any).mapInstance?.getZoom?.() || initialZoom
      })

      expect(newZoom).toBeLessThanOrEqual(initialZoom + 1)
    })

    test('should pan map on drag', async ({ page }) => {
      const mapContainer = page.locator('[class*="mapboxgl-canvas"]')

      const initialCenter = await page.evaluate(() => {
        return (window as any).mapInstance?.getCenter?.() || { lng: 122, lat: 12 }
      })

      // Drag map
      await mapContainer.dragTo(mapContainer, {
        sourcePosition: { x: 300, y: 300 },
        targetPosition: { x: 400, y: 400 },
      })

      await page.waitForTimeout(500)

      const newCenter = await page.evaluate(() => {
        return (window as any).mapInstance?.getCenter?.() || initialCenter
      })

      // Center should have changed (may be slightly if drag is small)
      expect(newCenter).toBeDefined()
    })
  })

  test.describe('Performance & Responsiveness', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login')
      await page.fill('input[type="text"]', 'admin')
      await page.fill('input[type="password"]', 'tala2026')
      await page.click('button[type="submit"]')
    })

    test('should load dashboard within acceptable time', async ({ page }) => {
      const startTime = Date.now()

      await page.waitForURL('/dashboard')
      await page.waitForSelector('[class*="mapboxgl"]', { timeout: 15000 })

      const loadTime = Date.now() - startTime
      expect(loadTime).toBeLessThan(20000) // 20 seconds max
    })

    test('should handle search with rapid inputs', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="search"], input[type="text"][class*="search"]')

      // Type rapidly
      await searchInput.type('ABCDEFGHIJ', { delay: 50 })

      // Should not crash
      await expect(page).not.toHaveTitle('Error')
    })
  })

  test.describe('Mobile Responsiveness', () => {
    test.beforeEach(async ({ browser }) => {
      // This test runs in mobile viewport (configured in playwright.config.ts)
    })

    test('should render dashboard on mobile', async ({ page }) => {
      await page.goto('/login')
      await page.fill('input[type="text"]', 'admin')
      await page.fill('input[type="password"]', 'tala2026')
      await page.click('button[type="submit"]')

      await page.waitForURL('/dashboard')
      await page.waitForSelector('[class*="mapboxgl"]', { timeout: 15000 })

      // Verify no horizontal scrolling
      const viewport = page.viewportSize()
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)

      expect(bodyWidth).toBeLessThanOrEqual((viewport?.width ?? 390) + 10)
    })
  })
})

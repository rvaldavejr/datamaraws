/**
 * __tests__/setup.ts
 * Test setup and configuration
 */

// Setup global test environment
beforeEach(() => {
  jest.clearAllMocks()
})

// Mock environment variables
process.env.TALA_USER = 'admin'
process.env.TALA_PASSWORD = 'tala2026'

// Mock next/navigation for tests
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  })),
}))

// Mock next-auth for tests
jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
  useSession: jest.fn(() => ({
    data: { user: { name: 'Test User', email: 'test@example.com' } },
    status: 'authenticated',
  })),
}))

// Mock next-auth server session
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(async () => ({
    user: { name: 'Test User', email: 'test@example.com' },
  })),
}))

// Mock Mapbox GL
jest.mock('mapbox-gl', () => ({
  Map: jest.fn(function() {
    return {
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      addSource: jest.fn(),
      removeSource: jest.fn(),
      addLayer: jest.fn(),
      removeLayer: jest.fn(),
      getLayer: jest.fn(),
      getSource: jest.fn(),
      setFeatureState: jest.fn(),
      getFeatureState: jest.fn(),
      fitBounds: jest.fn(),
      flyTo: jest.fn(),
      getZoom: jest.fn(() => 5.5),
      getCenter: jest.fn(() => ({ lng: 122.0, lat: 12.0 })),
      getCanvas: jest.fn(() => ({ style: {} })),
      remove: jest.fn(),
      isSourceLoaded: jest.fn(() => true),
    }
  }),
  Popup: jest.fn(function() {
    return {
      setLngLat: jest.fn(function() { return this }),
      setHTML: jest.fn(function() { return this }),
      addTo: jest.fn(function() { return this }),
      remove: jest.fn(),
    }
  }),
  LngLatBounds: jest.fn(function(sw, ne) {
    this.getSouthWest = jest.fn(() => sw)
    this.getNorthEast = jest.fn(() => ne)
  }),
  NavigationControl: jest.fn(),
  accessToken: 'test-token',
}))

// Global test utilities
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn(function() {
  return {
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }
}) as any

// Suppress specific console messages during tests
const originalError = console.error
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string') {
      if (args[0].includes('Warning: ReactDOM.render')) return
      if (args[0].includes('Not implemented')) return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})

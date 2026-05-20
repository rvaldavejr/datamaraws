# TALA WebApp Testing Quick Reference

## Installation

Install test dependencies:

```bash
npm install --save-dev jest ts-jest @types/jest @testing-library/react @testing-library/jest-dom
npm install --save-dev @testing-library/user-event
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm test -- __tests__/lib
```

### Integration Tests Only
```bash
npm test -- __tests__/integration
```

### Specific Test File
```bash
npm test -- __tests__/lib/auth.test.ts
```

### Watch Mode (Auto-rerun on changes)
```bash
npm test -- --watch
```

### Coverage Report
```bash
npm test -- --coverage
```

This generates coverage report in `./coverage` directory. Open `coverage/lcov-report/index.html` in browser.

### Coverage for Specific File
```bash
npm test -- --coverage __tests__/lib/auth.test.ts
```

---

## Test Files Organization

```
tala-webapp/
├── __tests__/
│   ├── setup.ts                 # Test configuration & mocks
│   ├── utils/
│   │   └── test-helpers.ts      # Shared utilities & mock data
│   ├── lib/
│   │   └── auth.test.ts         # Unit tests: Authentication
│   ├── integration/
│   │   └── data-loading.test.ts # Integration tests: Data loading
│   └── black-box/
│       └── user-journeys.spec.md # Manual black box scenarios
├── jest.config.js               # Jest configuration
└── TESTING_STRATEGY.md          # Complete testing strategy document
```

---

## Test Types

### 1. Unit Tests (`__tests__/lib/`)
- Test individual functions/components in isolation
- Mock external dependencies
- Fast execution
- Run: `npm test -- __tests__/lib`

**Examples:**
- Auth credential validation
- Type checking
- Utility function logic

### 2. Integration Tests (`__tests__/integration/`)
- Test component interactions
- Test data flow between modules
- Use realistic mocks
- Run: `npm test -- __tests__/integration`

**Examples:**
- Data loading from multiple sources
- Map/data component interaction
- Area selection flow

### 3. Black Box Tests (`__tests__/black-box/`)
- Manual user journey testing
- Test complete workflows
- No code knowledge required
- Documented in `user-journeys.spec.md`
- Run manually or via Cypress/Playwright

**Examples:**
- Login → Dashboard → Select Area → View Stats
- Search → Map Update → PDF Export
- Point Click → Side Panel

---

## Debugging Tests

### Run Single Test
```bash
npm test -- __tests__/lib/auth.test.ts -t "should authorize with default credentials"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```
Then open Chrome DevTools at `chrome://inspect`

### Print Debug Info
Add `console.log()` in test:
```typescript
it('should work', () => {
  console.log('Debug info:', data)
  expect(data).toBe(expected)
})
```

Run with:
```bash
npm test -- --verbose
```

---

## Writing New Tests

### Unit Test Template
```typescript
describe('Feature Name', () => {
  it('should do something', () => {
    // Arrange: Set up test data
    const input = 'test'
    
    // Act: Execute function
    const result = myFunction(input)
    
    // Assert: Verify result
    expect(result).toBe('expected')
  })
})
```

### Integration Test Template
```typescript
describe('Feature Integration', () => {
  beforeEach(() => {
    // Setup before each test
    jest.clearAllMocks()
  })

  it('should integrate components', async () => {
    // Mock external dependencies
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => mockData })
    )
    
    // Execute
    const result = await integration()
    
    // Verify
    expect(result).toBeDefined()
  })
})
```

### Use Mock Helpers
```typescript
import { mockPoints, mockProvinces } from '@/__tests__/utils/test-helpers'

it('should load data', () => {
  const points = mockPoints()
  const provinces = mockProvinces()
  
  expect(points.length).toBeGreaterThan(0)
  expect(provinces['NCR']).toBeDefined()
})
```

---

## Manual Black Box Testing

### Run Full User Journey
1. Start dev server: `npm run dev`
2. Open http://localhost:3000
3. Follow test cases in `__tests__/black-box/user-journeys.spec.md`
4. Document any issues found
5. Check performance metrics in DevTools

### Performance Testing
```bash
# Start in production mode
npm run build
npm start

# DevTools → Performance tab → Record
# Perform actions: click, search, zoom
# Stop recording and analyze
```

### Mobile Testing
```bash
# DevTools → Toggle device toolbar (Ctrl+Shift+M)
# Select iPhone 12 or iPad
# Run through black box scenarios on mobile
```

---

## Common Issues & Solutions

### Tests Fail: "Cannot find module '@/lib/auth'"
**Solution:** Verify `jsconfig.json` or `tsconfig.json` has path alias:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Tests Fail: "Mapbox GL accessToken is undefined"
**Solution:** Mock is loaded in `setup.ts`. Verify:
```bash
npm test -- --showConfig | grep setup
```

### Tests Timeout
**Solution:** Increase timeout in `jest.config.js`:
```javascript
testTimeout: 10000, // 10 seconds
```

### Coverage Below Threshold
**Solution:** 
1. Identify uncovered lines: `coverage/lcov-report/index.html`
2. Add tests for those lines
3. Run: `npm test -- --coverage`

---

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v2
```

---

## Test Metrics & Reporting

### Coverage Thresholds (jest.config.js)
```javascript
coverageThreshold: {
  global: {
    branches: 70,
    functions: 80,
    lines: 80,
    statements: 80,
  },
}
```

### View Coverage Report
```bash
npm test -- --coverage
open coverage/lcov-report/index.html
```

### Generate HTML Report
```bash
npm test -- --coverage --collectCoverageFrom="src/**/*.{ts,tsx}"
```

---

## Testing Checklist

Before committing code:
- [ ] All tests pass: `npm test`
- [ ] Coverage meets threshold: `npm test -- --coverage`
- [ ] No console errors
- [ ] No linting errors: `npm run lint`
- [ ] Manual black box test of changed feature

Before releasing:
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Black box manual testing complete
- [ ] Performance metrics acceptable
- [ ] Mobile responsiveness verified
- [ ] Cross-browser testing done
- [ ] UAT sign-off obtained

---

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Testing Library](https://testing-library.com/)
- [Mapbox GL Testing](https://docs.mapbox.com/mapbox-gl-js/guides/)
- [Next.js Testing](https://nextjs.org/docs/testing)

---

## Support

For test-related questions:
1. Check existing test files for examples
2. Review `test-helpers.ts` for available utilities
3. Check TESTING_STRATEGY.md for test design
4. Review jest.config.js for configuration

Run with verbose output for debugging:
```bash
npm test -- --verbose
```

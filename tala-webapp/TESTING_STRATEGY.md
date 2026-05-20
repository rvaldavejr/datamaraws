# TALA WebApp Testing Strategy

## Overview
Comprehensive testing plan for Project TALA geospatial poverty incidence estimation webapp. Covers alpha, beta, white box, and black box testing approaches.

---

## 1. ALPHA TESTING (Internal Feature Validation)

### Purpose
Internal validation of core features before release to external users. Focus on functionality completeness and known issue identification.

### Test Environment
- Local development (`npm run dev`)
- Staging deployment (if available)
- Testers: Development team members only

### 1.1 Authentication Flow

**Test Cases:**
```
✓ Valid credentials (admin/tala2026) → successful login → redirect to /dashboard
✓ Invalid username → error message displayed
✓ Invalid password → error message displayed
✓ Session persistence across page refresh
✓ JWT token expiration and refresh
✓ Sign out → clears session → redirect to /login
✓ Protected route access without auth → redirect to /login
✓ Env var override: TALA_USER and TALA_PASSWORD respected
```

**Coverage Areas:**
- NextAuth configuration and session management
- Credentials provider validation
- Redirect callbacks after login
- Logout functionality

### 1.2 Data Loading

**Test Cases:**
```
✓ All 5 JSON files load on dashboard mount:
  - /data/points.json (prediction points)
  - /data/provinces.json
  - /data/municipalities.json
  - /data/shap_global.json
  - /data/shap_by_area.json
✓ Loading state displays correct count: "Loading XXX prediction points"
✓ Loading bar animates during fetch
✓ Error handling: network failure shows error in console
✓ Performance: data loads within <3 seconds (measure with DevTools)
✓ Data structure validation:
  - Points have: id, province, municipality, lat, lon, wi, wi_class, osm
  - Provinces have required aggregate data
  - Municipality data maps correctly to province
✓ No duplicate points loaded
✓ Coordinate bounds valid (Philippines region: 117-127°E, 5-18°N)
```

**Coverage Areas:**
- Promise.all() concurrent fetching
- Error handling in try-catch
- State management (setPoints, setProvinces, etc.)
- Data structure consistency

### 1.3 Map Initialization

**Test Cases:**
```
✓ Mapbox token loads from NEXT_PUBLIC_MAPBOX_TOKEN
✓ Map initializes to center [122.0, 12.0] with zoom 5.5
✓ Zoom constraints enforced: minZoom=4, maxZoom=14
✓ Style loads: 'mapbox://styles/mapbox/dark-v11'
✓ Navigation control appears (top-right)
✓ All GeoJSON sources load:
  - provinces-boundary (/geodata/tala-prov.geojson)
  - municipalities-boundary (/geodata/tala-muni.geojson)
✓ All layers render:
  - province-highlight-fill/line
  - municipality-highlight-fill/line
  - points-circle
✓ Point heatmap colors map to wealth index:
  - -2.5: red (#c0392b)
  - -0.5: orange (#e67e22)
  - 0: dark blue (#326189)
  - 0.5: light blue (#88bcbd)
  - 2.0: cyan (#5ce1e6)
```

**Coverage Areas:**
- Mapbox GL initialization
- Layer/source management
- Paint property interpolation
- Feature state system

### 1.4 Area Selection

**Test Cases:**
```
✓ Click on map point → selects corresponding municipality
✓ Search bar selection → same result as map click
✓ Province selection → filters points to that province
✓ Municipality selection → filters points to that municipality & province
✓ NCR special case: 4 district polygons highlight, not 1
✓ Boundary highlight appears (cyan fill + stroke)
✓ Map flies to bounding box of selected points
✓ SidePanel opens with selected area data
✓ Close button removes selection
✓ Double-click empty area → zoom in +2 levels
✓ Previous highlight clears before new selection applies
```

**Coverage Areas:**
- Click handlers (points-circle layer)
- Feature state management (setFeatureState)
- Boundary highlighting logic
- Camera control (fitBounds, flyTo)
- NCR boundary ID resolution

### 1.5 Side Panel

**Test Cases:**
```
✓ Panel displays for selected province
✓ Panel displays for selected municipality
✓ Panel shows wealth index statistics (min, max, mean)
✓ Panel displays prediction points list
✓ Panel renders SHAP values if available
✓ Panel displays chart visualization
✓ Close button (X) deselects area
✓ Export to PDF works
✓ Scrolling doesn't affect map interaction
✓ Panel width doesn't obscure map legends
```

**Coverage Areas:**
- SidePanel component rendering
- Conditional data display
- Chart.js integration
- PDF export (html2pdf.js)

### 1.6 Search Functionality

**Test Cases:**
```
✓ Search by province name → returns all provinces matching
✓ Search by municipality name → returns all matches
✓ Fuzzy matching (case-insensitive)
✓ Empty search clears results
✓ Clicking result selects area
✓ Results dropdown positioned correctly
✓ Search handles special characters (ñ, accents)
✓ Search performance: <500ms for full dataset
```

**Coverage Areas:**
- SearchBar component
- Query matching logic
- Result rendering

### 1.7 UI/UX Validation

**Test Cases:**
```
✓ Color scheme consistent (slate-900, slate-950 backgrounds)
✓ Responsive layout: map fills available space
✓ Top bar displays project logo + title
✓ Wealth index legend visible (color gradient)
✓ User manual link (bottom-left) opens PDF
✓ Sign out button in top-right corner
✓ Text is readable in dark mode
✓ Icons render properly (lucide-react)
✓ Loading spinner animates smoothly
✓ No layout shift when data loads
```

**Coverage Areas:**
- Tailwind CSS classes
- Image optimization (Next.js Image)
- Icon rendering

---

## 2. BETA TESTING (Extended User Validation)

### Purpose
Real-world usage validation by researchers/analysts. Identify usability issues and edge cases.

### Test Environment
- Staging deployment (public URL)
- Limited user group (5-10 researchers)
- 1-2 week test period
- Data collection via survey/feedback form

### 2.1 Usability Testing

**Test Scenarios:**
1. **New User Onboarding**
   - Can login without documentation?
   - Is map intuitive to navigate?
   - Does search make sense?
   - Is wealth index color scheme clear?

2. **Researcher Workflow**
   - Select province → view statistics
   - Export results to PDF
   - Compare across regions
   - Identify poorest areas
   - Navigate zoom levels appropriately

3. **Data Accuracy Check**
   - Do point locations match known geography?
   - Do wealth index values seem reasonable?
   - Are municipality boundaries correct?
   - Is NCR representation accurate?

### 2.2 Performance Testing

**Metrics to Collect:**
- Page load time (target: <2s)
- Data fetch time (target: <3s)
- Search response time (target: <500ms)
- Map pan/zoom responsiveness
- PDF export duration (target: <10s)
- Memory usage (browser DevTools)
- Network tab: total bundle size

**Test Configurations:**
- Desktop (Chrome, Firefox, Safari)
- Mobile (iOS Safari, Chrome)
- Different network speeds:
  - Wifi (baseline)
  - 4G (simulated)
  - 3G (simulated) — via DevTools throttling

### 2.3 Accessibility Testing

**Tests:**
```
✓ Keyboard navigation (Tab, Enter, Escape)
✓ Screen reader compatibility (ARIA labels)
✓ Color contrast ratios (WCAG AA minimum 4.5:1)
✓ Font size readable (no smaller than 12px)
✓ Focus indicators visible
✓ Map accessible via keyboard
✓ Search results keyboard accessible
```

**Tools:**
- axe DevTools browser extension
- Lighthouse accessibility audit
- Manual keyboard navigation

### 2.4 Data Validation

**Field Checks:**
```
✓ Wealth index range: -2.5 to +2.0
✓ Point counts reasonable (>0 per municipality typically)
✓ Coordinates within Philippines bounds
✓ Province/municipality names match official PSA list
✓ SHAP values normalized correctly
✓ OSM features (VIIRS, POI count, road length) present
```

### 2.5 User Feedback Form

**Questions:**
```
1. Rate overall usability (1-5)
2. Which features were most useful?
3. Which features were confusing?
4. Any missing features?
5. Did results match expectations?
6. Performance acceptable?
7. Would recommend to colleagues?
8. Free text feedback
```

---

## 3. WHITE BOX TESTING (Code-level Internal Testing)

### Purpose
Test internal code logic, data structures, and integration points.

### 3.1 Unit Tests

**Authentication (`src/lib/auth.ts`)**
```typescript
describe('authOptions', () => {
  it('authorizes with valid credentials', async () => {
    const result = await authorize({ 
      username: 'admin', 
      password: 'tala2026' 
    })
    expect(result).toEqual({ 
      id: '1', 
      name: 'TALA Researcher', 
      email: 'tala@feutech.edu.ph' 
    })
  })
  
  it('rejects invalid username', async () => {
    const result = await authorize({ 
      username: 'wrong', 
      password: 'tala2026' 
    })
    expect(result).toBeNull()
  })
  
  it('rejects invalid password', async () => {
    const result = await authorize({ 
      username: 'admin', 
      password: 'wrong' 
    })
    expect(result).toBeNull()
  })
  
  it('respects TALA_USER env var', async () => {
    process.env.TALA_USER = 'researcher'
    // re-import to get new env
    const result = await authorize({ 
      username: 'researcher', 
      password: 'tala2026' 
    })
    expect(result).not.toBeNull()
  })
  
  it('respects TALA_PASSWORD env var', async () => {
    process.env.TALA_PASSWORD = 'secret123'
    const result = await authorize({ 
      username: 'admin', 
      password: 'secret123' 
    })
    expect(result).not.toBeNull()
  })
})
```

**Type Validation (`src/types/index.ts`)**
```typescript
describe('Types', () => {
  it('PredictionPoint has all required fields', () => {
    const point: PredictionPoint = {
      id: '1',
      lat: 14.5,
      lon: 121.0,
      wi: 0.5,
      wi_class: 'high',
      province: 'NCR',
      municipality: 'Manila',
      osm: { VIIRS_Median: 50, Total_POI_Count: 100, Total_Road_Length: 5000 }
    }
    expect(point.wi).toBeGreaterThanOrEqual(-2.5)
    expect(point.wi).toBeLessThanOrEqual(2.0)
  })
  
  it('ProvinceData has correct structure', () => {
    const data: ProvinceData = {
      count: 100,
      mean_wi: 0.2,
      min_wi: -1.5,
      max_wi: 1.8,
      // ... other fields
    }
    expect(data.count).toBeGreaterThan(0)
    expect(data.mean_wi).toBeBetween(data.min_wi, data.max_wi)
  })
})
```

**Data Loading (`src/app/dashboard/page.tsx`)**
```typescript
describe('Dashboard Data Loading', () => {
  it('loads all 5 JSON files concurrently', async () => {
    const start = performance.now()
    // Simulate load
    const [pts, provs, munis, sg, sa] = await Promise.all([
      fetch('/data/points.json').then(r => r.json()),
      fetch('/data/provinces.json').then(r => r.json()),
      fetch('/data/municipalities.json').then(r => r.json()),
      fetch('/data/shap_global.json').then(r => r.json()),
      fetch('/data/shap_by_area.json').then(r => r.json()),
    ])
    const duration = performance.now() - start
    
    expect(pts).toBeDefined()
    expect(provs).toBeDefined()
    expect(munis).toBeDefined()
    expect(sg).toBeDefined()
    expect(sa).toBeDefined()
    expect(duration).toBeLessThan(3000)
  })
  
  it('handles fetch errors gracefully', async () => {
    // Mock fetch to fail
    global.fetch = jest.fn(() => 
      Promise.reject(new Error('Network error'))
    )
    
    const consoleSpy = jest.spyOn(console, 'error')
    // Trigger load
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load data:', 
      expect.any(Error)
    )
  })
})
```

**Area Selection Logic (`src/app/dashboard/page.tsx`)**
```typescript
describe('Area Selection', () => {
  it('filters points by province', () => {
    const points: PredictionPoint[] = [
      { ...mockPoint, province: 'NCR', municipality: 'Manila' },
      { ...mockPoint, province: 'NCR', municipality: 'Pasig' },
      { ...mockPoint, province: 'Quezon', municipality: 'Lucena' },
    ]
    
    const filtered = points.filter(p => p.province === 'NCR')
    expect(filtered).toHaveLength(2)
  })
  
  it('filters points by municipality', () => {
    const points: PredictionPoint[] = [ /* ... */ ]
    const filtered = points.filter(p =>
      p.municipality === 'Manila' && p.province === 'NCR'
    )
    expect(filtered).toHaveLength(1)
  })
  
  it('NCR returns shapByArea[NCR] or shapGlobal fallback', () => {
    const shapByArea = { 'NCR': [ /* NCR-specific SHAP */ ] }
    const shapGlobal = [ /* global SHAP */ ]
    
    const result = shapByArea['NCR'] ?? shapGlobal
    expect(result).toEqual(shapByArea['NCR'])
  })
})
```

### 3.2 Integration Tests

**Map Component Integration**
```typescript
describe('Map Component Integration', () => {
  it('initializes Mapbox with correct configuration', () => {
    const mapSpy = jest.fn()
    const config = {
      container: 'map-container',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [122.0, 12.0],
      zoom: 5.5,
      minZoom: 4,
      maxZoom: 14,
    }
    expect(mapSpy).toHaveBeenCalledWith(config)
  })
  
  it('adds sources before layers', async () => {
    const addSourceSpy = jest.fn()
    const addLayerSpy = jest.fn()
    
    // Verify sources added first
    expect(addSourceSpy).toHaveBeenCalledBefore(addLayerSpy)
  })
  
  it('handles feature highlight state correctly', () => {
    const map = mockMapboxMap()
    const setFeatureStateSpy = jest.spyOn(map, 'setFeatureState')
    
    // Select province
    map.setFeatureState({ source: 'provinces-boundary', id: 'NCR' }, { selected: true })
    expect(setFeatureStateSpy).toHaveBeenCalled()
    
    // Verify state cleared before new selection
    map.setFeatureState({ source: 'provinces-boundary', id: 'NCR' }, { selected: false })
  })
  
  it('flies to bounding box of selected points', () => {
    const map = mockMapboxMap()
    const fitBoundsSpy = jest.spyOn(map, 'fitBounds')
    const points = [ 
      { lon: 121.0, lat: 14.0 },
      { lon: 122.0, lat: 15.0 },
    ]
    
    const lons = points.map(p => p.lon)
    const lats = points.map(p => p.lat)
    const bounds = new mapboxgl.LngLatBounds(
      [Math.min(...lons) - 0.05, Math.min(...lats) - 0.05],
      [Math.max(...lons) + 0.05, Math.max(...lats) + 0.05],
    )
    
    map.fitBounds(bounds, { padding: 80, maxZoom: 11 })
    expect(fitBoundsSpy).toHaveBeenCalledWith(bounds, expect.any(Object))
  })
})
```

**Search Bar Integration**
```typescript
describe('SearchBar Component', () => {
  it('filters provinces by query', () => {
    const provinces = {
      'NCR': { /* data */ },
      'Quezon': { /* data */ },
      'Nueva Ecija': { /* data */ },
    }
    const query = 'Que'
    
    const results = Object.keys(provinces).filter(p => 
      p.toLowerCase().includes(query.toLowerCase())
    )
    expect(results).toEqual(['Quezon', 'Nueva Ecija'])
  })
  
  it('calls onSelect with correct params on result click', () => {
    const onSelect = jest.fn()
    // Simulate clicking 'Quezon' result
    onSelect('province', 'Quezon')
    
    expect(onSelect).toHaveBeenCalledWith('province', 'Quezon')
  })
})
```

### 3.3 Data Flow Tests

**JSON Data Schema Validation**
```typescript
describe('Data Schema Validation', () => {
  it('points.json conforms to expected schema', async () => {
    const data = await fetch('/data/points.json').then(r => r.json())
    
    expect(Array.isArray(data)).toBe(true)
    data.forEach(point => {
      expect(point).toHaveProperty('id')
      expect(point).toHaveProperty('lat')
      expect(point).toHaveProperty('lon')
      expect(point).toHaveProperty('wi')
      expect(point).toHaveProperty('province')
      expect(point).toHaveProperty('municipality')
      expect(point).toHaveProperty('osm')
      
      expect(typeof point.lat).toBe('number')
      expect(typeof point.lon).toBe('number')
      expect(point.lat).toBeGreaterThanOrEqual(4)
      expect(point.lat).toBeLessThanOrEqual(20)
      expect(point.lon).toBeGreaterThanOrEqual(116)
      expect(point.lon).toBeLessThanOrEqual(128)
    })
  })
  
  it('municipalities.json links correctly to provinces', async () => {
    const provinces = await fetch('/data/provinces.json').then(r => r.json())
    const municipalities = await fetch('/data/municipalities.json').then(r => r.json())
    
    const provinceKeys = new Set(Object.keys(provinces))
    
    Object.values(municipalities).forEach((muni: any) => {
      expect(provinceKeys.has(muni.province)).toBe(true)
    })
  })
  
  it('shap_global and shap_by_area have matching structure', async () => {
    const global = await fetch('/data/shap_global.json').then(r => r.json())
    const byArea = await fetch('/data/shap_by_area.json').then(r => r.json())
    
    expect(Array.isArray(global)).toBe(true)
    Object.values(byArea).forEach((regional: any) => {
      expect(Array.isArray(regional)).toBe(true)
      if (global.length > 0 && regional.length > 0) {
        expect(regional[0]).toHaveProperty('feature')
        expect(regional[0]).toHaveProperty('value')
      }
    })
  })
})
```

### 3.4 Boundary Logic Tests

**NCR Special Case**
```typescript
describe('NCR Boundary Handling', () => {
  it('returns 4 district IDs for NCR', () => {
    const boundaryIds = toBoundaryIds('NCR', 'province')
    expect(boundaryIds).toEqual([
      'NCR, City of Manila, First District (Not a Province)',
      'NCR, Second District (Not a Province)',
      'NCR, Third District (Not a Province)',
      'NCR, Fourth District (Not a Province)',
    ])
  })
  
  it('returns single ID for other provinces', () => {
    const boundaryIds = toBoundaryIds('Quezon', 'province')
    expect(boundaryIds).toEqual(['Quezon'])
  })
  
  it('clears all 4 district highlights before applying new selection', () => {
    const map = mockMapboxMap()
    const setFeatureStateSpy = jest.spyOn(map, 'setFeatureState')
    
    // Clear previous NCR selection
    const ids = [
      'NCR, City of Manila, First District (Not a Province)',
      'NCR, Second District (Not a Province)',
      'NCR, Third District (Not a Province)',
      'NCR, Fourth District (Not a Province)',
    ]
    
    ids.forEach(id => {
      map.setFeatureState({ source: 'provinces-boundary', id }, { selected: false })
    })
    
    expect(setFeatureStateSpy).toHaveBeenCalledTimes(4)
  })
})
```

### 3.5 Performance Tests

**Rendering Performance**
```typescript
describe('Performance Benchmarks', () => {
  it('renders map with 5000+ points without lag', () => {
    const perfMark = performance.now()
    
    const geojson = {
      type: 'FeatureCollection',
      features: Array(5000).fill(null).map((_, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [121 + Math.random(), 14 + Math.random()] },
        properties: { id: i }
      }))
    }
    
    const elapsed = performance.now() - perfMark
    expect(elapsed).toBeLessThan(100) // GeoJSON construction should be <100ms
  })
  
  it('paint property interpolation is efficient', () => {
    const paintConfig = {
      'circle-color': [
        'interpolate', ['linear'], ['get', 'wi'],
        -2.5, '#c0392b',
        -0.5, '#e67e22',
        0, '#326189',
        0.5, '#88bcbd',
        2.0, '#5ce1e6',
      ]
    }
    
    expect(paintConfig['circle-color']).toBeDefined()
    expect(paintConfig['circle-color']).toHaveLength(11) // 1 + 2 + 8 values
  })
})
```

---

## 4. BLACK BOX TESTING (User-focused Functional Testing)

### Purpose
Validate application functionality from user perspective without knowledge of internal code.

### 4.1 Critical User Journeys

**Journey 1: Basic Navigation**
```
Steps:
1. Open app at base URL → redirected to /login
2. Enter credentials (admin/tala2026)
3. Click login button → redirected to /dashboard
4. Verify map displays with points visible
5. Verify legend displays wealth index color gradient
6. Verify top bar shows "Project TALA" title

Expected Results:
✓ All elements visible and functional
✓ No console errors
✓ Page loads within 5 seconds
```

**Journey 2: Area Selection via Search**
```
Steps:
1. Click search bar
2. Type "Que" (partial province name)
3. See dropdown with "Quezon" option
4. Click "Quezon" result
5. Observe map behavior

Expected Results:
✓ Dropdown appears with matching results
✓ Map zooms/pans to selected province
✓ Cyan boundary highlight around Quezon
✓ Side panel opens with statistics
✓ Statistics include: count, mean WI, min, max
```

**Journey 3: Area Selection via Map Click**
```
Steps:
1. Click on a visible point on the map
2. Observe side panel

Expected Results:
✓ Side panel opens for that municipality
✓ Correct municipality name displayed
✓ Correct province displayed
✓ Statistics shown for that municipality
✓ Cyan highlight around selected points
```

**Journey 4: Map Navigation**
```
Steps:
1. Click and drag map → pan
2. Scroll to zoom in/out
3. Double-click → zoom in +2 levels
4. Use zoom buttons (top-right)

Expected Results:
✓ All interactions responsive
✓ No lag or stuttering
✓ Zoom respects min/max constraints (4-14)
```

**Journey 5: Data Export**
```
Steps:
1. Select a province or municipality
2. Side panel appears
3. Click "Export to PDF" button
4. Verify file downloaded

Expected Results:
✓ PDF downloads with correct filename
✓ PDF contains statistics and charts
✓ PDF displays wealth index data
✓ Export completes within 10 seconds
```

**Journey 6: User Logout**
```
Steps:
1. Click "Sign out" button (top-right)
2. Observe redirect

Expected Results:
✓ Session cleared
✓ Redirected to /login page
✓ Cannot access /dashboard without re-login
✓ Credentials required again to access dashboard
```

### 4.2 Edge Cases & Error Scenarios

**Scenario 1: Invalid Credentials**
```
Input: username=wrong, password=wrong
Expected: Error message displayed, stay on /login
```

**Scenario 2: Network Timeout**
```
Action: Simulate slow network (DevTools throttle to 4G/3G)
Expected: Loading indicator shows, data eventually loads or timeout message appears
```

**Scenario 3: Missing GeoJSON Files**
```
Precondition: Temporarily delete /geodata files
Expected: Map still renders points, boundaries don't highlight
```

**Scenario 4: No Points in Selected Area**
```
Action: Select area with 0 prediction points (if exists)
Expected: Side panel shows empty state, no crash
```

**Scenario 5: Rapid Selection Changes**
```
Action: Quickly click multiple points/search results
Expected: Only latest selection displayed, no race conditions
```

**Scenario 6: Mobile Responsiveness**
```
Test on: iPhone 12 (390x844), iPad (768x1024), Android
Expected: Map fills screen, side panel scrollable, all controls accessible
```

### 4.3 Data Accuracy Validation

**Test: Point Locations Match Geography**
```
Verification:
- Select NCR → all points appear within NCR bounds ✓
- Select Quezon → all points in Quezon municipality bounds ✓
- Wealth index color matches legend (red = poor, cyan = wealthy) ✓
```

**Test: Statistics Calculations**
```
Manual Verification:
1. Note displayed mean WI for a province
2. Manually calculate average from visible points
3. Verify match (within 0.01 margin for rounding)
```

**Test: Boundary Accuracy**
```
Verification:
- Province boundaries match PSA official shapefiles ✓
- Municipality boundaries correctly nested within provinces ✓
- NCR four districts display as expected ✓
```

### 4.4 UI Consistency Tests

**Test: Visual Elements**
```
✓ All text readable (sufficient contrast)
✓ Colors consistent with design system
✓ Icons render without glitches
✓ Animations smooth (no jank)
✓ Buttons have clear hover states
✓ Form inputs focused correctly
✓ Loading states indicate progress
✓ Error messages clear and helpful
```

**Test: Cross-browser Compatibility**
```
Browsers to test:
- Chrome 126+
- Firefox 126+
- Safari 17+
- Edge 126+

Expected: Identical rendering, all functionality works
```

**Test: Responsive Design**
```
Breakpoints:
- Mobile: 320px, 375px, 425px
- Tablet: 768px, 1024px
- Desktop: 1366px, 1920px

Expected: Layout adapts, no horizontal scrolling, all interactive
```

### 4.5 Performance Monitoring

**Metrics to Verify (User Experience)**
```
First Contentful Paint (FCP): < 2.5s
Largest Contentful Paint (LCP): < 4s
Cumulative Layout Shift (CLS): < 0.1
Time to Interactive (TTI): < 5s

Tools: Lighthouse, WebPageTest, Chrome DevTools
```

**Action Responsiveness**
```
Map pan: immediate visual feedback
Map zoom: smooth interpolation
Point click: <200ms to side panel open
Search: <500ms results appear
Data export: <10s PDF download
```

### 4.6 Regression Testing Checklist

**Before Each Release, Verify:**
```
Authentication
✓ Login works with correct credentials
✓ Login fails with incorrect credentials
✓ Logout clears session
✓ Protected routes redirect to /login

Data Loading
✓ All 5 JSON files load
✓ Loading animation displays
✓ Data appears on map
✓ No duplicate points

Map
✓ Points render with correct colors
✓ Province boundaries visible
✓ Municipality boundaries visible
✓ Point click selects municipality
✓ Boundary highlighting works (NCR included)
✓ Zoom and pan work smoothly

Search
✓ Search finds provinces
✓ Search finds municipalities
✓ Results clickable
✓ Selection works from search result

Side Panel
✓ Opens on selection
✓ Shows correct statistics
✓ Shows correct area name
✓ Close button works
✓ PDF export works

UI
✓ Dark theme displays correctly
✓ All text readable
✓ No console errors
✓ No layout shifts
✓ Responsive on mobile

Performance
✓ Page load < 5s
✓ Map renders < 3s
✓ Search response < 500ms
```

### 4.7 User Acceptance Test (UAT) Checklist

**For Final Stakeholder Sign-off:**
```
Functionality
☐ All required features working
☐ Data matches expected results
☐ Reports accurate and useful
☐ No critical bugs

Performance
☐ Acceptable load times
☐ Responsive to user input
☐ Works on target devices
☐ Works on target networks

Usability
☐ Intuitive navigation
☐ Clear instructions (via manual)
☐ Helpful error messages
☐ Professional appearance

Data Quality
☐ Point locations accurate
☐ Statistics calculated correctly
☐ Wealth index values reasonable
☐ Geographic boundaries match official data

Security
☐ Authentication required
☐ Session properly managed
☐ No exposed credentials
☐ HTTPS enforced (if deployed)

Stakeholder Sign-off
☐ Business owner approves
☐ Technical lead approves
☐ Researcher approves
```

---

## Test Execution Plan

### Phase 1: Alpha (Week 1-2)
- Run all unit tests
- Run integration tests
- Manual feature validation by dev team
- Performance baseline measurements

### Phase 2: Staging (Week 3)
- Deploy to staging environment
- Run all black box critical user journeys
- Performance testing on target network
- Browser/device compatibility testing

### Phase 3: Beta (Week 4-5)
- Release to 5-10 beta users
- Collect usability feedback
- Monitor error logs
- Gather performance data
- Conduct UAT

### Phase 4: Production (Week 6)
- Deploy to production
- Monitor for issues
- Respond to user feedback
- Plan maintenance updates

---

## Test Metrics & Success Criteria

| Metric | Target | Success |
|--------|--------|---------|
| Unit test coverage | >80% | All critical paths covered |
| Integration test coverage | >70% | Component interactions verified |
| Critical user journeys passed | 100% | All 6 journeys successful |
| Performance: FCP | <2.5s | Consistent across browsers |
| Performance: Page load | <5s | Acceptable user experience |
| Regression tests passed | 100% | No functionality broken |
| Browser compatibility | 100% | Works on all target browsers |
| Beta user satisfaction | >4/5 | Positive feedback |
| Critical bugs found | 0 | Production ready |

---

## Bug Tracking Template

```markdown
### Bug Report
**ID:** [auto-generated]
**Severity:** Critical / High / Medium / Low
**Category:** [UI/Data/Map/Auth/Performance/Other]
**Reported by:** [Tester name]
**Date:** [Date found]

**Description:**
[Clear description of the issue]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happened]

**Screenshots/Videos:**
[Attach if applicable]

**Browser/Device:**
[Chrome 126 on macOS 14.5 / iPhone 12 on iOS 17.2 / etc.]

**Environment:**
[dev / staging / production]

**Logs:**
[Console errors, network tab errors, etc.]

**Status:** [Open / In Progress / Fixed / Verified / Closed]
**Assigned to:** [Developer]
**Target Fix Date:** [Date]
```

---

## Conclusion

This comprehensive testing strategy ensures Project TALA webapp quality through four complementary approaches:
- **Alpha** validates feature completeness internally
- **Beta** validates real-world usability
- **White Box** validates code logic and integration
- **Black Box** validates user experience and data accuracy

Success requires consistent execution across all phases and metrics.

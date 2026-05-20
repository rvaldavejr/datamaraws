/**
 * __tests__/black-box/user-journeys.spec.md
 * Black box end-to-end test scenarios
 * These tests can be executed manually or via Playwright/Cypress
 */

# Black Box Testing Scenarios

## Environment Setup
- **Base URL:** http://localhost:3000
- **Test Credentials:** admin / tala2026
- **Browser:** Chrome 126+ (desktop, mobile)
- **Network:** Simulated 4G (DevTools throttling)

---

## Journey 1: User Login & Authentication

### Prerequisites
- User not logged in (clear browser cookies)

### Test Steps
```
1. Open http://localhost:3000
   Expected: Redirect to http://localhost:3000/login
   Visual: Login page displays with username/password fields

2. Enter username "wrong_user" and password "tala2026"
   Click "Sign In" button
   Expected: Error message displays "Invalid credentials" or similar
   Stay on /login page

3. Enter username "admin" and password "wrong_pass"
   Click "Sign In" button
   Expected: Error message displays
   Stay on /login page

4. Enter username "admin" and password "tala2026"
   Click "Sign In" button
   Expected: Redirect to /dashboard
   Visual: Dashboard page loads with map visible

5. Refresh page (Ctrl+R)
   Expected: Remain on /dashboard (session persisted)
   No redirect to /login

6. Click "Sign out" button (top-right corner)
   Expected: Redirect to /login
   Session cleared
```

### Verification
✓ Invalid credentials blocked
✓ Valid credentials allowed
✓ Session persists across refresh
✓ Logout clears session

---

## Journey 2: Map Initialization & Data Loading

### Prerequisites
- Logged in to /dashboard

### Test Steps
```
1. Observe initial page load
   Expected: Loading animation appears
   Text shows: "Loading NNN prediction points" (NNN is a number)
   Progress bar visible and animating

2. Wait for page to fully load (max 10 seconds)
   Expected: Loading animation disappears
   Map displays with:
   - Base map with dark theme
   - Colored points scattered across Philippines
   - Red/orange points (poor areas) visible in certain regions
   - Cyan/blue points (wealthy areas) visible in metro areas
   - Navigation controls visible (top-right)
   - Legends visible (bottom-left): "Wealth Index" bar
   - User Manual link visible (bottom-left)

3. Verify legend colors
   Expected: Linear gradient from red → orange → blue → cyan
   Left label: "Poor"
   Right label: "Wealthy"

4. Verify map center and zoom
   Expected: Map shows Philippines (centered on central region)
   Can zoom out to see entire archipelago
   Can zoom in to individual municipalities

5. Check console for errors
   Expected: No red errors in Console tab
   May have some logs but no error stack traces
```

### Verification
✓ Data loads within 10 seconds
✓ Loading animation displays progress
✓ Map renders with visible points
✓ Color gradient matches legend
✓ No console errors

---

## Journey 3: Point Click → Area Selection

### Prerequisites
- Logged in to /dashboard
- Data fully loaded

### Test Steps
```
1. Locate a clearly visible point on the map (prefer metro area like NCR)

2. Click on the point
   Expected: 
   - Cyan boundary highlight appears around area
   - Side panel opens on right side
   - Side panel has "X" close button (top-right)

3. Observe side panel displays:
   Expected:
   - Area name (e.g., "Manila" or "NCR")
   - Province name
   - Statistics section:
     - Count of prediction points
     - Mean Wealth Index (WI)
     - Min/Max WI values
   - Chart visualization (if SHAP data available)
   - Points list or map showing selected points

4. Click "X" button to close side panel
   Expected:
   - Panel closes
   - Map returns to initial state (no highlights)
   - Boundary highlight disappears

5. Click on a different point
   Expected:
   - Previous highlight clears
   - New boundary highlights around new selection
   - Side panel updates with new area data
```

### Verification
✓ Point click triggers selection
✓ Boundary highlight appears
✓ Side panel shows correct data
✓ Close button works
✓ Selection switching works smoothly

---

## Journey 4: Search Bar Selection

### Prerequisites
- Logged in to /dashboard
- Data fully loaded

### Test Steps
```
1. Click on search bar (top-center area)
   Expected: Search input focused (cursor visible)

2. Type "Q" (single letter)
   Expected: 
   - Dropdown appears below search bar
   - Shows all provinces/municipalities starting with Q
   - Examples: "Quezon", "Quezon City", "Nueva Ecija", etc.

3. Type "ue" to make "Que"
   Expected:
   - Dropdown filters to show only "Quezon*" entries
   - Multiple matches shown (Quezon, Quezon City, etc.)

4. Click on "Quezon" in dropdown
   Expected:
   - Map zooms/pans to Quezon region
   - Cyan boundary highlight appears around Quezon
   - Side panel opens with Quezon statistics
   - Search bar value shows "Quezon"

5. Clear search box and type "Manila"
   Expected: Shows "City of Manila" and other Manila entries

6. Click "City of Manila"
   Expected:
   - Map zooms to Manila
   - Boundary highlights
   - Side panel updates
   - Wealth index for Manila displays
```

### Verification
✓ Search filtering works
✓ Dropdown appears with suggestions
✓ Selection from dropdown triggers map update
✓ Correct area data displays

---

## Journey 5: Map Navigation & Zoom

### Prerequisites
- Logged in to /dashboard

### Test Steps
```
1. Click and drag on map
   Expected: Map pans smoothly to new location
   No lag or stuttering

2. Scroll mouse wheel on map
   Expected: Map zooms in/out smoothly
   Zoom constraints enforced:
   - Cannot zoom out past full Philippines view
   - Cannot zoom in past maximum detail level

3. Double-click on map
   Expected: Map zooms in by 2 zoom levels
   Camera animates smoothly to clicked location

4. Click zoom-in button (top-right, + button)
   Expected: Map zooms in by 1 level
   Smooth animation

5. Click zoom-out button (top-right, - button)
   Expected: Map zooms out by 1 level
   Smooth animation

6. Click compass button (top-right)
   Expected: Map returns to north-up orientation
   Animation smooth

7. Verify minimum zoom maintains context
   Expected: When zoomed out fully, entire Philippines visible
   Minimum zoom ≈ 4

8. Verify maximum zoom shows detail
   Expected: When zoomed in fully, individual streets/buildings visible
   Maximum zoom ≈ 14
```

### Verification
✓ Pan works smoothly
✓ Zoom works smoothly
✓ Zoom constraints enforced
✓ Navigation controls responsive
✓ No performance lag

---

## Journey 6: Legend & Manual

### Prerequisites
- Logged in to /dashboard

### Test Steps
```
1. Observe bottom-left corner of map
   Expected: Two UI elements visible:
   - Wealth Index color legend (color bar)
   - User Manual link (question mark or book icon)

2. Click on User Manual link
   Expected:
   - New browser tab opens
   - PDF document loads: "Project-TALA-User-Manual.pdf"
   - PDF readable with project documentation

3. Close PDF tab, return to map

4. Hover over color legend
   Expected:
   - Tooltip or expanded view
   - Clear labeling: "Poor" on left, "Wealthy" on right
   - Color values correspond to Wealth Index scale
```

### Verification
✓ Legend visible and accurate
✓ User Manual link opens PDF
✓ PDF displays correctly

---

## Journey 7: Side Panel Data Export

### Prerequisites
- Logged in to /dashboard
- Area selected (side panel open)

### Test Steps
```
1. Locate "Export" or "Download" button in side panel
   Expected: Button clearly visible

2. Click export button
   Expected:
   - PDF generation starts
   - Download initiates
   - File saved to Downloads folder

3. Verify PDF filename
   Expected: Filename includes area name and date (e.g., "Manila_2025-05-20.pdf")

4. Open downloaded PDF
   Expected:
   - PDF opens in PDF viewer
   - Contains:
     - Area name and statistics
     - Wealth index visualization
     - Charts showing data
     - Date generated
   - Text readable
   - Images clear

5. Verify PDF data matches side panel
   Expected:
   - Mean WI value in PDF matches side panel display
   - Point count matches
   - Charts match side panel visualization
```

### Verification
✓ Export button functional
✓ PDF downloads successfully
✓ PDF contains correct data
✓ PDF formatting readable

---

## Journey 8: NCR Special Case

### Prerequisites
- Logged in to /dashboard
- Data fully loaded

### Test Steps
```
1. Search for "NCR" and select it
   Expected:
   - Special handling: All 4 NCR districts highlight
   - Side panel shows NCR combined statistics
   - Map shows cyan boundaries around all 4 districts

2. Click on individual NCR point
   Expected:
   - Individual municipality/district displays
   - Side panel shows granular data

3. Verify NCR cannot be selected as single province
   Expected:
   - NCR displays as districts, not single entity
   - Boundaries show all 4 divisions
```

### Verification
✓ NCR multi-district handling works
✓ Boundaries highlight correctly

---

## Edge Cases & Error Scenarios

### Scenario 1: Rapid Selection Changes
```
Steps:
1. Quickly click multiple points on map (5-10 rapid clicks)

Expected:
- Only final selection displays
- No race conditions or overlapping highlights
- Side panel shows only latest selection
- No console errors
```

### Scenario 2: Network Throttling
```
Steps:
1. Open DevTools → Network tab
2. Set throttling to "Slow 4G"
3. Reload page
4. Observe loading animation

Expected:
- Page loads (may take 15-30 seconds)
- Loading animation shows progress
- All functionality works after load
- No timeout errors
```

### Scenario 3: Mobile Responsiveness
```
Steps:
1. DevTools → Toggle device toolbar
2. Select iPhone 12 (390x844)
3. Test all interactions

Expected:
- Map fills screen (no white space)
- Side panel accessible (may overlay map)
- Search bar functional on mobile
- All buttons clickable (large enough)
- No horizontal scrolling
```

### Scenario 4: Missing Data
```
Prerequisites:
- Temporarily remove /public/data/points.json

Steps:
1. Reload page
2. Observe behavior

Expected:
- Loading animation displays
- After timeout, error message shows (or graceful degradation)
- Application doesn't crash
- Console shows error details
```

### Scenario 5: Logout & Re-auth
```
Steps:
1. Click Sign out
2. Verify redirect to /login
3. Try accessing /dashboard directly via URL
4. Verify redirect back to /login
5. Login again
6. Verify dashboard accessible
```

---

## Performance Metrics (Black Box Perspective)

### Measure with Browser DevTools

**Page Load Metrics:**
```
Target: < 5 seconds total
Metrics to check:
- First Contentful Paint (FCP): < 2.5s
- Largest Contentful Paint (LCP): < 4s
- Time to Interactive (TTI): < 5s
```

**Action Responsiveness:**
```
- Map pan: Immediate visual feedback (<200ms)
- Map zoom: Smooth animation (no stuttering)
- Point click: Side panel opens within <500ms
- Search: Results appear within <500ms
- PDF export: Download starts within <2s, completes within <10s
```

**Network Tab Analysis:**
```
- Check total bundle size (target: <5MB)
- Verify GeoJSON files load (check /geodata files)
- Verify data JSON files load
- Check for failed requests
```

---

## Accessibility Checks (Manual)

### Keyboard Navigation
```
Steps:
1. Press Tab repeatedly
2. Verify all interactive elements reachable
3. Verify focus indicators visible (blue outline typically)

Expected:
- Can reach: Login form, buttons, search, map
- Can activate buttons with Enter
- Can close panel with Escape
```

### Color Contrast
```
Steps:
1. DevTools → Lighthouse
2. Run Accessibility audit

Expected:
- No low contrast warnings
- WCAG AA compliance (4.5:1 minimum)
```

### Screen Reader (if available)
```
Tools: NVDA (Windows), VoiceOver (Mac), JAWS

Expected:
- Page structure readable
- Map alt text present
- Buttons/links have text labels
```

---

## Data Accuracy Verification

### Spot Check: Point Locations
```
Steps:
1. Select Quezon province
2. Note displayed point coordinates
3. Verify on Google Maps if coordinates seem reasonable

Expected:
- Points within Quezon boundaries
- Coordinates make geographic sense
```

### Spot Check: Statistics
```
Steps:
1. Select a municipality
2. Note Mean WI displayed
3. Manually spot-check: does value seem reasonable?
   (Should be between Min and Max)

Expected:
- Mean value between Min and Max
- Count > 0
- Values not extreme outliers
```

### Spot Check: Wealth Index Colors
```
Steps:
1. Observe point colors on map
2. Verify correspondence to wealth index:
   - Red/orange points = poor (negative WI)
   - Cyan points = wealthy (positive WI)

Expected:
- Color gradient logical
- No reversed colors
- Metro areas show more cyan/blue
- Rural areas show more red/orange
```

---

## Browser Compatibility Matrix

| Browser | Version | Desktop | Mobile | Status |
|---------|---------|---------|--------|--------|
| Chrome | 126+ | ✓ Test | ✓ Test | Critical |
| Safari | 17+ | ✓ Test | ✓ Test | Important |
| Firefox | 126+ | ✓ Test | N/A | Important |
| Edge | 126+ | ✓ Test | N/A | Important |

**Expected Results for All:**
- All features functional
- Consistent rendering
- No console errors
- Performance acceptable

---

## Sign-Off Checklist

Before production release:

```
Authentication
☐ Login works with correct credentials
☐ Login blocks incorrect credentials
☐ Logout clears session
☐ Protected routes enforce auth

Data & Map
☐ Data loads within 10 seconds
☐ All points visible on map
☐ Colors match legend
☐ Boundaries highlight correctly
☐ NCR displays as 4 districts

User Interactions
☐ Point click selects area
☐ Search finds areas
☐ Side panel displays data
☐ PDF export works
☐ Map navigation smooth

Performance
☐ Page load < 5 seconds
☐ Interactions responsive
☐ No lag or stuttering
☐ Mobile responsive

Data Quality
☐ Coordinates within Philippines
☐ Wealth index -2.5 to 2.0
☐ Statistics calculations correct
☐ Boundaries accurate

User Experience
☐ UI intuitive
☐ All text readable
☐ Professional appearance
☐ Documentation available

Stakeholder Approval
☐ Product Owner sign-off
☐ Technical Lead sign-off
☐ Researcher sign-off
☐ Ready for production deployment
```

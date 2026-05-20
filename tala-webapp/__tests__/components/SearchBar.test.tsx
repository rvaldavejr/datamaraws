/**
 * __tests__/components/SearchBar.test.tsx
 * White-box unit tests for src/components/SearchBar.tsx
 *
 * Covers the search-index building logic (useMemo), the query filtering
 * algorithm (case-insensitive label + sublabel match, 8-item cap), the
 * dropdown open/close state machine, and the onSelect callback contract.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import SearchBar from '@/components/SearchBar'
import type { ProvinceData, MunicipalityData } from '@/types'

// lucide-react renders SVGs fine in jsdom, but avoid ESM resolution issues
jest.mock('lucide-react', () => ({
  Search: () => null,
  X: (props: any) => <span data-testid="clear-icon" />,
}))

// ── Fixture factories ─────────────────────────────────────────────────────────

const makeProvince = (name: string, region = 'Region I'): ProvinceData => ({
  name,
  region,
  n_points: 10,
  n_municipalities: 2,
  mean_wi: 0,
  median_wi: 0,
  min_wi: -1,
  max_wi: 1,
  std_wi: 0.3,
  pct_low: 0.3,
  pct_mid: 0.4,
  pct_high: 0.3,
  poverty_rate: null,
  osm_mean: {} as any,
  municipalities: [],
})

const makeMuni = (municipality: string, province: string, region = 'Region I'): MunicipalityData => ({
  municipality,
  province,
  region,
  n_points: 5,
  mean_wi: 0,
  median_wi: 0,
  min_wi: -1,
  max_wi: 1,
  sdt_wi: 0.2,
  pct_low: 0.3,
  pct_high: 0.3,
  osm_mean: {} as any,
  point_ids: [],
})

// ── Shared test data ──────────────────────────────────────────────────────────

const provinces = {
  NCR: makeProvince('NCR', 'NCR'),
  Quezon: makeProvince('Quezon', 'Calabarzon'),
  Laguna: makeProvince('Laguna', 'Calabarzon'),
}

const municipalities = {
  'NCR|Manila': makeMuni('Manila', 'NCR'),
  'NCR|Pasig': makeMuni('Pasig', 'NCR'),
  'Quezon|Lucena': makeMuni('Lucena', 'Quezon'),
  'Laguna|San Pedro': makeMuni('San Pedro', 'Laguna'),
}

const noop = jest.fn()

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SearchBar', () => {
  describe('initial render', () => {
    it('renders the text input with a placeholder', () => {
      render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      expect(
        screen.getByPlaceholderText(/search province or municipality/i)
      ).toBeInTheDocument()
    })

    it('does not show any results when the query is empty', () => {
      render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      expect(screen.queryByText('NCR')).not.toBeInTheDocument()
      expect(screen.queryByText('Manila')).not.toBeInTheDocument()
    })

    it('input starts with an empty value', () => {
      render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      expect(screen.getByPlaceholderText(/search/i)).toHaveValue('')
    })
  })

  describe('filtering algorithm', () => {
    it('shows results matching the label (province name)', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'NCR')
      expect(screen.getByText('NCR')).toBeInTheDocument()
    })

    it('is case-insensitive for label matches', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'ncr')
      expect(screen.getByText('NCR')).toBeInTheDocument()
    })

    it('is case-insensitive for municipality label matches', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'manila')
      expect(screen.getByText('Manila')).toBeInTheDocument()
    })

    it('matches on sublabel text (region name in province sublabel)', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Calabarzon')
      expect(screen.getByText('Quezon')).toBeInTheDocument()
      expect(screen.getByText('Laguna')).toBeInTheDocument()
    })

    it('matches on sublabel text (province name in municipality sublabel)', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'NCR')
      expect(screen.getByText('Manila')).toBeInTheDocument()
      expect(screen.getByText('Pasig')).toBeInTheDocument()
    })

    it('returns no results for a whitespace-only query', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), '   ')
      expect(screen.queryByText('NCR')).not.toBeInTheDocument()
    })

    it('returns no results for a query that matches nothing', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'zzznomatch')
      expect(screen.queryByRole('button', { name: /ncr|manila|quezon|lucena/i })).not.toBeInTheDocument()
    })

    it('caps results at 8 items', async () => {
      const many: Record<string, ProvinceData> = {}
      for (let i = 0; i < 15; i++) {
        many[`Province${i}`] = makeProvince(`Province${i}`, 'SomeRegion')
      }
      const user = userEvent.setup()
      const { container } = render(<SearchBar provinces={many} municipalities={{}} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'province')
      const dropdown = container.querySelector('.absolute.top-full')
      const resultButtons = dropdown?.querySelectorAll('button') ?? []
      expect(resultButtons.length).toBeLessThanOrEqual(8)
    })
  })

  describe('search index building', () => {
    it('uses the province map key as the result label', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={{ NCR: makeProvince('NCR', 'NCR') }} municipalities={{}} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'NCR')
      expect(screen.getByText('NCR')).toBeInTheDocument()
    })

    it('formats the province sublabel as "Province · <region>"', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={{ Quezon: makeProvince('Quezon', 'Calabarzon') }} municipalities={{}} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Quezon')
      expect(screen.getByText('Province · Calabarzon')).toBeInTheDocument()
    })

    it('uses data.municipality as the result label (not the compound map key)', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={{}} municipalities={{ 'NCR|Manila': makeMuni('Manila', 'NCR') }} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Manila')
      expect(screen.getByText('Manila')).toBeInTheDocument()
      expect(screen.queryByText('NCR|Manila')).not.toBeInTheDocument()
    })

    it('formats the municipality sublabel as "Municipality · <province>"', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={{}} municipalities={{ 'NCR|Manila': makeMuni('Manila', 'NCR') }} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Manila')
      expect(screen.getByText('Municipality · NCR')).toBeInTheDocument()
    })

    it('indexes both provinces and municipalities together', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={{ NCR: makeProvince('NCR', 'NCR') }} municipalities={{ 'NCR|Manila': makeMuni('Manila', 'NCR') }} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'NCR')
      expect(screen.getByText('NCR')).toBeInTheDocument()
      expect(screen.getByText('Manila')).toBeInTheDocument()
    })
  })

  describe('onSelect callback', () => {
    it('calls onSelect with type "province" and the province name as key', async () => {
      const onSelect = jest.fn()
      const user = userEvent.setup()
      render(<SearchBar provinces={{ NCR: makeProvince('NCR', 'NCR') }} municipalities={{}} onSelect={onSelect} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'NCR')
      await user.click(screen.getByText('NCR'))
      expect(onSelect).toHaveBeenCalledWith('province', 'NCR')
    })

    it('calls onSelect with type "municipality" and the full compound key', async () => {
      const onSelect = jest.fn()
      const user = userEvent.setup()
      render(<SearchBar provinces={{}} municipalities={{ 'NCR|Manila': makeMuni('Manila', 'NCR') }} onSelect={onSelect} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Manila')
      await user.click(screen.getByText('Manila'))
      expect(onSelect).toHaveBeenCalledWith('municipality', 'NCR|Manila')
    })

    it('clears the input after selection', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={{ NCR: makeProvince('NCR', 'NCR') }} municipalities={{}} onSelect={noop} />)
      const input = screen.getByPlaceholderText(/search/i)
      await user.type(input, 'NCR')
      await user.click(screen.getByText('NCR'))
      expect(input).toHaveValue('')
    })

    it('closes the dropdown after selection', async () => {
      const user = userEvent.setup()
      render(<SearchBar provinces={{ NCR: makeProvince('NCR', 'NCR') }} municipalities={{}} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'NCR')
      expect(screen.getByText('Province · NCR')).toBeInTheDocument()
      await user.click(screen.getByText('NCR'))
      expect(screen.queryByText('Province · NCR')).not.toBeInTheDocument()
    })

    it('calls onSelect exactly once per click', async () => {
      const onSelect = jest.fn()
      const user = userEvent.setup()
      render(<SearchBar provinces={{ NCR: makeProvince('NCR', 'NCR') }} municipalities={{}} onSelect={onSelect} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'NCR')
      await user.click(screen.getByText('NCR'))
      expect(onSelect).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear button', () => {
    it('appears only when there is a query', async () => {
      const user = userEvent.setup()
      const { container } = render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      expect(container.querySelector('[data-testid="clear-icon"]')).not.toBeInTheDocument()
      await user.type(screen.getByPlaceholderText(/search/i), 'n')
      expect(container.querySelector('[data-testid="clear-icon"]')).toBeInTheDocument()
    })

    it('clears the input when clicked', async () => {
      const user = userEvent.setup()
      const { container } = render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      const input = screen.getByPlaceholderText(/search/i)
      await user.type(input, 'NCR')
      // The clear button is the only button outside the dropdown
      const dropdown = container.querySelector('.absolute.top-full')
      const allButtons = screen.getAllByRole('button')
      const dropdownButtons = Array.from(dropdown?.querySelectorAll('button') ?? [])
      const clearBtn = allButtons.find(b => !dropdownButtons.includes(b))!
      await user.click(clearBtn)
      expect(input).toHaveValue('')
    })

    it('closes the dropdown when clicked', async () => {
      const user = userEvent.setup()
      const { container } = render(<SearchBar provinces={provinces} municipalities={municipalities} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'NCR')
      expect(container.querySelector('.absolute.top-full')).toBeInTheDocument()
      const dropdown = container.querySelector('.absolute.top-full')
      const allButtons = screen.getAllByRole('button')
      const dropdownButtons = Array.from(dropdown?.querySelectorAll('button') ?? [])
      const clearBtn = allButtons.find(b => !dropdownButtons.includes(b))!
      await user.click(clearBtn)
      expect(container.querySelector('.absolute.top-full')).not.toBeInTheDocument()
    })
  })

  describe('visual type indicators', () => {
    it('renders a red dot for province results', async () => {
      const user = userEvent.setup()
      const { container } = render(<SearchBar provinces={{ NCR: makeProvince('NCR', 'NCR') }} municipalities={{}} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'NCR')
      expect(container.querySelector('.bg-red-500')).toBeInTheDocument()
    })

    it('renders a yellow dot for municipality results', async () => {
      const user = userEvent.setup()
      const { container } = render(<SearchBar provinces={{}} municipalities={{ 'NCR|Manila': makeMuni('Manila', 'NCR') }} onSelect={noop} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Manila')
      expect(container.querySelector('.bg-yellow-500')).toBeInTheDocument()
    })
  })
})

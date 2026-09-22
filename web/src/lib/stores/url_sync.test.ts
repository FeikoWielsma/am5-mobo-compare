import { describe, it, expect, vi, beforeEach } from 'vitest';
import { serializeUrlParams, deserializeUrlParams, syncStateToUrl, type UrlSyncState } from './url_sync';

describe('url_sync store utilities', () => {
  it('serializes complete filter, range, sort, dynamic columns, and compare state', () => {
    const state: UrlSyncState = {
      search: 'taichi',
      filters: {
        brand: ['ASRock', 'MSI'],
        chipset: new Set(['X870E'])
      },
      rangeFilters: {
        price: { min: 200, max: 500 },
        m2: { min: 4, max: null }
      },
      quickFilters: {
        wifi7: true,
        colorTheme: 'stealth'
      },
      dynamicColumns: ['Expansion|Storage|PCIe Storage|Total M.2', 'Power|VRM configuration|Phase config'],
      sort: { column: 'price_usd', direction: 'desc' },
      compare: ['board-1', 'board-2']
    };

    const params = serializeUrlParams(state);
    expect(params.get('q')).toBe('taichi');
    expect(params.get('brand')).toBe('ASRock,MSI');
    expect(params.get('chipset')).toBe('X870E');
    expect(params.get('price_min')).toBe('200');
    expect(params.get('price_max')).toBe('500');
    expect(params.get('m2_min')).toBe('4');
    expect(params.get('wifi7')).toBe('1');
    expect(params.get('colorTheme')).toBe('stealth');
    expect(params.get('cols')).toBe('Expansion|Storage|PCIe Storage|Total M.2;Power|VRM configuration|Phase config');
    expect(params.get('sort')).toBe('price_usd');
    expect(params.get('dir')).toBe('desc');
    expect(params.get('compare')).toBe('board-1,board-2');
  });

  it('deserializes complete URL search query parameters into structured state', () => {
    const query = '?q=taichi&brand=ASRock,MSI&chipset=X870E&price_min=200&price_max=500&m2_min=4&wifi7=1&colorTheme=stealth&cols=Expansion|Storage|PCIe Storage|Total M.2;Power|VRM configuration|Phase config&sort=price_usd&dir=desc&compare=board-1,board-2';
    const state = deserializeUrlParams(query);

    expect(state.search).toBe('taichi');
    expect(state.filters?.brand).toEqual(['ASRock', 'MSI']);
    expect(state.filters?.chipset).toEqual(['X870E']);
    expect(state.rangeFilters?.price).toEqual({ min: 200, max: 500 });
    expect(state.rangeFilters?.m2).toEqual({ min: 4, max: null });
    expect(state.quickFilters?.wifi7).toBe(true);
    expect(state.quickFilters?.colorTheme).toBe('stealth');
    expect(state.dynamicColumns).toEqual([
      'Expansion|Storage|PCIe Storage|Total M.2',
      'Power|VRM configuration|Phase config'
    ]);
    expect(state.sort).toEqual({ column: 'price_usd', direction: 'desc' });
    expect(state.compare).toEqual(['board-1', 'board-2']);
  });

  it('handles empty / omitted fields gracefully during serialization and deserialization', () => {
    const emptyState: UrlSyncState = {};
    const params = serializeUrlParams(emptyState);
    expect(params.toString()).toBe('');

    const deserialized = deserializeUrlParams('');
    expect(deserialized.search).toBeUndefined();
    expect(deserialized.filters).toEqual({});
    expect(deserialized.rangeFilters).toEqual({});
    expect(deserialized.dynamicColumns).toEqual([]);
    expect(deserialized.compare).toEqual([]);
  });

  it('syncStateToUrl handles non-window or navigation gracefully', async () => {
    await expect(syncStateToUrl({ search: 'test' })).resolves.toBeUndefined();
  });
});

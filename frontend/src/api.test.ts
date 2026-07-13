import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  askLocation,
  fetchActivePromos,
  fetchLocations,
  fetchPackages,
  fetchRooms,
  setPackageActive,
  setPromoActive,
} from './api';
import type {
  AskResponse,
  LocationSummary,
  ResolvedPackage,
  ResolvedPromo,
  Resource,
} from './types';

function stubFetchJson(data: unknown): ReturnType<typeof vi.fn> {
  const response = {
    ok: true,
    status: 200,
    json: async () => data,
  } as unknown as Response;
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubFetchStatus(status: number): ReturnType<typeof vi.fn> {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  } as unknown as Response;
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubFetchMalformed(): ReturnType<typeof vi.fn> {
  const response = {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    },
  } as unknown as Response;
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubFetchNetworkError(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchLocations', () => {
  it('requests the relative locations path', async () => {
    const locations: LocationSummary[] = [
      { id: 1, name: 'Downtown Studio', city: 'Springfield' },
    ];
    const fetchMock = stubFetchJson(locations);
    await expect(fetchLocations()).resolves.toEqual(locations);
    expect(fetchMock).toHaveBeenCalledWith('/locations');
  });
});

describe('fetchPackages', () => {
  it('requests the packages path for the location', async () => {
    const packages: ResolvedPackage[] = [
      { id: 7, name: 'Gold', description: null, price_cents: 12000, is_active: true },
    ];
    const fetchMock = stubFetchJson(packages);
    await expect(fetchPackages(3)).resolves.toEqual(packages);
    expect(fetchMock).toHaveBeenCalledWith('/locations/3/packages');
  });

  it('rejects an invalid locationId without calling fetch', async () => {
    const fetchMock = stubFetchJson([]);
    await expect(fetchPackages(0)).rejects.toThrow(/locationId/);
    await expect(fetchPackages(-2)).rejects.toThrow(/locationId/);
    await expect(fetchPackages(1.5)).rejects.toThrow(/locationId/);
    await expect(fetchPackages(Number.NaN)).rejects.toThrow(/locationId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchActivePromos', () => {
  it('requests the active promos path for the location', async () => {
    const promos: ResolvedPromo[] = [
      {
        id: 4,
        code: 'SAVE10',
        description: null,
        discount_percent: 10,
        starts_on: '2026-07-01',
        ends_on: '2026-07-31',
      },
    ];
    const fetchMock = stubFetchJson(promos);
    await expect(fetchActivePromos(3)).resolves.toEqual(promos);
    expect(fetchMock).toHaveBeenCalledWith('/locations/3/promos/active');
  });

  it('rejects an invalid locationId without calling fetch', async () => {
    const fetchMock = stubFetchJson([]);
    await expect(fetchActivePromos(0)).rejects.toThrow(/locationId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchRooms', () => {
  it('requests the rooms path with the group_size query', async () => {
    const rooms: Resource[] = [{ id: 9, name: 'Grand Hall', capacity: 40, size_tier_id: 2 }];
    const fetchMock = stubFetchJson(rooms);
    await expect(fetchRooms(3, 12)).resolves.toEqual(rooms);
    expect(fetchMock).toHaveBeenCalledWith('/locations/3/rooms?group_size=12');
  });

  it('rejects an invalid groupSize without calling fetch', async () => {
    const fetchMock = stubFetchJson([]);
    await expect(fetchRooms(3, 0)).rejects.toThrow(/groupSize/);
    await expect(fetchRooms(3, -1)).rejects.toThrow(/groupSize/);
    await expect(fetchRooms(3, 2.5)).rejects.toThrow(/groupSize/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid locationId without calling fetch', async () => {
    const fetchMock = stubFetchJson([]);
    await expect(fetchRooms(0, 4)).rejects.toThrow(/locationId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('askLocation', () => {
  it('posts the question as JSON to the ask path', async () => {
    const answer: AskResponse = { answer: 'We have three packages.' };
    const fetchMock = stubFetchJson(answer);
    await expect(askLocation(3, 'What packages do you offer?')).resolves.toEqual(answer);
    expect(fetchMock).toHaveBeenCalledWith('/locations/3/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What packages do you offer?' }),
    });
  });

  it('rejects an empty question without calling fetch', async () => {
    const fetchMock = stubFetchJson({ answer: '' });
    await expect(askLocation(3, '   ')).rejects.toThrow(/question/);
    await expect(askLocation(3, '')).rejects.toThrow(/question/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid locationId without calling fetch', async () => {
    const fetchMock = stubFetchJson({ answer: '' });
    await expect(askLocation(0, 'hello')).rejects.toThrow(/locationId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('setPackageActive', () => {
  it('sends a PATCH with the is_active body to the package active path', async () => {
    const fetchMock = stubFetchJson({ success: true });
    await expect(setPackageActive(3, 7, false)).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith('/locations/3/packages/7/active', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
  });

  it('rejects invalid toggle input without calling fetch', async () => {
    const fetchMock = stubFetchJson({ success: true });
    await expect(setPackageActive(0, 7, true)).rejects.toThrow(/locationId/);
    await expect(setPackageActive(3, 0, true)).rejects.toThrow(/packageId/);
    await expect(setPackageActive(3, -1, true)).rejects.toThrow(/packageId/);
    await expect(setPackageActive(3, 1.5, true)).rejects.toThrow(/packageId/);
    await expect(setPackageActive(3, Number.NaN, true)).rejects.toThrow(/packageId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('setPromoActive', () => {
  it('sends a PATCH with the is_active body to the promo active path', async () => {
    const fetchMock = stubFetchJson({ success: true });
    await expect(setPromoActive(3, 8, true)).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith('/locations/3/promos/8/active', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    });
  });

  it('rejects invalid toggle input without calling fetch', async () => {
    const fetchMock = stubFetchJson({ success: true });
    await expect(setPromoActive(0, 8, true)).rejects.toThrow(/locationId/);
    await expect(setPromoActive(3, 0, true)).rejects.toThrow(/promoId/);
    await expect(setPromoActive(3, -1, true)).rejects.toThrow(/promoId/);
    await expect(setPromoActive(3, 1.5, true)).rejects.toThrow(/promoId/);
    await expect(setPromoActive(3, Number.NaN, true)).rejects.toThrow(/promoId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('demo flow requests', () => {
  const SAN_FRANCISCO_ID = 13;
  const ULTIMATE_COMBO_ID = 1003;
  const SUMMER_PROMO_ID = 3001;

  function stubDemoFetch(): ReturnType<typeof vi.fn> {
    const activePackages: ResolvedPackage[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      let data: unknown = {};
      if (path.endsWith('/active')) {
        const body = typeof init?.body === 'string' ? String(init.body) : '';
        if (body.includes('true')) {
          activePackages.push({
            id: ULTIMATE_COMBO_ID,
            name: 'Ultimate Combo',
            description: 'Ultimate party combo',
            price_cents: 45000,
            is_active: true,
          });
        }
        data = { success: true };
      } else if (path.endsWith('/packages')) {
        data = activePackages;
      } else if (path.endsWith('/ask')) {
        data = { answer: 'Available party packages: Ultimate Combo ($450.00).' };
      }
      const response = {
        ok: true,
        status: 200,
        json: async () => data,
      } as unknown as Response;
      return Promise.resolve(response);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('activates the Ultimate Combo package and reloads San Francisco packages', async () => {
    const fetchMock = stubDemoFetch();
    await expect(
      setPackageActive(SAN_FRANCISCO_ID, ULTIMATE_COMBO_ID, true),
    ).resolves.toEqual({ success: true });
    await expect(fetchPackages(SAN_FRANCISCO_ID)).resolves.toEqual([
      {
        id: ULTIMATE_COMBO_ID,
        name: 'Ultimate Combo',
        description: 'Ultimate party combo',
        price_cents: 45000,
        is_active: true,
      },
    ]);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      `/locations/${SAN_FRANCISCO_ID}/packages/${ULTIMATE_COMBO_ID}/active`,
      `/locations/${SAN_FRANCISCO_ID}/packages`,
    ]);
  });

  it('asks San Francisco a question after the package toggle', async () => {
    const fetchMock = stubDemoFetch();
    await setPackageActive(SAN_FRANCISCO_ID, ULTIMATE_COMBO_ID, true);
    await expect(
      askLocation(SAN_FRANCISCO_ID, 'What party packages do you offer?'),
    ).resolves.toEqual({
      answer: 'Available party packages: Ultimate Combo ($450.00).',
    });
    expect(fetchMock).toHaveBeenLastCalledWith(`/locations/${SAN_FRANCISCO_ID}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What party packages do you offer?' }),
    });
  });

  it('deactivates and reactivates the summer promo for San Francisco', async () => {
    const fetchMock = stubFetchJson({ success: true });
    await expect(
      setPromoActive(SAN_FRANCISCO_ID, SUMMER_PROMO_ID, false),
    ).resolves.toEqual({ success: true });
    await expect(
      setPromoActive(SAN_FRANCISCO_ID, SUMMER_PROMO_ID, true),
    ).resolves.toEqual({ success: true });
    const bodies = fetchMock.mock.calls.map((call) => (call[1] as RequestInit).body);
    expect(bodies).toEqual([
      JSON.stringify({ is_active: false }),
      JSON.stringify({ is_active: true }),
    ]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/locations/${SAN_FRANCISCO_ID}/promos/${SUMMER_PROMO_ID}/active`,
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

describe('shared request handling', () => {
  it('rejects on a non-2xx response', async () => {
    stubFetchStatus(500);
    await expect(fetchLocations()).rejects.toThrow(/500/);
  });

  it('rejects on malformed JSON', async () => {
    stubFetchMalformed();
    await expect(fetchLocations()).rejects.toThrow(/malformed JSON/);
  });

  it('does not swallow fetch network errors', async () => {
    stubFetchNetworkError();
    await expect(fetchLocations()).rejects.toThrow('network down');
  });
});

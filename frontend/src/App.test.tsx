import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as api from './api';
import type {
  ActiveUpdateResponse,
  AskResponse,
  Location,
  ResolvedPackage,
  ResolvedPromo,
  Resource,
} from './types';

const sampleLocations: Location[] = [
  { id: 1, name: 'Downtown Studio', city: 'Springfield' },
  { id: 2, name: 'Riverside Hall', city: 'Portland' },
];

const samplePackages: ResolvedPackage[] = [
  {
    id: 10,
    name: 'Gold Party',
    description: 'Great for big groups',
    price_cents: 12000,
    is_active: true,
  },
  { id: 11, name: 'Silver Party', description: null, price_cents: 8000, is_active: true },
];

const samplePromos: ResolvedPromo[] = [
  {
    id: 20,
    code: 'SAVE10',
    description: 'Ten percent off',
    discount_percent: 10,
    starts_on: '2026-07-01',
    ends_on: '2026-07-31',
  },
];

const sampleRooms: Resource[] = [
  { id: 30, name: 'Grand Hall', capacity: 40, size_tier_id: 3 },
];

interface FetchHandlers {
  locations?: Location[];
  packages?: ResolvedPackage[];
  promos?: ResolvedPromo[];
  rooms?: Resource[];
}

function stubFetch(handlers: FetchHandlers): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const path = String(input);
    let data: unknown = [];
    if (path === '/locations') {
      data = handlers.locations ?? [];
    } else if (path.endsWith('/packages')) {
      data = handlers.packages ?? [];
    } else if (path.endsWith('/promos/active')) {
      data = handlers.promos ?? [];
    } else if (path.includes('/rooms?')) {
      data = handlers.rooms ?? [];
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

function stubFetchRejected(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function dashboardPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter(
      (path) =>
        path.endsWith('/packages') ||
        path.endsWith('/promos/active') ||
        path.includes('/rooms?'),
    );
}

async function selectDowntown(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /downtown studio/i }));
}

async function selectRiverside(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /riverside hall/i }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('renders the app title', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /ic manager/i }),
    ).toBeInTheDocument();
    await screen.findByRole('button', { name: /downtown studio/i });
  });

  it('fetches locations from the relative path on load', async () => {
    const fetchMock = stubFetch({ locations: sampleLocations });
    render(<App />);
    await screen.findByRole('button', { name: /downtown studio/i });
    expect(fetchMock).toHaveBeenCalledWith('/locations');
  });

  it('shows the loading state first', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    expect(screen.getByText(/loading locations/i)).toBeInTheDocument();
    await screen.findByRole('button', { name: /downtown studio/i });
  });

  it('shows the error state when the request fails', async () => {
    stubFetchRejected();
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not load locations/i,
    );
  });

  it('shows the empty state when no locations are returned', async () => {
    stubFetch({ locations: [] });
    render(<App />);
    expect(await screen.findByText(/no locations found/i)).toBeInTheDocument();
  });

  it('shows the returned locations by name and city', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    expect(
      await screen.findByRole('button', { name: /downtown studio.*springfield/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /riverside hall.*portland/i }),
    ).toBeInTheDocument();
  });

  it('selects a location when clicked', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    const option = await screen.findByRole('button', { name: /downtown studio/i });
    expect(option).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(option);
    expect(option).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the select-location instruction before selection', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    await screen.findByRole('button', { name: /downtown studio/i });
    expect(screen.getByText(/select a location/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /location dashboard/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the dashboard header after selecting a location', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    await selectRiverside();
    expect(
      screen.getByRole('region', { name: /location dashboard/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/select a location/i)).not.toBeInTheDocument();
  });

  it('includes the selected location name in the dashboard header', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    await selectRiverside();
    const dashboard = screen.getByRole('region', { name: /location dashboard/i });
    expect(within(dashboard).getByRole('heading', { level: 2 })).toHaveTextContent(
      /riverside hall/i,
    );
  });

  it('includes the selected location city in the dashboard header', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    await selectRiverside();
    const dashboard = screen.getByRole('region', { name: /location dashboard/i });
    expect(within(dashboard).getByText(/portland/i)).toBeInTheDocument();
  });

  it('renders the Party Packages section', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    await selectDowntown();
    expect(
      await screen.findByRole('heading', { name: /party packages/i }),
    ).toBeInTheDocument();
  });

  it('renders the Active Promos section', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    await selectDowntown();
    expect(
      await screen.findByRole('heading', { name: /active promos/i }),
    ).toBeInTheDocument();
  });

  it('renders the Rooms for Group Size section', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    await selectDowntown();
    expect(
      await screen.findByRole('heading', { name: /rooms for group size/i }),
    ).toBeInTheDocument();
  });

  it('renders the Ask IC section', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    await selectDowntown();
    expect(
      await screen.findByRole('heading', { name: /ask ic/i }),
    ).toBeInTheDocument();
  });

  it('loads packages, promos, and rooms after selecting a location', async () => {
    const fetchMock = stubFetch({ locations: sampleLocations });
    render(<App />);
    await selectDowntown();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/locations/1/packages'),
    );
    expect(fetchMock).toHaveBeenCalledWith('/locations/1/promos/active');
    expect(fetchMock).toHaveBeenCalledWith('/locations/1/rooms?group_size=20');
  });
});

describe('App packages panel', () => {
  it('displays the package name and description when present', async () => {
    stubFetch({ locations: sampleLocations, packages: samplePackages });
    render(<App />);
    await selectDowntown();
    expect(await screen.findByText(/gold party/i)).toBeInTheDocument();
    expect(screen.getByText(/great for big groups/i)).toBeInTheDocument();
  });

  it('omits the description when it is absent', async () => {
    stubFetch({ locations: sampleLocations, packages: samplePackages });
    render(<App />);
    await selectDowntown();
    await screen.findByText(/silver party/i);
    expect(screen.queryByText(/^null$/)).toBeNull();
  });

  it('formats the package price as dollars', async () => {
    stubFetch({ locations: sampleLocations, packages: samplePackages });
    render(<App />);
    await selectDowntown();
    expect(await screen.findByText('$120.00')).toBeInTheDocument();
    expect(screen.getByText('$80.00')).toBeInTheDocument();
  });

  it('shows the package active status', async () => {
    stubFetch({ locations: sampleLocations, packages: samplePackages });
    render(<App />);
    await selectDowntown();
    await screen.findByText(/gold party/i);
    const region = screen.getByRole('region', { name: /party packages/i });
    expect(within(region).getAllByText(/^active$/i).length).toBeGreaterThan(0);
  });

  it('shows an empty state when there are no packages', async () => {
    stubFetch({ locations: sampleLocations, packages: [] });
    render(<App />);
    await selectDowntown();
    expect(
      await screen.findByText(/no packages available/i),
    ).toBeInTheDocument();
  });

  it('shows an error state when packages fail to load', async () => {
    stubFetch({ locations: sampleLocations });
    vi.spyOn(api, 'fetchPackages').mockRejectedValue(new Error('boom'));
    render(<App />);
    await selectDowntown();
    expect(
      await screen.findByText(/could not load packages/i),
    ).toBeInTheDocument();
  });
});

describe('App promos panel', () => {
  it('displays the promo name and description', async () => {
    stubFetch({ locations: sampleLocations, promos: samplePromos });
    render(<App />);
    await selectDowntown();
    expect(await screen.findByText(/save10/i)).toBeInTheDocument();
    expect(screen.getByText(/ten percent off/i)).toBeInTheDocument();
  });

  it('displays the promo start and end dates', async () => {
    stubFetch({ locations: sampleLocations, promos: samplePromos });
    render(<App />);
    await selectDowntown();
    expect(await screen.findByText(/2026-07-01/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-31/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no active promos', async () => {
    stubFetch({ locations: sampleLocations, promos: [] });
    render(<App />);
    await selectDowntown();
    expect(await screen.findByText(/no active promos/i)).toBeInTheDocument();
  });
});

describe('App rooms panel', () => {
  it('defaults the group size to 20', async () => {
    const fetchMock = stubFetch({ locations: sampleLocations, rooms: sampleRooms });
    render(<App />);
    await selectDowntown();
    expect(await screen.findByLabelText('Group size')).toHaveValue(20);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/locations/1/rooms?group_size=20'),
    );
  });

  it('displays the room name, size tier, and capacity', async () => {
    stubFetch({ locations: sampleLocations, rooms: sampleRooms });
    render(<App />);
    await selectDowntown();
    expect(await screen.findByText(/grand hall/i)).toBeInTheDocument();
    expect(screen.getByText(/size tier 3/i)).toBeInTheDocument();
    expect(screen.getByText(/capacity 40/i)).toBeInTheDocument();
  });

  it('reloads rooms when the group size changes to a valid value', async () => {
    const fetchMock = stubFetch({ locations: sampleLocations, rooms: sampleRooms });
    render(<App />);
    await selectDowntown();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/locations/1/rooms?group_size=20'),
    );
    fireEvent.change(screen.getByLabelText('Group size'), {
      target: { value: '30' },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/locations/1/rooms?group_size=30'),
    );
  });

  it('shows a validation error for an invalid group size', async () => {
    stubFetch({ locations: sampleLocations, rooms: sampleRooms });
    render(<App />);
    await selectDowntown();
    const input = await screen.findByLabelText('Group size');
    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.getByText(/positive whole number/i)).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not call fetchRooms for an invalid group size', async () => {
    const fetchMock = stubFetch({ locations: sampleLocations, rooms: sampleRooms });
    render(<App />);
    await selectDowntown();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/locations/1/rooms?group_size=20'),
    );
    fireEvent.change(screen.getByLabelText('Group size'), {
      target: { value: '0' },
    });
    await screen.findByText(/positive whole number/i);
    const roomCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((path) => path.includes('/rooms?'));
    expect(roomCalls).toEqual(['/locations/1/rooms?group_size=20']);
  });

  it('shows an empty state when no rooms fit', async () => {
    stubFetch({ locations: sampleLocations, rooms: [] });
    render(<App />);
    await selectDowntown();
    expect(
      await screen.findByText(/no rooms fit this group size/i),
    ).toBeInTheDocument();
  });

  it('shows an error state when rooms fail to load', async () => {
    stubFetch({ locations: sampleLocations });
    vi.spyOn(api, 'fetchRooms').mockRejectedValue(new Error('boom'));
    render(<App />);
    await selectDowntown();
    expect(
      await screen.findByText(/could not load rooms/i),
    ).toBeInTheDocument();
  });
});

describe('App chat', () => {
  it('hides the chat form before a location is selected', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    await screen.findByRole('button', { name: /downtown studio/i });
    expect(
      screen.queryByRole('textbox', { name: /question/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ask$/i })).not.toBeInTheDocument();
  });

  it('shows the chat form after a location is selected', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    await selectDowntown();
    expect(screen.getByRole('textbox', { name: /question/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ask$/i })).toBeInTheDocument();
  });

  it('disables the Ask button when the question is empty or whitespace', async () => {
    stubFetch({ locations: sampleLocations });
    render(<App />);
    await selectDowntown();
    const askButton = screen.getByRole('button', { name: /^ask$/i });
    expect(askButton).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: '   ' },
    });
    expect(askButton).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: 'Are you open on Sundays?' },
    });
    expect(askButton).toBeEnabled();
  });

  it('disables the Ask button while the ask request is pending', async () => {
    stubFetch({ locations: sampleLocations });
    let resolveAsk!: (value: AskResponse) => void;
    const pending = new Promise<AskResponse>((resolve) => {
      resolveAsk = resolve;
    });
    const askSpy = vi.spyOn(api, 'askLocation').mockReturnValue(pending);
    render(<App />);
    await selectDowntown();
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: 'Hours?' },
    });
    const askButton = screen.getByRole('button', { name: /^ask$/i });
    fireEvent.click(askButton);
    await waitFor(() => expect(askButton).toBeDisabled());
    expect(askSpy).toHaveBeenCalledTimes(1);
    resolveAsk({ answer: 'We open at nine.' });
    await waitFor(() => expect(askButton).toBeEnabled());
  });

  it('calls askLocation with the selected location id and trimmed question', async () => {
    stubFetch({ locations: sampleLocations });
    const askSpy = vi.spyOn(api, 'askLocation').mockResolvedValue({ answer: 'Sure.' });
    render(<App />);
    await selectRiverside();
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: '   What are your hours?   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));
    await waitFor(() =>
      expect(askSpy).toHaveBeenCalledWith(2, 'What are your hours?'),
    );
  });

  it('displays the answer returned by askLocation', async () => {
    stubFetch({ locations: sampleLocations });
    vi.spyOn(api, 'askLocation').mockResolvedValue({
      answer: 'We offer three party packages.',
    });
    render(<App />);
    await selectDowntown();
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: 'What packages?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));
    expect(
      await screen.findByText(/we offer three party packages/i),
    ).toBeInTheDocument();
  });

  it('shows an error state when the ask request fails', async () => {
    stubFetch({ locations: sampleLocations });
    vi.spyOn(api, 'askLocation').mockRejectedValue(new Error('boom'));
    render(<App />);
    await selectDowntown();
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: 'What packages?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));
    expect(
      await screen.findByText(/could not get an answer/i),
    ).toBeInTheDocument();
  });

  it('keeps the dashboard sections visible after asking', async () => {
    stubFetch({ locations: sampleLocations });
    vi.spyOn(api, 'askLocation').mockResolvedValue({
      answer: 'The dashboard stays put.',
    });
    render(<App />);
    await selectDowntown();
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: 'Anything change?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));
    await screen.findByText(/dashboard stays put/i);
    expect(
      screen.getByRole('heading', { name: /party packages/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /active promos/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /rooms for group size/i }),
    ).toBeInTheDocument();
  });

  it('does not refetch dashboard data when asking', async () => {
    const fetchMock = stubFetch({ locations: sampleLocations });
    vi.spyOn(api, 'askLocation').mockResolvedValue({ answer: 'Done here.' });
    render(<App />);
    await selectDowntown();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/locations/1/rooms?group_size=20'),
    );
    const before = dashboardPaths(fetchMock);
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: 'Anything?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));
    await screen.findByText(/done here/i);
    expect(dashboardPaths(fetchMock)).toEqual(before);
  });

  it('clears the previous answer and error when the location changes', async () => {
    stubFetch({ locations: sampleLocations });
    vi.spyOn(api, 'askLocation').mockResolvedValue({
      answer: 'First location answer.',
    });
    render(<App />);
    await selectDowntown();
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: 'Question one' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));
    await screen.findByText(/first location answer/i);
    await selectRiverside();
    expect(screen.queryByText(/first location answer/i)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /question/i })).toHaveValue('');
  });
});

function packagePaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((path) => path.endsWith('/packages'));
}

function promoPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((path) => path.endsWith('/promos/active'));
}

function roomPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((path) => path.includes('/rooms?'));
}

describe('App manager editing', () => {
  it('renders a package toggle control', async () => {
    stubFetch({ locations: sampleLocations, packages: samplePackages });
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /party packages/i });
    expect(
      await within(region).findByRole('button', { name: /deactivate gold party/i }),
    ).toBeInTheDocument();
  });

  it('renders a promo toggle control', async () => {
    stubFetch({ locations: sampleLocations, promos: samplePromos });
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /active promos/i });
    expect(
      await within(region).findByRole('button', { name: /deactivate save10/i }),
    ).toBeInTheDocument();
  });

  it('calls setPackageActive with the toggled value when clicked', async () => {
    stubFetch({ locations: sampleLocations, packages: samplePackages });
    const spy = vi.spyOn(api, 'setPackageActive').mockResolvedValue({ success: true });
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /party packages/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate gold party/i }),
    );
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 10, false));
  });

  it('calls setPromoActive with the toggled value when clicked', async () => {
    stubFetch({ locations: sampleLocations, promos: samplePromos });
    const spy = vi.spyOn(api, 'setPromoActive').mockResolvedValue({ success: true });
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /active promos/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate save10/i }),
    );
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 20, false));
  });

  it('reloads only packages after a successful package toggle', async () => {
    const fetchMock = stubFetch({ locations: sampleLocations, packages: samplePackages });
    vi.spyOn(api, 'setPackageActive').mockResolvedValue({ success: true });
    render(<App />);
    await selectDowntown();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/locations/1/rooms?group_size=20'),
    );
    const region = screen.getByRole('region', { name: /party packages/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate gold party/i }),
    );
    await waitFor(() => expect(packagePaths(fetchMock)).toHaveLength(2));
    expect(promoPaths(fetchMock)).toHaveLength(1);
    expect(roomPaths(fetchMock)).toHaveLength(1);
  });

  it('reloads only promos after a successful promo toggle', async () => {
    const fetchMock = stubFetch({ locations: sampleLocations, promos: samplePromos });
    vi.spyOn(api, 'setPromoActive').mockResolvedValue({ success: true });
    render(<App />);
    await selectDowntown();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/locations/1/rooms?group_size=20'),
    );
    const region = screen.getByRole('region', { name: /active promos/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate save10/i }),
    );
    await waitFor(() => expect(promoPaths(fetchMock)).toHaveLength(2));
    expect(packagePaths(fetchMock)).toHaveLength(1);
    expect(roomPaths(fetchMock)).toHaveLength(1);
  });

  it('does not reload rooms after package or promo toggles', async () => {
    const fetchMock = stubFetch({
      locations: sampleLocations,
      packages: samplePackages,
      promos: samplePromos,
    });
    vi.spyOn(api, 'setPackageActive').mockResolvedValue({ success: true });
    vi.spyOn(api, 'setPromoActive').mockResolvedValue({ success: true });
    render(<App />);
    await selectDowntown();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/locations/1/rooms?group_size=20'),
    );
    fireEvent.click(
      await within(
        screen.getByRole('region', { name: /party packages/i }),
      ).findByRole('button', { name: /deactivate gold party/i }),
    );
    await waitFor(() => expect(packagePaths(fetchMock)).toHaveLength(2));
    fireEvent.click(
      await within(
        screen.getByRole('region', { name: /active promos/i }),
      ).findByRole('button', { name: /deactivate save10/i }),
    );
    await waitFor(() => expect(promoPaths(fetchMock)).toHaveLength(2));
    expect(roomPaths(fetchMock)).toHaveLength(1);
  });

  it('shows a saving state while a package toggle is in flight', async () => {
    stubFetch({ locations: sampleLocations, packages: samplePackages });
    let resolveToggle!: (value: ActiveUpdateResponse) => void;
    const pending = new Promise<ActiveUpdateResponse>((resolve) => {
      resolveToggle = resolve;
    });
    vi.spyOn(api, 'setPackageActive').mockReturnValue(pending);
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /party packages/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate gold party/i }),
    );
    expect(await within(region).findByText(/saving/i)).toBeInTheDocument();
    resolveToggle({ success: true });
    await waitFor(() =>
      expect(within(region).queryByText(/saving/i)).not.toBeInTheDocument(),
    );
  });

  it('shows a save error when a package toggle fails', async () => {
    stubFetch({ locations: sampleLocations, packages: samplePackages });
    vi.spyOn(api, 'setPackageActive').mockRejectedValue(new Error('boom'));
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /party packages/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate gold party/i }),
    );
    expect(
      await screen.findByText(/could not update the package/i),
    ).toBeInTheDocument();
  });

  it('shows a save error when a promo toggle fails', async () => {
    stubFetch({ locations: sampleLocations, promos: samplePromos });
    vi.spyOn(api, 'setPromoActive').mockRejectedValue(new Error('boom'));
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /active promos/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate save10/i }),
    );
    expect(
      await screen.findByText(/could not update the promo/i),
    ).toBeInTheDocument();
  });

  it('keeps the manager chat working alongside the toggle controls', async () => {
    stubFetch({ locations: sampleLocations, packages: samplePackages });
    vi.spyOn(api, 'askLocation').mockResolvedValue({ answer: 'Still chatting.' });
    render(<App />);
    await selectDowntown();
    await within(
      screen.getByRole('region', { name: /party packages/i }),
    ).findByRole('button', { name: /deactivate gold party/i });
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: 'What packages?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));
    expect(await screen.findByText(/still chatting/i)).toBeInTheDocument();
  });
});

describe('App state hardening', () => {
  it('does not reload dashboard data when the same location is reselected', async () => {
    const fetchMock = stubFetch({ locations: sampleLocations, packages: samplePackages });
    render(<App />);
    await selectDowntown();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/locations/1/rooms?group_size=20'),
    );
    const before = dashboardPaths(fetchMock);
    fireEvent.click(screen.getByRole('button', { name: /downtown studio/i }));
    await act(async () => {});
    expect(dashboardPaths(fetchMock)).toEqual(before);
  });

  it('prevents a second package toggle while one is pending', async () => {
    stubFetch({ locations: sampleLocations, packages: samplePackages });
    let resolveToggle!: (value: ActiveUpdateResponse) => void;
    const pending = new Promise<ActiveUpdateResponse>((resolve) => {
      resolveToggle = resolve;
    });
    const spy = vi.spyOn(api, 'setPackageActive').mockReturnValue(pending);
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /party packages/i });
    const gold = await within(region).findByRole('button', {
      name: /deactivate gold party/i,
    });
    const silver = within(region).getByRole('button', {
      name: /deactivate silver party/i,
    });
    fireEvent.click(gold);
    expect(gold).toBeDisabled();
    expect(silver).toBeDisabled();
    fireEvent.click(gold);
    fireEvent.click(silver);
    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveToggle({ success: true });
    });
  });

  it('prevents a second promo toggle while one is pending', async () => {
    stubFetch({ locations: sampleLocations, promos: samplePromos });
    let resolveToggle!: (value: ActiveUpdateResponse) => void;
    const pending = new Promise<ActiveUpdateResponse>((resolve) => {
      resolveToggle = resolve;
    });
    const spy = vi.spyOn(api, 'setPromoActive').mockReturnValue(pending);
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /active promos/i });
    const button = await within(region).findByRole('button', {
      name: /deactivate save10/i,
    });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveToggle({ success: true });
    });
  });

  it('disables every package toggle while a package save is pending', async () => {
    stubFetch({ locations: sampleLocations, packages: samplePackages });
    const pending = new Promise<ActiveUpdateResponse>(() => {});
    vi.spyOn(api, 'setPackageActive').mockReturnValue(pending);
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /party packages/i });
    const gold = await within(region).findByRole('button', {
      name: /deactivate gold party/i,
    });
    const silver = within(region).getByRole('button', {
      name: /deactivate silver party/i,
    });
    fireEvent.click(gold);
    expect(gold).toBeDisabled();
    expect(silver).toBeDisabled();
  });

  it('disables every promo toggle while a promo save is pending', async () => {
    const twoPromos: ResolvedPromo[] = [
      samplePromos[0],
      {
        id: 21,
        code: 'SUMMER',
        description: null,
        discount_percent: 15,
        starts_on: '2026-08-01',
        ends_on: '',
      },
    ];
    stubFetch({ locations: sampleLocations, promos: twoPromos });
    const pending = new Promise<ActiveUpdateResponse>(() => {});
    vi.spyOn(api, 'setPromoActive').mockReturnValue(pending);
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /active promos/i });
    const save10 = await within(region).findByRole('button', {
      name: /deactivate save10/i,
    });
    const summer = within(region).getByRole('button', { name: /deactivate summer/i });
    fireEvent.click(save10);
    expect(save10).toBeDisabled();
    expect(summer).toBeDisabled();
  });

  it('clears the package save error after a later successful save', async () => {
    stubFetch({ locations: sampleLocations, packages: samplePackages });
    vi.spyOn(api, 'setPackageActive')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ success: true });
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /party packages/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate gold party/i }),
    );
    expect(
      await screen.findByText(/could not update the package/i),
    ).toBeInTheDocument();
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate gold party/i }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/could not update the package/i),
      ).not.toBeInTheDocument(),
    );
  });

  it('clears the promo save error after a later successful save', async () => {
    stubFetch({ locations: sampleLocations, promos: samplePromos });
    vi.spyOn(api, 'setPromoActive')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ success: true });
    render(<App />);
    await selectDowntown();
    const region = screen.getByRole('region', { name: /active promos/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate save10/i }),
    );
    expect(
      await screen.findByText(/could not update the promo/i),
    ).toBeInTheDocument();
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate save10/i }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/could not update the promo/i),
      ).not.toBeInTheDocument(),
    );
  });

  it('clears dashboard load errors when the location changes', async () => {
    stubFetch({ locations: sampleLocations });
    vi.spyOn(api, 'fetchPackages')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(samplePackages);
    render(<App />);
    await selectDowntown();
    expect(
      await screen.findByText(/could not load packages/i),
    ).toBeInTheDocument();
    await selectRiverside();
    await waitFor(() =>
      expect(screen.queryByText(/could not load packages/i)).not.toBeInTheDocument(),
    );
  });

  it('clears the chat answer when the location changes', async () => {
    stubFetch({ locations: sampleLocations });
    vi.spyOn(api, 'askLocation').mockResolvedValue({ answer: 'Downtown answer' });
    render(<App />);
    await selectDowntown();
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: 'Question one' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));
    await screen.findByText(/downtown answer/i);
    await selectRiverside();
    expect(screen.queryByText(/downtown answer/i)).not.toBeInTheDocument();
  });

  it('clears the chat error when the location changes', async () => {
    stubFetch({ locations: sampleLocations });
    vi.spyOn(api, 'askLocation').mockRejectedValue(new Error('boom'));
    render(<App />);
    await selectDowntown();
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: 'Question one' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));
    expect(await screen.findByText(/could not get an answer/i)).toBeInTheDocument();
    await selectRiverside();
    expect(screen.queryByText(/could not get an answer/i)).not.toBeInTheDocument();
  });

  it('keeps the selected location after a reload when it still exists', async () => {
    const locationsSpy = vi
      .spyOn(api, 'fetchLocations')
      .mockResolvedValueOnce(sampleLocations)
      .mockResolvedValueOnce(sampleLocations);
    stubFetch({});
    render(<App />);
    await selectDowntown();
    expect(
      screen.getByRole('region', { name: /location dashboard/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /refresh locations/i }));
    await waitFor(() => expect(locationsSpy).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole('button', { name: /downtown studio/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('region', { name: /location dashboard/i }),
    ).toBeInTheDocument();
  });

  it('resets the selected location after a reload when it no longer exists', async () => {
    const remaining: Location[] = [{ id: 2, name: 'Riverside Hall', city: 'Portland' }];
    const locationsSpy = vi
      .spyOn(api, 'fetchLocations')
      .mockResolvedValueOnce(sampleLocations)
      .mockResolvedValueOnce(remaining);
    stubFetch({});
    render(<App />);
    await selectDowntown();
    expect(
      screen.getByRole('region', { name: /location dashboard/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /refresh locations/i }));
    await waitFor(() => expect(locationsSpy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: /location dashboard/i }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/select a location/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /downtown studio/i }),
    ).not.toBeInTheDocument();
  });

  it('disables the location selector only during the initial load', async () => {
    let resolveInitial!: (value: Location[]) => void;
    const initial = new Promise<Location[]>((resolve) => {
      resolveInitial = resolve;
    });
    let resolveReload!: (value: Location[]) => void;
    const reload = new Promise<Location[]>((resolve) => {
      resolveReload = resolve;
    });
    vi.spyOn(api, 'fetchLocations')
      .mockReturnValueOnce(initial)
      .mockReturnValueOnce(reload);
    stubFetch({});
    render(<App />);
    expect(screen.getByText(/loading locations/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /downtown studio/i }),
    ).not.toBeInTheDocument();
    await act(async () => {
      resolveInitial(sampleLocations);
    });
    expect(
      await screen.findByRole('button', { name: /downtown studio/i }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /refresh locations/i }));
    expect(screen.getByRole('button', { name: /downtown studio/i })).toBeEnabled();
    await act(async () => {
      resolveReload(sampleLocations);
    });
    expect(screen.getByRole('button', { name: /downtown studio/i })).toBeEnabled();
  });

  it('remembers the group size for each location during the session', async () => {
    const fetchMock = stubFetch({ locations: sampleLocations, rooms: sampleRooms });
    render(<App />);
    await selectDowntown();
    expect(await screen.findByLabelText('Group size')).toHaveValue(20);
    fireEvent.change(screen.getByLabelText('Group size'), {
      target: { value: '30' },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/locations/1/rooms?group_size=30'),
    );
    await selectRiverside();
    expect(await screen.findByLabelText('Group size')).toHaveValue(20);
    await selectDowntown();
    expect(await screen.findByLabelText('Group size')).toHaveValue(30);
  });

  it('resets the rooms validation error once a valid group size is entered', async () => {
    stubFetch({ locations: sampleLocations, rooms: sampleRooms });
    render(<App />);
    await selectDowntown();
    const input = await screen.findByLabelText('Group size');
    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.getByText(/positive whole number/i)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '25' } });
    expect(screen.queryByText(/positive whole number/i)).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('does not refetch rooms when the group size becomes invalid', async () => {
    const fetchMock = stubFetch({ locations: sampleLocations, rooms: sampleRooms });
    render(<App />);
    await selectDowntown();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/locations/1/rooms?group_size=20'),
    );
    const before = roomPaths(fetchMock);
    fireEvent.change(screen.getByLabelText('Group size'), {
      target: { value: 'abc' },
    });
    await screen.findByText(/positive whole number/i);
    expect(roomPaths(fetchMock)).toEqual(before);
  });

  it('ignores a stale package fetch after the location changes', async () => {
    stubFetch({ locations: sampleLocations });
    let resolveFirst!: (value: ResolvedPackage[]) => void;
    const firstPackages = new Promise<ResolvedPackage[]>((resolve) => {
      resolveFirst = resolve;
    });
    const secondPackages: ResolvedPackage[] = [
      {
        id: 55,
        name: 'Riverside Bundle',
        description: null,
        price_cents: 9000,
        is_active: true,
      },
    ];
    vi.spyOn(api, 'fetchPackages')
      .mockReturnValueOnce(firstPackages)
      .mockResolvedValueOnce(secondPackages);
    render(<App />);
    await selectDowntown();
    await selectRiverside();
    expect(await screen.findByText(/riverside bundle/i)).toBeInTheDocument();
    await act(async () => {
      resolveFirst(samplePackages);
    });
    expect(screen.queryByText(/gold party/i)).not.toBeInTheDocument();
    expect(screen.getByText(/riverside bundle/i)).toBeInTheDocument();
  });

  it('ignores a stale ask answer after the location changes', async () => {
    stubFetch({ locations: sampleLocations });
    let resolveAsk!: (value: AskResponse) => void;
    const pendingAsk = new Promise<AskResponse>((resolve) => {
      resolveAsk = resolve;
    });
    vi.spyOn(api, 'askLocation').mockReturnValue(pendingAsk);
    render(<App />);
    await selectDowntown();
    fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
      target: { value: 'Downtown hours?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^ask$/i })).toBeDisabled(),
    );
    await selectRiverside();
    await act(async () => {
      resolveAsk({ answer: 'Stale downtown answer' });
    });
    expect(screen.queryByText(/stale downtown answer/i)).not.toBeInTheDocument();
  });
});

const SAN_FRANCISCO_ID = 13;
const ULTIMATE_COMBO_ID = 1003;
const SUMMER_PROMO_ID = 3001;

const demoLocations: Location[] = [
  { id: 10, name: 'Downtown', city: 'Portland' },
  { id: SAN_FRANCISCO_ID, name: 'San Francisco', city: 'San Francisco' },
];

const demoPackageCatalog: ResolvedPackage[] = [
  {
    id: 1000,
    name: 'Bronze',
    description: 'Bronze party package',
    price_cents: 15000,
    is_active: true,
  },
  {
    id: ULTIMATE_COMBO_ID,
    name: 'Ultimate Combo',
    description: 'Ultimate party combo',
    price_cents: 45000,
    is_active: true,
  },
];

const demoPromoCatalog: ResolvedPromo[] = [
  {
    id: 3000,
    code: 'SAVE10',
    description: 'Ten percent off',
    discount_percent: 10,
    starts_on: '2026-01-01',
    ends_on: '2026-12-31',
  },
  {
    id: SUMMER_PROMO_ID,
    code: 'SUMMER',
    description: 'Summer discount',
    discount_percent: 20,
    starts_on: '2026-06-01',
    ends_on: '2026-08-31',
  },
];

const demoRooms: Resource[] = [
  { id: 7003, name: 'Bay Room', capacity: 24, size_tier_id: 101 },
];

interface DemoBackend {
  activePackageIds: Set<number>;
  activePromoIds: Set<number>;
  packagePatchStatus: number;
  promoPatchStatus: number;
}

function createDemoBackend(): DemoBackend {
  return {
    activePackageIds: new Set(demoPackageCatalog.map((pkg) => pkg.id)),
    activePromoIds: new Set(demoPromoCatalog.map((promo) => promo.id)),
    packagePatchStatus: 200,
    promoPatchStatus: 200,
  };
}

function demoPackages(backend: DemoBackend): ResolvedPackage[] {
  return demoPackageCatalog.filter((pkg) => backend.activePackageIds.has(pkg.id));
}

function demoPromos(backend: DemoBackend): ResolvedPromo[] {
  return demoPromoCatalog.filter((promo) => backend.activePromoIds.has(promo.id));
}

function demoAnswer(backend: DemoBackend, question: string): string {
  const normalized = question.toLowerCase();
  if (normalized.includes('package')) {
    const available = demoPackages(backend);
    if (available.length === 0) {
      return 'There are no party packages currently available for this location.';
    }
    const listed = available
      .map((pkg) => `${pkg.name} (${formatDemoPrice(pkg.price_cents)})`)
      .join(', ');
    return `Available party packages: ${listed}.`;
  }
  const active = demoPromos(backend);
  if (active.length === 0) {
    return 'There are no active promos currently listed for this location.';
  }
  const listed = active
    .map((promo) => `${promo.code} (${promo.discount_percent}% off)`)
    .join(', ');
  return `Active promos for this location: ${listed}.`;
}

function formatDemoPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as unknown as Response;
}

function stubDemoFetch(backend: DemoBackend): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};

    const packagePatch = /^\/locations\/\d+\/packages\/(\d+)\/active$/.exec(path);
    if (packagePatch !== null) {
      if (backend.packagePatchStatus !== 200) {
        return Promise.resolve(jsonResponse({}, backend.packagePatchStatus));
      }
      const packageId = Number(packagePatch[1]);
      if (body.is_active === true) {
        backend.activePackageIds.add(packageId);
      } else {
        backend.activePackageIds.delete(packageId);
      }
      return Promise.resolve(jsonResponse({ success: true }));
    }

    const promoPatch = /^\/locations\/\d+\/promos\/(\d+)\/active$/.exec(path);
    if (promoPatch !== null) {
      if (backend.promoPatchStatus !== 200) {
        return Promise.resolve(jsonResponse({}, backend.promoPatchStatus));
      }
      const promoId = Number(promoPatch[1]);
      if (body.is_active === true) {
        backend.activePromoIds.add(promoId);
      } else {
        backend.activePromoIds.delete(promoId);
      }
      return Promise.resolve(jsonResponse({ success: true }));
    }

    if (path.endsWith('/ask')) {
      const question = typeof body.question === 'string' ? body.question : '';
      return Promise.resolve(jsonResponse({ answer: demoAnswer(backend, question) }));
    }
    if (path === '/locations') {
      return Promise.resolve(jsonResponse(demoLocations));
    }
    if (path.endsWith('/packages')) {
      return Promise.resolve(jsonResponse(demoPackages(backend)));
    }
    if (path.endsWith('/promos/active')) {
      return Promise.resolve(jsonResponse(demoPromos(backend)));
    }
    if (path.includes('/rooms?')) {
      return Promise.resolve(jsonResponse(demoRooms));
    }
    return Promise.resolve(jsonResponse([]));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function selectSanFrancisco(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /san francisco/i }));
}

async function askDemoQuestion(question: string): Promise<void> {
  fireEvent.change(screen.getByRole('textbox', { name: /question/i }), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));
}

describe('App demo flow', () => {
  it('selects San Francisco and opens its dashboard', async () => {
    stubDemoFetch(createDemoBackend());
    render(<App />);
    await selectSanFrancisco();
    const dashboard = screen.getByRole('region', { name: /location dashboard/i });
    expect(within(dashboard).getByRole('heading', { level: 2 })).toHaveTextContent(
      /san francisco/i,
    );
    expect(screen.getByRole('button', { name: /san francisco/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows San Francisco packages, promos, and rooms', async () => {
    stubDemoFetch(createDemoBackend());
    render(<App />);
    await selectSanFrancisco();
    const packagesRegion = screen.getByRole('region', { name: /party packages/i });
    expect(await within(packagesRegion).findByText(/ultimate combo/i)).toBeInTheDocument();
    expect(within(packagesRegion).getByText('$450.00')).toBeInTheDocument();
    const promosRegion = screen.getByRole('region', { name: /active promos/i });
    expect(
      await within(promosRegion).findByRole('heading', { name: /summer/i }),
    ).toBeInTheDocument();
    const roomsRegion = screen.getByRole('region', { name: /rooms for group size/i });
    expect(await within(roomsRegion).findByText(/bay room/i)).toBeInTheDocument();
    expect(within(roomsRegion).getByText(/capacity 24/i)).toBeInTheDocument();
  });

  it('sends the package toggle to the San Francisco package endpoint', async () => {
    const fetchMock = stubDemoFetch(createDemoBackend());
    render(<App />);
    await selectSanFrancisco();
    const region = screen.getByRole('region', { name: /party packages/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate ultimate combo/i }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/locations/${SAN_FRANCISCO_ID}/packages/${ULTIMATE_COMBO_ID}/active`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        },
      ),
    );
  });

  it('reloads the package panel after a successful package toggle', async () => {
    const fetchMock = stubDemoFetch(createDemoBackend());
    render(<App />);
    await selectSanFrancisco();
    const region = screen.getByRole('region', { name: /party packages/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate ultimate combo/i }),
    );
    await waitFor(() => expect(packagePaths(fetchMock)).toHaveLength(2));
    await waitFor(() =>
      expect(
        within(region).queryByRole('heading', { name: /ultimate combo/i }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(region).getByRole('heading', { name: /bronze/i }),
    ).toBeInTheDocument();
  });

  it('sends the promo toggle to the San Francisco promo endpoint', async () => {
    const fetchMock = stubDemoFetch(createDemoBackend());
    render(<App />);
    await selectSanFrancisco();
    const region = screen.getByRole('region', { name: /active promos/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate summer/i }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/locations/${SAN_FRANCISCO_ID}/promos/${SUMMER_PROMO_ID}/active`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        },
      ),
    );
  });

  it('reloads the promo panel after a successful promo toggle', async () => {
    const fetchMock = stubDemoFetch(createDemoBackend());
    render(<App />);
    await selectSanFrancisco();
    const region = screen.getByRole('region', { name: /active promos/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate summer/i }),
    );
    await waitFor(() => expect(promoPaths(fetchMock)).toHaveLength(2));
    await waitFor(() =>
      expect(
        within(region).queryByRole('heading', { name: /summer/i }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(region).getByRole('heading', { name: /save10/i }),
    ).toBeInTheDocument();
  });

  it('updates the chat answer after a package toggle', async () => {
    const fetchMock = stubDemoFetch(createDemoBackend());
    render(<App />);
    await selectSanFrancisco();
    await askDemoQuestion('What party packages do you offer?');
    expect(await screen.findByLabelText('Answer')).toHaveTextContent(/ultimate combo/i);
    const region = screen.getByRole('region', { name: /party packages/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate ultimate combo/i }),
    );
    await waitFor(() => expect(packagePaths(fetchMock)).toHaveLength(2));
    await askDemoQuestion('What party packages do you offer?');
    await waitFor(() =>
      expect(screen.getByLabelText('Answer')).not.toHaveTextContent(/ultimate combo/i),
    );
    expect(screen.getByLabelText('Answer')).toHaveTextContent(/bronze/i);
  });

  it('updates the chat answer after a promo toggle', async () => {
    const fetchMock = stubDemoFetch(createDemoBackend());
    render(<App />);
    await selectSanFrancisco();
    await askDemoQuestion('Is the summer promo running?');
    expect(await screen.findByLabelText('Answer')).toHaveTextContent(/summer/i);
    const region = screen.getByRole('region', { name: /active promos/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate summer/i }),
    );
    await waitFor(() => expect(promoPaths(fetchMock)).toHaveLength(2));
    await askDemoQuestion('Is the summer promo running?');
    await waitFor(() =>
      expect(screen.getByLabelText('Answer')).not.toHaveTextContent(/summer/i),
    );
    expect(screen.getByLabelText('Answer')).toHaveTextContent(/save10/i);
  });

  it('shows the error state when the package toggle fails', async () => {
    const backend = createDemoBackend();
    backend.packagePatchStatus = 500;
    const fetchMock = stubDemoFetch(backend);
    render(<App />);
    await selectSanFrancisco();
    const region = screen.getByRole('region', { name: /party packages/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate ultimate combo/i }),
    );
    expect(await screen.findByText(/could not update the package/i)).toBeInTheDocument();
    expect(packagePaths(fetchMock)).toHaveLength(1);
    expect(
      within(region).getByRole('heading', { name: /ultimate combo/i }),
    ).toBeInTheDocument();
  });

  it('shows the error state when the promo toggle fails', async () => {
    const backend = createDemoBackend();
    backend.promoPatchStatus = 500;
    const fetchMock = stubDemoFetch(backend);
    render(<App />);
    await selectSanFrancisco();
    const region = screen.getByRole('region', { name: /active promos/i });
    fireEvent.click(
      await within(region).findByRole('button', { name: /deactivate summer/i }),
    );
    expect(await screen.findByText(/could not update the promo/i)).toBeInTheDocument();
    expect(promoPaths(fetchMock)).toHaveLength(1);
    expect(
      within(region).getByRole('heading', { name: /summer/i }),
    ).toBeInTheDocument();
  });
});

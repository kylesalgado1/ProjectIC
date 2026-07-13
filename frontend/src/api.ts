import type {
  ActiveUpdateRequest,
  ActiveUpdateResponse,
  AskRequest,
  AskResponse,
  LocationSummary,
  ResolvedPackage,
  ResolvedPromo,
  Resource,
} from './types';

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function assertNonEmptyQuestion(question: string): void {
  if (question.trim().length === 0) {
    throw new Error('question must not be empty');
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = init === undefined ? await fetch(path) : await fetch(path, init);
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`Request to ${path} returned malformed JSON`);
  }
}

export async function fetchLocations(): Promise<LocationSummary[]> {
  return requestJson<LocationSummary[]>('/locations');
}

export async function fetchPackages(locationId: number): Promise<ResolvedPackage[]> {
  assertPositiveInteger(locationId, 'locationId');
  return requestJson<ResolvedPackage[]>(`/locations/${locationId}/packages`);
}

export async function fetchActivePromos(locationId: number): Promise<ResolvedPromo[]> {
  assertPositiveInteger(locationId, 'locationId');
  return requestJson<ResolvedPromo[]>(`/locations/${locationId}/promos/active`);
}

export async function fetchRooms(
  locationId: number,
  groupSize: number,
): Promise<Resource[]> {
  assertPositiveInteger(locationId, 'locationId');
  assertPositiveInteger(groupSize, 'groupSize');
  return requestJson<Resource[]>(`/locations/${locationId}/rooms?group_size=${groupSize}`);
}

export async function askLocation(
  locationId: number,
  question: string,
): Promise<AskResponse> {
  assertPositiveInteger(locationId, 'locationId');
  assertNonEmptyQuestion(question);
  const body: AskRequest = { question };
  return requestJson<AskResponse>(`/locations/${locationId}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function setPackageActive(
  locationId: number,
  packageId: number,
  isActive: boolean,
): Promise<ActiveUpdateResponse> {
  assertPositiveInteger(locationId, 'locationId');
  assertPositiveInteger(packageId, 'packageId');
  const body: ActiveUpdateRequest = { is_active: isActive };
  return requestJson<ActiveUpdateResponse>(
    `/locations/${locationId}/packages/${packageId}/active`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

export async function setPromoActive(
  locationId: number,
  promoId: number,
  isActive: boolean,
): Promise<ActiveUpdateResponse> {
  assertPositiveInteger(locationId, 'locationId');
  assertPositiveInteger(promoId, 'promoId');
  const body: ActiveUpdateRequest = { is_active: isActive };
  return requestJson<ActiveUpdateResponse>(
    `/locations/${locationId}/promos/${promoId}/active`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

export interface LocationSummary {
  id: number;
  name: string;
  city: string;
}

export type Location = LocationSummary;

export interface ResolvedPackage {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  is_active: boolean;
}

export interface ResolvedPromo {
  id: number;
  code: string;
  description: string | null;
  discount_percent: number;
  starts_on: string;
  ends_on: string;
}

export interface Resource {
  id: number;
  name: string;
  capacity: number;
  size_tier_id: number;
}

export interface AskRequest {
  question: string;
}

export interface AskResponse {
  answer: string;
}

export interface ActiveUpdateRequest {
  is_active: boolean;
}

export interface ActiveUpdateResponse {
  success: boolean;
}

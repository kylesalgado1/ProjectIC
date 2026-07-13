from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class SizeTier:
    id: int
    company_id: int
    name: str
    min_guests: int
    max_guests: int


@dataclass(frozen=True)
class Resource:
    id: int
    company_id: int
    location_id: int
    name: str
    capacity: int
    size_tier_id: int


@dataclass(frozen=True)
class Package:
    id: int
    company_id: int
    name: str
    description: str
    base_price_cents: int
    size_tier_id: int
    active: bool


@dataclass(frozen=True)
class PackageOverride:
    package_id: int
    location_id: int
    price_cents: int | None
    available: bool


@dataclass(frozen=True)
class Promo:
    id: int
    company_id: int
    code: str
    description: str
    discount_percent: int
    starts_on: date
    ends_on: date
    active: bool


@dataclass(frozen=True)
class PromoOverride:
    promo_id: int
    location_id: int
    discount_percent: int | None
    active: bool


@dataclass(frozen=True)
class ResolvedPackage:
    package: Package
    price_cents: int
    available: bool


@dataclass(frozen=True)
class ResolvedPromo:
    promo: Promo
    discount_percent: int


def resolve_packages(
    packages: list[Package],
    overrides: dict[int, PackageOverride],
) -> list[ResolvedPackage]:
    resolved: list[ResolvedPackage] = []
    for package in packages:
        override = overrides.get(package.id)
        price = package.base_price_cents
        available = package.active
        if override is not None:
            if override.price_cents is not None:
                price = override.price_cents
            available = available and override.available
        resolved.append(
            ResolvedPackage(package=package, price_cents=price, available=available)
        )
    return resolved


def active_promos(
    promos: list[Promo],
    overrides: dict[int, PromoOverride],
    on: date,
) -> list[ResolvedPromo]:
    resolved: list[ResolvedPromo] = []
    for promo in promos:
        override = overrides.get(promo.id)
        discount = promo.discount_percent
        active = promo.active
        if override is not None:
            if override.discount_percent is not None:
                discount = override.discount_percent
            active = active and override.active
        if active and promo.starts_on <= on <= promo.ends_on:
            resolved.append(ResolvedPromo(promo=promo, discount_percent=discount))
    return resolved


def rooms_fitting(resources: list[Resource], guests: int) -> list[Resource]:
    fitting = [resource for resource in resources if resource.capacity >= guests]
    return sorted(fitting, key=lambda resource: (resource.capacity, resource.id))

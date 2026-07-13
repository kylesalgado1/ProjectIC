from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import repository
import resolution
from resolution import ResolvedPackage, ResolvedPromo, Resource


@dataclass(frozen=True)
class AssistantContext:
    location_id: int
    location_name: str
    city: str
    packages: list[ResolvedPackage]
    active_promos: list[ResolvedPromo]
    resources: list[Resource]


def build_assistant_context(
    company_id: int,
    location_id: int,
    now: datetime,
) -> AssistantContext | None:
    location = repository.get_location(company_id, location_id)
    if location is None:
        return None
    packages, package_overrides = repository.load_packages_for_location(
        company_id, location_id
    )
    promos, promo_overrides = repository.load_promos_for_location(
        company_id, location_id
    )
    resources = repository.load_resources_for_location(company_id, location_id)
    resolved_packages = resolution.resolve_packages(packages, package_overrides)
    resolved_promos = resolution.active_promos(promos, promo_overrides, on=now.date())
    return AssistantContext(
        location_id=location.id,
        location_name=location.name,
        city=location.city,
        packages=resolved_packages,
        active_promos=resolved_promos,
        resources=resources,
    )

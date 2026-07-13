from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from unittest import mock

import assistant_context
import resolution
from repository import LocationSummary
from resolution import Package, PackageOverride, Promo, PromoOverride, Resource

LOCATION = LocationSummary(id=10, company_id=1, name="Downtown", city="Portland")

PACKAGES = [
    Package(
        id=1000,
        company_id=1,
        name="Bronze",
        description="Bronze party package",
        base_price_cents=15000,
        size_tier_id=100,
        active=True,
    ),
    Package(
        id=1001,
        company_id=1,
        name="Gold",
        description="Gold party package",
        base_price_cents=30000,
        size_tier_id=101,
        active=True,
    ),
]

PACKAGE_OVERRIDES = {
    1000: PackageOverride(
        package_id=1000, location_id=10, price_cents=12000, available=True
    ),
}

PROMOS = [
    Promo(
        id=3000,
        company_id=1,
        code="SAVE10",
        description="Ten percent off",
        discount_percent=10,
        starts_on=date(2026, 1, 1),
        ends_on=date(2026, 12, 31),
        active=True,
    ),
    Promo(
        id=3002,
        company_id=1,
        code="OLDIE",
        description="Expired promo",
        discount_percent=50,
        starts_on=date(2020, 1, 1),
        ends_on=date(2020, 2, 1),
        active=True,
    ),
]

PROMO_OVERRIDES = {
    3000: PromoOverride(
        promo_id=3000, location_id=10, discount_percent=15, active=True
    ),
}

RESOURCES = [
    Resource(
        id=7000,
        company_id=1,
        location_id=10,
        name="Room A",
        capacity=8,
        size_tier_id=100,
    ),
    Resource(
        id=7001,
        company_id=1,
        location_id=10,
        name="Room B",
        capacity=20,
        size_tier_id=101,
    ),
]

FIXED_NOW = datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)


def _packages_return() -> tuple[list[Package], dict[int, PackageOverride]]:
    return list(PACKAGES), dict(PACKAGE_OVERRIDES)


def _promos_return() -> tuple[list[Promo], dict[int, PromoOverride]]:
    return list(PROMOS), dict(PROMO_OVERRIDES)


class BuildAssistantContextTests(unittest.TestCase):
    def test_returns_none_for_unknown_location(self) -> None:
        with mock.patch.object(
            assistant_context.repository, "get_location", return_value=None
        ):
            result = assistant_context.build_assistant_context(1, 88888, FIXED_NOW)
        self.assertIsNone(result)

    def test_calls_repository_with_company_id_and_location_id(self) -> None:
        with (
            mock.patch.object(
                assistant_context.repository, "get_location", return_value=LOCATION
            ) as get_location,
            mock.patch.object(
                assistant_context.repository,
                "load_packages_for_location",
                return_value=_packages_return(),
            ) as load_packages,
            mock.patch.object(
                assistant_context.repository,
                "load_promos_for_location",
                return_value=_promos_return(),
            ) as load_promos,
            mock.patch.object(
                assistant_context.repository,
                "load_resources_for_location",
                return_value=list(RESOURCES),
            ) as load_resources,
        ):
            assistant_context.build_assistant_context(1, 10, FIXED_NOW)
        get_location.assert_called_once_with(1, 10)
        load_packages.assert_called_once_with(1, 10)
        load_promos.assert_called_once_with(1, 10)
        load_resources.assert_called_once_with(1, 10)

    def test_resolves_packages(self) -> None:
        with (
            mock.patch.object(
                assistant_context.repository, "get_location", return_value=LOCATION
            ),
            mock.patch.object(
                assistant_context.repository,
                "load_packages_for_location",
                return_value=_packages_return(),
            ),
            mock.patch.object(
                assistant_context.repository,
                "load_promos_for_location",
                return_value=_promos_return(),
            ),
            mock.patch.object(
                assistant_context.repository,
                "load_resources_for_location",
                return_value=list(RESOURCES),
            ),
        ):
            result = assistant_context.build_assistant_context(1, 10, FIXED_NOW)
        assert result is not None
        self.assertEqual(
            result.packages,
            resolution.resolve_packages(list(PACKAGES), dict(PACKAGE_OVERRIDES)),
        )

    def test_resolves_active_promos_with_supplied_now(self) -> None:
        with (
            mock.patch.object(
                assistant_context.repository, "get_location", return_value=LOCATION
            ),
            mock.patch.object(
                assistant_context.repository,
                "load_packages_for_location",
                return_value=_packages_return(),
            ),
            mock.patch.object(
                assistant_context.repository,
                "load_promos_for_location",
                return_value=_promos_return(),
            ),
            mock.patch.object(
                assistant_context.repository,
                "load_resources_for_location",
                return_value=list(RESOURCES),
            ),
            mock.patch.object(
                assistant_context.resolution,
                "active_promos",
                wraps=assistant_context.resolution.active_promos,
            ) as active_promos,
        ):
            result = assistant_context.build_assistant_context(1, 10, FIXED_NOW)
        active_promos.assert_called_once_with(
            list(PROMOS), dict(PROMO_OVERRIDES), on=FIXED_NOW.date()
        )
        assert result is not None
        self.assertEqual(
            result.active_promos,
            resolution.active_promos(
                list(PROMOS), dict(PROMO_OVERRIDES), on=FIXED_NOW.date()
            ),
        )

    def test_includes_raw_resources(self) -> None:
        with (
            mock.patch.object(
                assistant_context.repository, "get_location", return_value=LOCATION
            ),
            mock.patch.object(
                assistant_context.repository,
                "load_packages_for_location",
                return_value=_packages_return(),
            ),
            mock.patch.object(
                assistant_context.repository,
                "load_promos_for_location",
                return_value=_promos_return(),
            ),
            mock.patch.object(
                assistant_context.repository,
                "load_resources_for_location",
                return_value=list(RESOURCES),
            ),
            mock.patch.object(
                assistant_context.resolution, "rooms_fitting"
            ) as rooms_fitting,
        ):
            result = assistant_context.build_assistant_context(1, 10, FIXED_NOW)
        assert result is not None
        self.assertEqual(result.resources, list(RESOURCES))
        rooms_fitting.assert_not_called()

    def test_maps_location_id_name_and_city(self) -> None:
        with (
            mock.patch.object(
                assistant_context.repository, "get_location", return_value=LOCATION
            ),
            mock.patch.object(
                assistant_context.repository,
                "load_packages_for_location",
                return_value=_packages_return(),
            ),
            mock.patch.object(
                assistant_context.repository,
                "load_promos_for_location",
                return_value=_promos_return(),
            ),
            mock.patch.object(
                assistant_context.repository,
                "load_resources_for_location",
                return_value=list(RESOURCES),
            ),
        ):
            result = assistant_context.build_assistant_context(1, 10, FIXED_NOW)
        assert result is not None
        self.assertEqual(result.location_id, 10)
        self.assertEqual(result.location_name, "Downtown")
        self.assertEqual(result.city, "Portland")


if __name__ == "__main__":
    unittest.main()

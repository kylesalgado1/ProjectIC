from __future__ import annotations

import unittest
from datetime import date

from resolution import (
    Package,
    PackageOverride,
    Promo,
    PromoOverride,
    Resource,
    active_promos,
    resolve_packages,
    rooms_fitting,
)


def _package(package_id: int, price: int, active: bool = True) -> Package:
    return Package(
        id=package_id,
        company_id=1,
        name=f"package-{package_id}",
        description="A party package",
        base_price_cents=price,
        size_tier_id=100,
        active=active,
    )


def _promo(promo_id: int, discount: int, active: bool = True) -> Promo:
    return Promo(
        id=promo_id,
        company_id=1,
        code=f"CODE{promo_id}",
        description="A promo",
        discount_percent=discount,
        starts_on=date(2026, 1, 1),
        ends_on=date(2026, 12, 31),
        active=active,
    )


def _resource(resource_id: int, capacity: int) -> Resource:
    return Resource(
        id=resource_id,
        company_id=1,
        location_id=10,
        name=f"room-{resource_id}",
        capacity=capacity,
        size_tier_id=100,
    )


class ResolvePackagesTests(unittest.TestCase):
    def test_without_override_uses_base_price_and_active(self) -> None:
        resolved = resolve_packages([_package(1, 15000)], {})
        self.assertEqual(len(resolved), 1)
        self.assertEqual(resolved[0].price_cents, 15000)
        self.assertTrue(resolved[0].available)

    def test_override_price_replaces_base_price(self) -> None:
        override = PackageOverride(
            package_id=1, location_id=10, price_cents=12000, available=True
        )
        resolved = resolve_packages([_package(1, 15000)], {1: override})
        self.assertEqual(resolved[0].price_cents, 12000)
        self.assertTrue(resolved[0].available)

    def test_override_can_disable_availability(self) -> None:
        override = PackageOverride(
            package_id=1, location_id=10, price_cents=None, available=False
        )
        resolved = resolve_packages([_package(1, 15000)], {1: override})
        self.assertEqual(resolved[0].price_cents, 15000)
        self.assertFalse(resolved[0].available)

    def test_inactive_package_stays_unavailable(self) -> None:
        override = PackageOverride(
            package_id=1, location_id=10, price_cents=None, available=True
        )
        resolved = resolve_packages([_package(1, 15000, active=False)], {1: override})
        self.assertFalse(resolved[0].available)


class ActivePromosTests(unittest.TestCase):
    def test_in_window_active_promo_is_included(self) -> None:
        resolved = active_promos([_promo(1, 10)], {}, date(2026, 7, 1))
        self.assertEqual(len(resolved), 1)
        self.assertEqual(resolved[0].discount_percent, 10)

    def test_out_of_window_promo_is_excluded(self) -> None:
        resolved = active_promos([_promo(1, 10)], {}, date(2025, 7, 1))
        self.assertEqual(resolved, [])

    def test_override_can_deactivate_promo(self) -> None:
        override = PromoOverride(
            promo_id=1, location_id=10, discount_percent=None, active=False
        )
        resolved = active_promos([_promo(1, 10)], {1: override}, date(2026, 7, 1))
        self.assertEqual(resolved, [])

    def test_override_discount_replaces_base(self) -> None:
        override = PromoOverride(
            promo_id=1, location_id=10, discount_percent=25, active=True
        )
        resolved = active_promos([_promo(1, 10)], {1: override}, date(2026, 7, 1))
        self.assertEqual(resolved[0].discount_percent, 25)


class RoomsFittingTests(unittest.TestCase):
    def test_filters_and_sorts_by_capacity(self) -> None:
        rooms = [_resource(1, 20), _resource(2, 8), _resource(3, 4)]
        fitting = rooms_fitting(rooms, 8)
        self.assertEqual([room.id for room in fitting], [2, 1])

    def test_no_room_fits_returns_empty(self) -> None:
        rooms = [_resource(1, 4), _resource(2, 6)]
        self.assertEqual(rooms_fitting(rooms, 30), [])


if __name__ == "__main__":
    unittest.main()

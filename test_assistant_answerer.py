from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import date
from unittest import mock

import resolution
from assistant_answerer import (
    FALLBACK_MESSAGE,
    NO_PACKAGES_MESSAGE,
    NO_PROMOS_MESSAGE,
    NO_ROOM_MESSAGE,
    answer_question,
)
from assistant_context import AssistantContext
from resolution import Package, Promo, ResolvedPackage, ResolvedPromo, Resource


def _resolved_package(
    package_id: int,
    name: str,
    price_cents: int,
    available: bool,
    description: str = "",
) -> ResolvedPackage:
    return ResolvedPackage(
        package=Package(
            id=package_id,
            company_id=1,
            name=name,
            description=description,
            base_price_cents=price_cents,
            size_tier_id=100,
            active=True,
        ),
        price_cents=price_cents,
        available=available,
    )


def _resolved_promo(
    promo_id: int,
    code: str,
    description: str,
    ends_on: date,
) -> ResolvedPromo:
    return ResolvedPromo(
        promo=Promo(
            id=promo_id,
            company_id=1,
            code=code,
            description=description,
            discount_percent=10,
            starts_on=date(2026, 1, 1),
            ends_on=ends_on,
            active=True,
        ),
        discount_percent=10,
    )


def _resource(resource_id: int, name: str, capacity: int) -> Resource:
    return Resource(
        id=resource_id,
        company_id=1,
        location_id=10,
        name=name,
        capacity=capacity,
        size_tier_id=100,
    )


EMPTY_CONTEXT = AssistantContext(
    location_id=10,
    location_name="Downtown",
    city="Portland",
    packages=[],
    active_promos=[],
    resources=[],
)

BRONZE = _resolved_package(1000, "Bronze", 12000, True, "Bronze party package")
GOLD = _resolved_package(1001, "Gold", 30000, True, "Gold party package")
LEGACY = _resolved_package(1002, "Legacy", 9000, False, "Legacy package")
SUMMER = _resolved_promo(3001, "SUMMER", "Summer discount", date(2026, 8, 31))

FULL_CONTEXT = replace(
    EMPTY_CONTEXT,
    packages=[BRONZE],
    active_promos=[SUMMER],
    resources=[_resource(7000, "Room A", 8)],
)


class PackageAnswerTests(unittest.TestCase):
    def test_lists_active_package_names(self) -> None:
        context = replace(EMPTY_CONTEXT, packages=[BRONZE, GOLD])
        answer = answer_question("What packages do you offer?", context)
        self.assertIn("Bronze", answer)
        self.assertIn("Gold", answer)

    def test_excludes_inactive_package(self) -> None:
        context = replace(EMPTY_CONTEXT, packages=[BRONZE, LEGACY])
        answer = answer_question("What are your prices?", context)
        self.assertIn("Bronze", answer)
        self.assertNotIn("Legacy", answer)

    def test_includes_dollar_price(self) -> None:
        context = replace(
            EMPTY_CONTEXT, packages=[_resolved_package(1, "Deluxe", 12999, True)]
        )
        answer = answer_question("How much does a package cost?", context)
        self.assertIn("$129.99", answer)

    def test_includes_description_when_present(self) -> None:
        package = _resolved_package(1, "Bronze", 12000, True, "Two hours of bowling")
        context = replace(EMPTY_CONTEXT, packages=[package])
        answer = answer_question("Tell me about your packages", context)
        self.assertIn("Two hours of bowling", answer)

    def test_no_packages_returns_no_packages_message(self) -> None:
        self.assertEqual(
            answer_question("What packages do you have?", EMPTY_CONTEXT),
            NO_PACKAGES_MESSAGE,
        )

    def test_only_inactive_packages_returns_no_packages_message(self) -> None:
        context = replace(EMPTY_CONTEXT, packages=[LEGACY])
        self.assertEqual(
            answer_question("What offers are available?", context),
            NO_PACKAGES_MESSAGE,
        )

    def test_exact_format(self) -> None:
        context = replace(EMPTY_CONTEXT, packages=[BRONZE, GOLD])
        self.assertEqual(
            answer_question("package price", context),
            "Active packages: Bronze ($120.00) - Bronze party package; "
            "Gold ($300.00) - Gold party package.",
        )

    def test_detects_package_keywords(self) -> None:
        context = replace(EMPTY_CONTEXT, packages=[BRONZE])
        keywords = [
            "package",
            "packages",
            "party",
            "parties",
            "price",
            "cost",
            "offer",
            "bowling",
            "arcade",
            "inclusive",
        ]
        for keyword in keywords:
            with self.subTest(keyword=keyword):
                self.assertIn("Bronze", answer_question(f"about {keyword}", context))

    def test_answer_excludes_promo_and_room_names(self) -> None:
        answer = answer_question("What packages do you offer?", FULL_CONTEXT)
        self.assertIn("Bronze", answer)
        self.assertNotIn("SUMMER", answer)
        self.assertNotIn("Room A", answer)


class PromoAnswerTests(unittest.TestCase):
    def test_lists_active_promo_names(self) -> None:
        context = replace(EMPTY_CONTEXT, active_promos=[SUMMER])
        self.assertIn("SUMMER", answer_question("Any promotions?", context))

    def test_includes_end_date(self) -> None:
        context = replace(EMPTY_CONTEXT, active_promos=[SUMMER])
        self.assertIn("2026-08-31", answer_question("What promos are running?", context))

    def test_includes_description_when_present(self) -> None:
        context = replace(EMPTY_CONTEXT, active_promos=[SUMMER])
        self.assertIn("Summer discount", answer_question("Any discount?", context))

    def test_no_promos_returns_no_promos_message(self) -> None:
        self.assertEqual(
            answer_question("Is any promo active?", EMPTY_CONTEXT),
            NO_PROMOS_MESSAGE,
        )

    def test_excludes_inactive_promo(self) -> None:
        active = Promo(
            id=3001,
            company_id=1,
            code="SUMMER",
            description="Summer discount",
            discount_percent=20,
            starts_on=date(2026, 6, 1),
            ends_on=date(2026, 8, 31),
            active=True,
        )
        inactive = Promo(
            id=3002,
            company_id=1,
            code="WINTER",
            description="Off season",
            discount_percent=50,
            starts_on=date(2026, 6, 1),
            ends_on=date(2026, 8, 31),
            active=False,
        )
        resolved = resolution.active_promos(
            [active, inactive], {}, on=date(2026, 7, 1)
        )
        context = replace(EMPTY_CONTEXT, active_promos=resolved)
        answer = answer_question("What promos are active?", context)
        self.assertIn("SUMMER", answer)
        self.assertNotIn("WINTER", answer)

    def test_exact_format(self) -> None:
        context = replace(EMPTY_CONTEXT, active_promos=[SUMMER])
        self.assertEqual(
            answer_question("promotion", context),
            "Active promos: SUMMER - Summer discount (ends 2026-08-31).",
        )

    def test_detects_promo_keywords(self) -> None:
        context = replace(EMPTY_CONTEXT, active_promos=[SUMMER])
        keywords = [
            "promo",
            "promos",
            "promotion",
            "discount",
            "event",
            "active",
            "running",
            "my melody",
            "miku",
            "cinnamoroll",
            "summer",
        ]
        for keyword in keywords:
            with self.subTest(keyword=keyword):
                self.assertIn("SUMMER", answer_question(f"is there {keyword}", context))


class RoomAnswerTests(unittest.TestCase):
    def test_with_group_size_lists_fitting_rooms(self) -> None:
        rooms = [_resource(7000, "Room A", 8), _resource(7001, "Room B", 20)]
        context = replace(EMPTY_CONTEXT, resources=rooms)
        answer = answer_question("Which room fits 8 guests?", context)
        self.assertIn("Room A", answer)
        self.assertIn("capacity 8", answer)
        self.assertIn("Room B", answer)
        self.assertIn("capacity 20", answer)

    def test_uses_rooms_fitting(self) -> None:
        rooms = [_resource(7000, "Room A", 8)]
        context = replace(EMPTY_CONTEXT, resources=rooms)
        with mock.patch.object(
            resolution, "rooms_fitting", wraps=resolution.rooms_fitting
        ) as rooms_fitting:
            answer_question("Which room fits 8 people?", context)
        rooms_fitting.assert_called_once_with(rooms, 8)

    def test_extracts_first_positive_integer(self) -> None:
        rooms = [_resource(1, "Small", 6), _resource(2, "Large", 30)]
        context = replace(EMPTY_CONTEXT, resources=rooms)
        answer = answer_question("Any room for a group of 25 guests?", context)
        self.assertIn("Large", answer)
        self.assertNotIn("Small", answer)

    def test_ignores_zero_and_uses_first_positive(self) -> None:
        rooms = [_resource(1, "Small", 6), _resource(2, "Large", 30)]
        context = replace(EMPTY_CONTEXT, resources=rooms)
        answer = answer_question("room for 0 kids, really 6 people", context)
        self.assertIn("Rooms that fit 6 guests", answer)

    def test_no_fitting_room_returns_no_room_message(self) -> None:
        context = replace(EMPTY_CONTEXT, resources=[_resource(1, "Tiny", 4)])
        self.assertEqual(
            answer_question("Which room fits 50 people?", context),
            NO_ROOM_MESSAGE,
        )

    def test_without_group_size_lists_rooms(self) -> None:
        rooms = [_resource(7000, "Room A", 8), _resource(7001, "Room B", 20)]
        context = replace(EMPTY_CONTEXT, resources=rooms)
        answer = answer_question("What rooms do you have?", context)
        self.assertIn("Room A", answer)
        self.assertIn("capacity 8", answer)
        self.assertIn("Room B", answer)
        self.assertIn("capacity 20", answer)
        self.assertNotEqual(answer, NO_ROOM_MESSAGE)

    def test_sorts_fitting_rooms_by_capacity_ascending(self) -> None:
        rooms = [
            _resource(1, "Grand", 40),
            _resource(2, "Nook", 6),
            _resource(3, "Hall", 25),
        ]
        context = replace(EMPTY_CONTEXT, resources=rooms)
        with mock.patch.object(resolution, "rooms_fitting", return_value=list(rooms)):
            answer = answer_question("Which room fits 4 people?", context)
        self.assertLess(answer.index("Nook"), answer.index("Hall"))
        self.assertLess(answer.index("Hall"), answer.index("Grand"))

    def test_detects_room_keywords(self) -> None:
        rooms = [_resource(7000, "Room A", 8)]
        context = replace(EMPTY_CONTEXT, resources=rooms)
        keywords = [
            "room",
            "rooms",
            "fit",
            "fits",
            "capacity",
            "people",
            "guests",
            "group",
        ]
        for keyword in keywords:
            with self.subTest(keyword=keyword):
                self.assertIn("Room A", answer_question(f"{keyword} for 8", context))


class FallbackAnswerTests(unittest.TestCase):
    def test_unknown_question_returns_fallback(self) -> None:
        self.assertEqual(
            answer_question("What are your opening hours?", FULL_CONTEXT),
            FALLBACK_MESSAGE,
        )

    def test_fallback_contains_no_context_names(self) -> None:
        answer = answer_question("Tell me a joke.", FULL_CONTEXT)
        self.assertEqual(answer, FALLBACK_MESSAGE)
        for name in ("Bronze", "SUMMER", "Room A"):
            self.assertNotIn(name, answer)


if __name__ == "__main__":
    unittest.main()

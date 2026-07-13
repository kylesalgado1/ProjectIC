from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import date
from unittest import mock

import llm_provider
import resolution
from assistant_answerer import (
    AssistantAnswerer,
    FALLBACK_MESSAGE,
    GROUP_SIZE_PROMPT,
    GroundedAssistantAnswerer,
    NO_PACKAGES_MESSAGE,
    NO_PROMOS_MESSAGE,
    NO_ROOM_MESSAGE,
    StaticAssistantAnswerer,
    build_grounded_context,
    get_default_answerer,
)
from assistant_context import AssistantContext
from llm_provider import DisabledLLMProvider
from resolution import Package, Promo, ResolvedPackage, ResolvedPromo, Resource


class _RecordingProvider:
    def __init__(self, response: str) -> None:
        self.response = response
        self.calls: list[tuple[str, str]] = []

    def generate(self, question: str, context: str) -> str:
        self.calls.append((question, context))
        return self.response

CONTEXT = AssistantContext(
    location_id=10,
    location_name="Downtown",
    city="Portland",
    packages=[],
    active_promos=[],
    resources=[],
)


def _resolved_package(
    package_id: int, name: str, price_cents: int, available: bool
) -> ResolvedPackage:
    return ResolvedPackage(
        package=Package(
            id=package_id,
            company_id=1,
            name=name,
            description=f"{name} party package",
            base_price_cents=price_cents,
            size_tier_id=100,
            active=True,
        ),
        price_cents=price_cents,
        available=available,
    )


def _resolved_promo(promo_id: int, code: str, discount_percent: int) -> ResolvedPromo:
    return ResolvedPromo(
        promo=Promo(
            id=promo_id,
            company_id=1,
            code=code,
            description=f"{code} discount",
            discount_percent=discount_percent,
            starts_on=date(2026, 6, 1),
            ends_on=date(2026, 8, 31),
            active=True,
        ),
        discount_percent=discount_percent,
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


PACKAGES_CONTEXT = replace(
    CONTEXT,
    packages=[
        _resolved_package(1000, "Bronze", 12000, True),
        _resolved_package(1001, "Gold", 30000, True),
        _resolved_package(1002, "Legacy", 9000, False),
    ],
)

SAN_FRANCISCO_SUMMER_CONTEXT = AssistantContext(
    location_id=20,
    location_name="San Francisco",
    city="San Francisco",
    packages=[],
    active_promos=[_resolved_promo(3001, "SUMMER", 20)],
    resources=[],
)

ROSEVILLE_CONTEXT = AssistantContext(
    location_id=21,
    location_name="Roseville",
    city="Roseville",
    packages=[],
    active_promos=[],
    resources=[],
)

ROOMS_CONTEXT = replace(
    CONTEXT,
    resources=[
        _resource(7000, "Room A", 8),
        _resource(7001, "Room B", 20),
    ],
)

FULL_CONTEXT = AssistantContext(
    location_id=10,
    location_name="Downtown",
    city="Portland",
    packages=[_resolved_package(1000, "Bronze", 12000, True)],
    active_promos=[_resolved_promo(3001, "SUMMER", 20)],
    resources=[_resource(7000, "Room A", 8)],
)


class StaticAssistantAnswererTests(unittest.TestCase):
    def test_returns_not_enabled_message(self) -> None:
        answerer = StaticAssistantAnswerer()
        self.assertEqual(
            answerer.answer("What packages do you offer?", CONTEXT),
            "Assistant is not enabled yet.",
        )

    def test_answer_is_deterministic_across_questions(self) -> None:
        answerer = StaticAssistantAnswerer()
        first = answerer.answer("What packages do you offer?", CONTEXT)
        second = answerer.answer("Which rooms fit twenty people?", CONTEXT)
        self.assertEqual(first, second)

    def test_is_assistant_answerer_compatible(self) -> None:
        self.assertIsInstance(StaticAssistantAnswerer(), AssistantAnswerer)


class GetDefaultAnswererTests(unittest.TestCase):
    def test_returns_assistant_answerer_compatible_object(self) -> None:
        self.assertIsInstance(get_default_answerer(), AssistantAnswerer)

    def test_returns_grounded_answerer(self) -> None:
        self.assertIsInstance(get_default_answerer(), GroundedAssistantAnswerer)

    def test_returned_answerer_answers_from_context(self) -> None:
        self.assertEqual(
            get_default_answerer().answer("What packages do you offer?", CONTEXT),
            NO_PACKAGES_MESSAGE,
        )


class GroundedAssistantAnswererTests(unittest.TestCase):
    def setUp(self) -> None:
        self.answerer = GroundedAssistantAnswerer()

    def test_is_assistant_answerer_compatible(self) -> None:
        self.assertIsInstance(self.answerer, AssistantAnswerer)

    def test_packages_question_lists_available_names_and_prices(self) -> None:
        answer = self.answerer.answer(
            "What party packages do you offer?", PACKAGES_CONTEXT
        )
        self.assertIn("Bronze", answer)
        self.assertIn("$120.00", answer)
        self.assertIn("Gold", answer)
        self.assertIn("$300.00", answer)

    def test_packages_question_excludes_unavailable_packages(self) -> None:
        answer = self.answerer.answer("What are your prices?", PACKAGES_CONTEXT)
        self.assertNotIn("Legacy", answer)

    def test_packages_question_with_no_packages(self) -> None:
        self.assertEqual(
            self.answerer.answer("What packages do you offer?", CONTEXT),
            NO_PACKAGES_MESSAGE,
        )

    def test_packages_question_with_only_unavailable_packages(self) -> None:
        context = replace(
            CONTEXT, packages=[_resolved_package(1002, "Legacy", 9000, False)]
        )
        self.assertEqual(
            self.answerer.answer("What offers are available?", context),
            NO_PACKAGES_MESSAGE,
        )

    def test_promo_question_lists_active_promo_codes(self) -> None:
        answer = self.answerer.answer(
            "Do you have any promos?", SAN_FRANCISCO_SUMMER_CONTEXT
        )
        self.assertIn("SUMMER", answer)

    def test_promo_question_with_no_active_promos(self) -> None:
        self.assertEqual(
            self.answerer.answer("Is any promo active?", ROSEVILLE_CONTEXT),
            NO_PROMOS_MESSAGE,
        )

    def test_san_francisco_summer_promo_reported_active(self) -> None:
        answer = self.answerer.answer(
            "Is the summer promo active?", SAN_FRANCISCO_SUMMER_CONTEXT
        )
        self.assertNotEqual(answer, NO_PROMOS_MESSAGE)
        self.assertIn("SUMMER", answer)
        self.assertIn("active", answer.lower())

    def test_roseville_summer_promo_reports_no_active_promos(self) -> None:
        self.assertEqual(
            self.answerer.answer("Is the summer promo active?", ROSEVILLE_CONTEXT),
            NO_PROMOS_MESSAGE,
        )

    def test_room_question_extracts_group_size(self) -> None:
        answer = self.answerer.answer(
            "Which room fits group size 8?", ROOMS_CONTEXT
        )
        self.assertIn("group of 8", answer)

    def test_room_question_calls_rooms_fitting(self) -> None:
        with mock.patch.object(
            resolution, "rooms_fitting", wraps=resolution.rooms_fitting
        ) as rooms_fitting:
            self.answerer.answer("Which room fits 8 people?", ROOMS_CONTEXT)
        rooms_fitting.assert_called_once_with(ROOMS_CONTEXT.resources, 8)

    def test_room_question_lists_fitting_names_and_capacities(self) -> None:
        answer = self.answerer.answer("Which room fits 8 guests?", ROOMS_CONTEXT)
        self.assertIn("Room A", answer)
        self.assertIn("capacity 8", answer)
        self.assertIn("Room B", answer)
        self.assertIn("capacity 20", answer)

    def test_room_question_with_no_fitting_room(self) -> None:
        self.assertEqual(
            self.answerer.answer("Which room fits 500 people?", ROOMS_CONTEXT),
            NO_ROOM_MESSAGE,
        )

    def test_room_question_without_group_size_asks_for_it(self) -> None:
        self.assertEqual(
            self.answerer.answer("Which room can I book?", ROOMS_CONTEXT),
            GROUP_SIZE_PROMPT,
        )

    def test_packages_answer_formats_price_in_dollars(self) -> None:
        context = replace(
            CONTEXT, packages=[_resolved_package(1003, "Deluxe", 12999, True)]
        )
        answer = self.answerer.answer("What are your prices?", context)
        self.assertIn("$129.99", answer)

    def test_room_answer_sorts_fitting_rooms_by_capacity_ascending(self) -> None:
        rooms = [
            _resource(7002, "Grand", 40),
            _resource(7000, "Nook", 6),
            _resource(7001, "Hall", 25),
        ]
        context = replace(CONTEXT, resources=rooms)
        with mock.patch.object(
            resolution, "rooms_fitting", return_value=list(rooms)
        ):
            answer = self.answerer.answer("Which room fits 4 people?", context)
        self.assertLess(answer.index("Nook"), answer.index("Hall"))
        self.assertLess(answer.index("Hall"), answer.index("Grand"))

    def test_unknown_question_returns_fallback(self) -> None:
        self.assertEqual(
            self.answerer.answer("What are your opening hours?", CONTEXT),
            FALLBACK_MESSAGE,
        )

    def test_unknown_question_fallback_is_stable(self) -> None:
        first = self.answerer.answer("What are your opening hours?", FULL_CONTEXT)
        second = self.answerer.answer("Do you sell balloons?", FULL_CONTEXT)
        self.assertEqual(first, FALLBACK_MESSAGE)
        self.assertEqual(first, second)

    def test_packages_answer_does_not_leak_promo_or_room_names(self) -> None:
        answer = self.answerer.answer("What packages do you offer?", FULL_CONTEXT)
        self.assertIn("Bronze", answer)
        self.assertNotIn("SUMMER", answer)
        self.assertNotIn("Room A", answer)

    def test_fallback_answer_contains_no_context_names(self) -> None:
        answer = self.answerer.answer("Tell me a joke.", FULL_CONTEXT)
        self.assertEqual(answer, FALLBACK_MESSAGE)
        for name in ("Bronze", "SUMMER", "Room A"):
            self.assertNotIn(name, answer)


class BuildGroundedContextTests(unittest.TestCase):
    def test_contains_location_name_and_city(self) -> None:
        context = build_grounded_context(FULL_CONTEXT)
        self.assertIn("Downtown", context)
        self.assertIn("Portland", context)

    def test_contains_active_package_names_and_prices(self) -> None:
        context = build_grounded_context(FULL_CONTEXT)
        self.assertIn("Bronze", context)
        self.assertIn("$120.00", context)

    def test_excludes_unavailable_packages(self) -> None:
        context = build_grounded_context(PACKAGES_CONTEXT)
        self.assertNotIn("Legacy", context)

    def test_contains_active_promo_codes(self) -> None:
        context = build_grounded_context(FULL_CONTEXT)
        self.assertIn("SUMMER", context)

    def test_contains_resource_names_and_capacities(self) -> None:
        context = build_grounded_context(FULL_CONTEXT)
        self.assertIn("Room A", context)
        self.assertIn("capacity 8", context)

    def test_is_deterministic_for_same_context(self) -> None:
        self.assertEqual(
            build_grounded_context(FULL_CONTEXT),
            build_grounded_context(FULL_CONTEXT),
        )


class GroundedAssistantAnswererProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.answerer = GroundedAssistantAnswerer()

    def test_provider_receives_original_question(self) -> None:
        provider = _RecordingProvider("Provider answer.")
        with mock.patch.object(
            llm_provider, "get_default_llm_provider", return_value=provider
        ):
            self.answerer.answer("What packages do you offer?", FULL_CONTEXT)
        self.assertEqual(provider.calls[0][0], "What packages do you offer?")

    def test_provider_receives_grounded_context(self) -> None:
        provider = _RecordingProvider("Provider answer.")
        with mock.patch.object(
            llm_provider, "get_default_llm_provider", return_value=provider
        ):
            self.answerer.answer("What packages do you offer?", FULL_CONTEXT)
        self.assertEqual(provider.calls[0][1], build_grounded_context(FULL_CONTEXT))

    def test_provider_success_returns_provider_output(self) -> None:
        provider = _RecordingProvider("Provider answer.")
        with mock.patch.object(
            llm_provider, "get_default_llm_provider", return_value=provider
        ):
            answer = self.answerer.answer("What packages do you offer?", FULL_CONTEXT)
        self.assertEqual(answer, "Provider answer.")

    def test_not_implemented_error_falls_back_to_deterministic(self) -> None:
        with mock.patch.object(
            llm_provider,
            "get_default_llm_provider",
            return_value=DisabledLLMProvider(),
        ):
            answer = self.answerer.answer("What packages do you offer?", FULL_CONTEXT)
        self.assertIn("Bronze", answer)

    def test_unexpected_exception_falls_back_to_deterministic(self) -> None:
        provider = mock.Mock()
        provider.generate.side_effect = RuntimeError("boom")
        with mock.patch.object(
            llm_provider, "get_default_llm_provider", return_value=provider
        ):
            answer = self.answerer.answer("What packages do you offer?", FULL_CONTEXT)
        self.assertIn("Bronze", answer)

    def test_unexpected_exception_fallback_matches_deterministic_answer(self) -> None:
        provider = mock.Mock()
        provider.generate.side_effect = ValueError("boom")
        with mock.patch.object(
            llm_provider, "get_default_llm_provider", return_value=provider
        ):
            answer = self.answerer.answer("Which room fits 8 people?", ROOMS_CONTEXT)
        self.assertIn("group of 8", answer)

    def test_default_provider_disabled_uses_deterministic_response(self) -> None:
        answer = self.answerer.answer("What packages do you offer?", PACKAGES_CONTEXT)
        self.assertEqual(
            answer, "Available party packages: Bronze ($120.00), Gold ($300.00)."
        )


if __name__ == "__main__":
    unittest.main()

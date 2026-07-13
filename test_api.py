from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from unittest import mock

from fastapi.testclient import TestClient

import main
from assistant_answerer import NO_PACKAGES_MESSAGE
from assistant_context import AssistantContext
from repository import LocationSummary
from resolution import (
    Package,
    PackageOverride,
    Promo,
    PromoOverride,
    ResolvedPackage,
    Resource,
)

SEED_LOCATIONS = [
    LocationSummary(id=10, company_id=1, name="Downtown", city="Portland"),
    LocationSummary(id=11, company_id=1, name="Uptown", city="Seattle"),
    LocationSummary(id=12, company_id=1, name="Airport", city="Denver"),
]

SEED_LOCATION = LocationSummary(id=10, company_id=1, name="Downtown", city="Portland")

SEED_PACKAGES = [
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
    Package(
        id=1002,
        company_id=1,
        name="Legacy",
        description="Retired package",
        base_price_cents=9000,
        size_tier_id=100,
        active=False,
    ),
]

SEED_PACKAGE_OVERRIDES = {
    1000: PackageOverride(
        package_id=1000, location_id=10, price_cents=12000, available=True
    ),
    1001: PackageOverride(
        package_id=1001, location_id=10, price_cents=None, available=False
    ),
}


def _packages_return() -> tuple[list[Package], dict[int, PackageOverride]]:
    return list(SEED_PACKAGES), dict(SEED_PACKAGE_OVERRIDES)


SEED_LOCATION_UPTOWN = LocationSummary(
    id=11, company_id=1, name="Uptown", city="Seattle"
)

SEED_PROMOS = [
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
        id=3001,
        company_id=1,
        code="SUMMER",
        description="Summer discount",
        discount_percent=20,
        starts_on=date(2026, 6, 1),
        ends_on=date(2026, 8, 31),
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

SUMMER_OFF_OVERRIDES = {
    3000: PromoOverride(
        promo_id=3000, location_id=10, discount_percent=15, active=True
    ),
    3001: PromoOverride(
        promo_id=3001, location_id=10, discount_percent=None, active=False
    ),
}

FIXED_NOW = datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)


def _promos_return() -> tuple[list[Promo], dict[int, PromoOverride]]:
    return list(SEED_PROMOS), dict(SUMMER_OFF_OVERRIDES)


SEED_RESOURCES = [
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


class LocationsEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)

    def test_get_locations_returns_ok(self) -> None:
        with mock.patch.object(
            main.repository, "list_locations", return_value=list(SEED_LOCATIONS)
        ):
            response = self.client.get("/locations")
        self.assertEqual(response.status_code, 200)

    def test_get_locations_returns_three_seed_locations(self) -> None:
        with mock.patch.object(
            main.repository, "list_locations", return_value=list(SEED_LOCATIONS)
        ):
            response = self.client.get("/locations")
        self.assertEqual(len(response.json()), 3)

    def test_get_locations_includes_id_name_city(self) -> None:
        with mock.patch.object(
            main.repository, "list_locations", return_value=list(SEED_LOCATIONS)
        ):
            response = self.client.get("/locations")
        payload = response.json()
        self.assertEqual(payload[0], {"id": 10, "name": "Downtown", "city": "Portland"})
        for item in payload:
            self.assertEqual(set(item), {"id", "name", "city"})

    def test_get_locations_excludes_company_id(self) -> None:
        with mock.patch.object(
            main.repository, "list_locations", return_value=list(SEED_LOCATIONS)
        ):
            response = self.client.get("/locations")
        for item in response.json():
            self.assertNotIn("company_id", item)

    def test_get_locations_sorted_by_id_ascending(self) -> None:
        with mock.patch.object(
            main.repository, "list_locations", return_value=list(SEED_LOCATIONS)
        ):
            response = self.client.get("/locations")
        ids = [item["id"] for item in response.json()]
        self.assertEqual(ids, sorted(ids))

    def test_get_locations_empty_returns_empty_list(self) -> None:
        with mock.patch.object(main.repository, "list_locations", return_value=[]):
            response = self.client.get("/locations")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_get_locations_uses_company_id_one(self) -> None:
        with mock.patch.object(
            main.repository, "list_locations", return_value=list(SEED_LOCATIONS)
        ) as list_locations:
            self.client.get("/locations")
        list_locations.assert_called_once_with(1)


class PackagesEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)

    def test_known_location_returns_ok(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_packages_for_location",
                return_value=_packages_return(),
            ),
        ):
            response = self.client.get("/locations/10/packages")
        self.assertEqual(response.status_code, 200)

    def test_unknown_location_returns_404(self) -> None:
        with mock.patch.object(main.repository, "get_location", return_value=None):
            response = self.client.get("/locations/88888/packages")
        self.assertEqual(response.status_code, 404)

    def test_calls_repository_with_company_id_and_location_id(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ) as get_location,
            mock.patch.object(
                main.repository,
                "load_packages_for_location",
                return_value=_packages_return(),
            ) as load_packages,
        ):
            self.client.get("/locations/10/packages")
        get_location.assert_called_once_with(1, 10)
        load_packages.assert_called_once_with(1, 10)

    def test_returns_resolved_packages(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_packages_for_location",
                return_value=_packages_return(),
            ),
        ):
            response = self.client.get("/locations/10/packages")
        by_id = {item["id"]: item for item in response.json()}
        self.assertEqual(
            by_id[1000],
            {
                "id": 1000,
                "name": "Bronze",
                "description": "Bronze party package",
                "price_cents": 12000,
                "is_active": True,
            },
        )

    def test_location_excludes_unavailable_package(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_packages_for_location",
                return_value=_packages_return(),
            ),
        ):
            response = self.client.get("/locations/10/packages")
        ids = [item["id"] for item in response.json()]
        self.assertIn(1000, ids)
        self.assertNotIn(1001, ids)

    def test_response_excludes_company_id(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_packages_for_location",
                return_value=_packages_return(),
            ),
        ):
            response = self.client.get("/locations/10/packages")
        for item in response.json():
            self.assertNotIn("company_id", item)
            self.assertEqual(
                set(item),
                {"id", "name", "description", "price_cents", "is_active"},
            )

    def test_disabled_packages_excluded_by_resolution_engine(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_packages_for_location",
                return_value=_packages_return(),
            ),
        ):
            response = self.client.get("/locations/10/packages")
        ids = [item["id"] for item in response.json()]
        self.assertNotIn(1002, ids)

    def test_empty_package_list_returns_empty(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_packages_for_location",
                return_value=([], {}),
            ),
        ):
            response = self.client.get("/locations/10/packages")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])


class ActivePromosEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)

    def test_known_location_returns_ok(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_promos_for_location",
                return_value=_promos_return(),
            ),
            mock.patch.object(main, "_utc_now", return_value=FIXED_NOW),
        ):
            response = self.client.get("/locations/10/promos/active")
        self.assertEqual(response.status_code, 200)

    def test_unknown_location_returns_404(self) -> None:
        with mock.patch.object(main.repository, "get_location", return_value=None):
            response = self.client.get("/locations/88888/promos/active")
        self.assertEqual(response.status_code, 404)

    def test_calls_repository_with_company_id_and_location_id(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ) as get_location,
            mock.patch.object(
                main.repository,
                "load_promos_for_location",
                return_value=_promos_return(),
            ) as load_promos,
            mock.patch.object(main, "_utc_now", return_value=FIXED_NOW),
        ):
            self.client.get("/locations/10/promos/active")
        get_location.assert_called_once_with(1, 10)
        load_promos.assert_called_once_with(1, 10)

    def test_calls_active_promos_with_timezone_aware_utc_now(self) -> None:
        self.assertIs(main._utc_now().tzinfo, timezone.utc)
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_promos_for_location",
                return_value=_promos_return(),
            ),
            mock.patch.object(main, "_utc_now", return_value=FIXED_NOW),
            mock.patch.object(
                main.resolution,
                "active_promos",
                wraps=main.resolution.active_promos,
            ) as active_promos,
        ):
            self.client.get("/locations/10/promos/active")
        active_promos.assert_called_once_with(
            list(SEED_PROMOS), dict(SUMMER_OFF_OVERRIDES), on=FIXED_NOW.date()
        )

    def test_returns_resolved_active_promos(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_promos_for_location",
                return_value=_promos_return(),
            ),
            mock.patch.object(main, "_utc_now", return_value=FIXED_NOW),
        ):
            response = self.client.get("/locations/10/promos/active")
        self.assertEqual(
            response.json(),
            [
                {
                    "id": 3000,
                    "code": "SAVE10",
                    "description": "Ten percent off",
                    "discount_percent": 15,
                    "starts_on": "2026-01-01",
                    "ends_on": "2026-12-31",
                }
            ],
        )

    def test_summer_promo_shown_when_not_overridden_off(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION_UPTOWN
            ),
            mock.patch.object(
                main.repository,
                "load_promos_for_location",
                return_value=(list(SEED_PROMOS), {}),
            ),
            mock.patch.object(main, "_utc_now", return_value=FIXED_NOW),
        ):
            response = self.client.get("/locations/11/promos/active")
        by_id = {item["id"]: item for item in response.json()}
        self.assertIn(3001, by_id)
        self.assertEqual(by_id[3001]["code"], "SUMMER")
        self.assertEqual(by_id[3001]["discount_percent"], 20)

    def test_summer_promo_excluded_when_overridden_off(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_promos_for_location",
                return_value=_promos_return(),
            ),
            mock.patch.object(main, "_utc_now", return_value=FIXED_NOW),
        ):
            response = self.client.get("/locations/10/promos/active")
        ids = [item["id"] for item in response.json()]
        self.assertNotIn(3001, ids)

    def test_response_excludes_company_id(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_promos_for_location",
                return_value=_promos_return(),
            ),
            mock.patch.object(main, "_utc_now", return_value=FIXED_NOW),
        ):
            response = self.client.get("/locations/10/promos/active")
        for item in response.json():
            self.assertNotIn("company_id", item)
            self.assertEqual(
                set(item),
                {
                    "id",
                    "code",
                    "description",
                    "discount_percent",
                    "starts_on",
                    "ends_on",
                },
            )

    def test_empty_promo_list_returns_empty(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_promos_for_location",
                return_value=([], {}),
            ),
            mock.patch.object(main, "_utc_now", return_value=FIXED_NOW),
        ):
            response = self.client.get("/locations/10/promos/active")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])


class RoomsEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)

    def test_known_location_returns_ok(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_resources_for_location",
                return_value=list(SEED_RESOURCES),
            ),
        ):
            response = self.client.get("/locations/10/rooms?group_size=8")
        self.assertEqual(response.status_code, 200)

    def test_unknown_location_returns_404(self) -> None:
        with mock.patch.object(main.repository, "get_location", return_value=None):
            response = self.client.get("/locations/88888/rooms?group_size=8")
        self.assertEqual(response.status_code, 404)

    def test_group_size_zero_returns_400(self) -> None:
        response = self.client.get("/locations/10/rooms?group_size=0")
        self.assertEqual(response.status_code, 400)

    def test_group_size_negative_returns_400(self) -> None:
        response = self.client.get("/locations/10/rooms?group_size=-5")
        self.assertEqual(response.status_code, 400)

    def test_calls_repository_with_company_id_and_location_id(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ) as get_location,
            mock.patch.object(
                main.repository,
                "load_resources_for_location",
                return_value=list(SEED_RESOURCES),
            ) as load_resources,
        ):
            self.client.get("/locations/10/rooms?group_size=8")
        get_location.assert_called_once_with(1, 10)
        load_resources.assert_called_once_with(1, 10)

    def test_calls_rooms_fitting_with_resources_and_group_size(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_resources_for_location",
                return_value=list(SEED_RESOURCES),
            ),
            mock.patch.object(
                main.resolution,
                "rooms_fitting",
                wraps=main.resolution.rooms_fitting,
            ) as rooms_fitting,
        ):
            self.client.get("/locations/10/rooms?group_size=8")
        rooms_fitting.assert_called_once_with(list(SEED_RESOURCES), 8)

    def test_returns_fitting_rooms(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_resources_for_location",
                return_value=list(SEED_RESOURCES),
            ),
        ):
            response = self.client.get("/locations/10/rooms?group_size=8")
        ids = [item["id"] for item in response.json()]
        self.assertEqual(ids, [7000, 7001])

    def test_response_excludes_company_id(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_resources_for_location",
                return_value=list(SEED_RESOURCES),
            ),
        ):
            response = self.client.get("/locations/10/rooms?group_size=8")
        for item in response.json():
            self.assertNotIn("company_id", item)
            self.assertEqual(
                set(item),
                {"id", "name", "capacity", "size_tier_id"},
            )

    def test_empty_resources_returns_empty(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_resources_for_location",
                return_value=[],
            ),
        ):
            response = self.client.get("/locations/10/rooms?group_size=8")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_group_size_twenty_returns_only_large_room(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository,
                "load_resources_for_location",
                return_value=list(SEED_RESOURCES),
            ),
        ):
            response = self.client.get("/locations/10/rooms?group_size=20")
        self.assertEqual(
            response.json(),
            [
                {
                    "id": 7001,
                    "name": "Room B",
                    "capacity": 20,
                    "size_tier_id": 101,
                }
            ],
        )


ASK_CONTEXT = AssistantContext(
    location_id=10,
    location_name="Downtown",
    city="Portland",
    packages=[],
    active_promos=[],
    resources=[],
)

GROUNDED_ASK_CONTEXT = AssistantContext(
    location_id=10,
    location_name="Downtown",
    city="Portland",
    packages=[
        ResolvedPackage(
            package=Package(
                id=1000,
                company_id=1,
                name="Bronze",
                description="Bronze party package",
                base_price_cents=12000,
                size_tier_id=100,
                active=True,
            ),
            price_cents=12000,
            available=True,
        )
    ],
    active_promos=[],
    resources=[],
)


class AskEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)

    def test_known_location_returns_ok(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ),
            mock.patch.object(main.repository, "log_question", return_value=None),
        ):
            response = self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        self.assertEqual(response.status_code, 200)

    def test_unknown_location_returns_404(self) -> None:
        with mock.patch.object(
            main.assistant_context, "build_assistant_context", return_value=None
        ):
            response = self.client.post(
                "/locations/88888/ask",
                json={"question": "What packages do you offer?"},
            )
        self.assertEqual(response.status_code, 404)

    def test_empty_question_returns_400(self) -> None:
        response = self.client.post("/locations/10/ask", json={"question": ""})
        self.assertEqual(response.status_code, 400)

    def test_whitespace_question_returns_400(self) -> None:
        response = self.client.post("/locations/10/ask", json={"question": "   "})
        self.assertEqual(response.status_code, 400)

    def test_response_includes_answer(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ),
            mock.patch.object(main.repository, "log_question", return_value=None),
        ):
            response = self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        self.assertEqual(response.json(), {"answer": NO_PACKAGES_MESSAGE})

    def test_logs_question_with_location_id_original_question_and_answer(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ),
            mock.patch.object(
                main.repository, "log_question", return_value=None
            ) as log_question,
        ):
            self.client.post(
                "/locations/10/ask",
                json={"question": "  What packages?  "},
            )
        log_question.assert_called_once_with(
            10, "  What packages?  ", NO_PACKAGES_MESSAGE
        )

    def test_uses_context_builder_with_company_id_location_id_and_now(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ) as build_context,
            mock.patch.object(main.repository, "log_question", return_value=None),
            mock.patch.object(main, "_utc_now", return_value=FIXED_NOW),
        ):
            self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        build_context.assert_called_once_with(1, 10, FIXED_NOW)

    def test_calls_answerer_with_question_and_context(self) -> None:
        answerer = mock.Mock()
        answerer.answer.return_value = "Assistant is not enabled yet."
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ),
            mock.patch.object(
                main.assistant_answerer,
                "get_default_answerer",
                return_value=answerer,
            ),
            mock.patch.object(main.repository, "log_question", return_value=None),
        ):
            self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        answerer.answer.assert_called_once_with(
            "What packages do you offer?", ASK_CONTEXT
        )

    def test_logs_answer_returned_by_answerer(self) -> None:
        answerer = mock.Mock()
        answerer.answer.return_value = "A tailored answer."
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ),
            mock.patch.object(
                main.assistant_answerer,
                "get_default_answerer",
                return_value=answerer,
            ),
            mock.patch.object(
                main.repository, "log_question", return_value=None
            ) as log_question,
        ):
            self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        log_question.assert_called_once_with(
            10, "What packages do you offer?", "A tailored answer."
        )

    def test_response_returns_answerer_output(self) -> None:
        answerer = mock.Mock()
        answerer.answer.return_value = "A tailored answer."
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ),
            mock.patch.object(
                main.assistant_answerer,
                "get_default_answerer",
                return_value=answerer,
            ),
            mock.patch.object(main.repository, "log_question", return_value=None),
        ):
            response = self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        self.assertEqual(response.json(), {"answer": "A tailored answer."})

    def test_ask_returns_grounded_answer(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=GROUNDED_ASK_CONTEXT,
            ),
            mock.patch.object(main.repository, "log_question", return_value=None),
        ):
            response = self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        answer = response.json()["answer"]
        self.assertIn("Bronze", answer)
        self.assertIn("$120.00", answer)

    def test_ask_logs_grounded_answer(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=GROUNDED_ASK_CONTEXT,
            ),
            mock.patch.object(
                main.repository, "log_question", return_value=None
            ) as log_question,
        ):
            self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        location_id, question, logged_answer = log_question.call_args.args
        self.assertEqual(location_id, 10)
        self.assertEqual(question, "What packages do you offer?")
        self.assertIn("Bronze", logged_answer)

    def test_provider_output_returned_and_logged(self) -> None:
        provider = mock.Mock()
        provider.generate.return_value = "Grounded provider answer."
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=GROUNDED_ASK_CONTEXT,
            ),
            mock.patch.object(
                main.assistant_answerer.llm_provider,
                "get_default_llm_provider",
                return_value=provider,
            ),
            mock.patch.object(
                main.repository, "log_question", return_value=None
            ) as log_question,
        ):
            response = self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        self.assertEqual(response.json(), {"answer": "Grounded provider answer."})
        log_question.assert_called_once_with(
            10, "What packages do you offer?", "Grounded provider answer."
        )

    def test_passes_stripped_question_to_answerer(self) -> None:
        answerer = mock.Mock()
        answerer.answer.return_value = "A tailored answer."
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ),
            mock.patch.object(
                main.assistant_answerer,
                "get_default_answerer",
                return_value=answerer,
            ),
            mock.patch.object(main.repository, "log_question", return_value=None),
        ):
            self.client.post(
                "/locations/10/ask",
                json={"question": "  What packages do you offer?  "},
            )
        answerer.answer.assert_called_once_with(
            "What packages do you offer?", ASK_CONTEXT
        )

    def test_logs_original_unstripped_question(self) -> None:
        answerer = mock.Mock()
        answerer.answer.return_value = "A tailored answer."
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ),
            mock.patch.object(
                main.assistant_answerer,
                "get_default_answerer",
                return_value=answerer,
            ),
            mock.patch.object(
                main.repository, "log_question", return_value=None
            ) as log_question,
        ):
            self.client.post(
                "/locations/10/ask",
                json={"question": "  What packages do you offer?  "},
            )
        log_question.assert_called_once_with(
            10, "  What packages do you offer?  ", "A tailored answer."
        )

    def test_answerer_exception_returns_500(self) -> None:
        answerer = mock.Mock()
        answerer.answer.side_effect = RuntimeError("boom")
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ),
            mock.patch.object(
                main.assistant_answerer,
                "get_default_answerer",
                return_value=answerer,
            ),
            mock.patch.object(main.repository, "log_question", return_value=None),
        ):
            response = self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        self.assertEqual(response.status_code, 500)

    def test_answerer_exception_does_not_log(self) -> None:
        answerer = mock.Mock()
        answerer.answer.side_effect = RuntimeError("boom")
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ),
            mock.patch.object(
                main.assistant_answerer,
                "get_default_answerer",
                return_value=answerer,
            ),
            mock.patch.object(
                main.repository, "log_question", return_value=None
            ) as log_question,
        ):
            self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        log_question.assert_not_called()

    def test_log_question_exception_returns_500(self) -> None:
        answerer = mock.Mock()
        answerer.answer.return_value = "A tailored answer."
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ),
            mock.patch.object(
                main.assistant_answerer,
                "get_default_answerer",
                return_value=answerer,
            ),
            mock.patch.object(
                main.repository,
                "log_question",
                side_effect=RuntimeError("db down"),
            ),
        ):
            response = self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        self.assertEqual(response.status_code, 500)

    def test_log_question_exception_does_not_return_answer(self) -> None:
        answerer = mock.Mock()
        answerer.answer.return_value = "A tailored answer."
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=ASK_CONTEXT,
            ),
            mock.patch.object(
                main.assistant_answerer,
                "get_default_answerer",
                return_value=answerer,
            ),
            mock.patch.object(
                main.repository,
                "log_question",
                side_effect=RuntimeError("db down"),
            ),
        ):
            response = self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        self.assertNotIn("answer", response.json())


class SetPackageActiveEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)

    def test_success_returns_200(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository, "set_location_package_active", return_value=True
            ) as set_active,
        ):
            response = self.client.patch(
                "/locations/10/packages/1000/active", json={"is_active": False}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"success": True})
        set_active.assert_called_once_with(1, 10, 1000, False)

    def test_unknown_location_returns_404(self) -> None:
        with mock.patch.object(main.repository, "get_location", return_value=None):
            response = self.client.patch(
                "/locations/88888/packages/1000/active", json={"is_active": False}
            )
        self.assertEqual(response.status_code, 404)

    def test_unknown_package_returns_404(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository, "set_location_package_active", return_value=False
            ),
        ):
            response = self.client.patch(
                "/locations/10/packages/999999/active", json={"is_active": True}
            )
        self.assertEqual(response.status_code, 404)


class SetPromoActiveEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)

    def test_success_returns_200(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository, "set_location_promo_active", return_value=True
            ) as set_active,
        ):
            response = self.client.patch(
                "/locations/10/promos/3000/active", json={"is_active": False}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"success": True})
        set_active.assert_called_once_with(1, 10, 3000, False)

    def test_unknown_promo_returns_404(self) -> None:
        with (
            mock.patch.object(
                main.repository, "get_location", return_value=SEED_LOCATION
            ),
            mock.patch.object(
                main.repository, "set_location_promo_active", return_value=False
            ),
        ):
            response = self.client.patch(
                "/locations/10/promos/999999/active", json={"is_active": True}
            )
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()

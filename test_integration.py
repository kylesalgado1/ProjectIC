from __future__ import annotations

import os
import unittest
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

import main
from assistant_answerer import FALLBACK_MESSAGE, NO_PROMOS_MESSAGE

DATABASE_URL = os.environ.get("DATABASE_URL")

DOWNTOWN_ID = 10
UPTOWN_ID = 11
SAN_FRANCISCO_ID = 13
RIVAL_LOCATION_ID = 20
UNKNOWN_LOCATION_ID = 88888
BRONZE_PACKAGE_ID = 1000
GOLD_PACKAGE_ID = 1001
LEGACY_PACKAGE_ID = 1002
ULTIMATE_COMBO_PACKAGE_ID = 1003
RIVAL_PACKAGE_ID = 2000
UNKNOWN_PACKAGE_ID = 99999
SAVE10_PROMO_ID = 3000
SUMMER_PROMO_ID = 3001
RIVAL_PROMO_ID = 4000
UNKNOWN_PROMO_ID = 99999
LARGE_ROOM_ID = 7001
PACKAGES_QUESTION = "What party packages do you offer?"
SUMMER_PROMO_QUESTION = "Is the summer promo running?"
FIXED_NOW = datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)
FUTURE_NOW = datetime(2027, 1, 1, 12, 0, tzinfo=timezone.utc)


def _load_fixtures() -> None:
    import psycopg

    assert DATABASE_URL is not None
    here = Path(__file__).resolve().parent
    schema = (here / "schema.sql").read_text(encoding="utf-8")
    seed = (here / "seed.sql").read_text(encoding="utf-8")
    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute(schema)
        conn.execute(seed)
        conn.commit()


@dataclass(frozen=True)
class _QuestionLogRow:
    location_id: int
    question: str
    answer: str


def _clear_question_log() -> None:
    import psycopg

    assert DATABASE_URL is not None
    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute("DELETE FROM question_log")
        conn.commit()


def _question_log_rows() -> list[_QuestionLogRow]:
    import psycopg
    from psycopg.rows import class_row

    assert DATABASE_URL is not None
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor(row_factory=class_row(_QuestionLogRow)) as cursor:
            cursor.execute(
                "SELECT location_id, question, answer FROM question_log ORDER BY id"
            )
            return cursor.fetchall()


@unittest.skipUnless(DATABASE_URL, "DATABASE_URL is not set")
class IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _load_fixtures()

    def setUp(self) -> None:
        self.client = TestClient(main.app)

    def test_list_locations_returns_four_seed_locations(self) -> None:
        response = self.client.get("/locations")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 4)
        self.assertEqual([item["id"] for item in payload], [10, 11, 12, 13])
        for item in payload:
            self.assertNotIn("company_id", item)

    def test_packages_exclude_override_disabled_package(self) -> None:
        response = self.client.get(f"/locations/{DOWNTOWN_ID}/packages")
        self.assertEqual(response.status_code, 200)
        ids = [item["id"] for item in response.json()]
        self.assertIn(BRONZE_PACKAGE_ID, ids)
        self.assertNotIn(GOLD_PACKAGE_ID, ids)
        self.assertNotIn(LEGACY_PACKAGE_ID, ids)

    def test_active_promos_include_summer_promo(self) -> None:
        with mock.patch.object(main, "_utc_now", return_value=FIXED_NOW):
            response = self.client.get(f"/locations/{UPTOWN_ID}/promos/active")
        self.assertEqual(response.status_code, 200)
        by_id = {item["id"]: item for item in response.json()}
        self.assertIn(SUMMER_PROMO_ID, by_id)
        self.assertEqual(by_id[SUMMER_PROMO_ID]["code"], "SUMMER")
        self.assertEqual(by_id[SUMMER_PROMO_ID]["discount_percent"], 20)

    def test_active_promos_exclude_summer_promo_when_overridden_off(self) -> None:
        with mock.patch.object(main, "_utc_now", return_value=FIXED_NOW):
            response = self.client.get(f"/locations/{DOWNTOWN_ID}/promos/active")
        self.assertEqual(response.status_code, 200)
        ids = [item["id"] for item in response.json()]
        self.assertNotIn(SUMMER_PROMO_ID, ids)

    def test_rooms_return_only_resources_that_fit_group_size(self) -> None:
        response = self.client.get(f"/locations/{DOWNTOWN_ID}/rooms?group_size=20")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([item["id"] for item in payload], [LARGE_ROOM_ID])
        self.assertTrue(all(item["capacity"] >= 20 for item in payload))

    def test_packages_unknown_location_returns_404(self) -> None:
        response = self.client.get(f"/locations/{UNKNOWN_LOCATION_ID}/packages")
        self.assertEqual(response.status_code, 404)

    def test_active_promos_unknown_location_returns_404(self) -> None:
        response = self.client.get(f"/locations/{UNKNOWN_LOCATION_ID}/promos/active")
        self.assertEqual(response.status_code, 404)

    def test_rooms_unknown_location_returns_404(self) -> None:
        response = self.client.get(
            f"/locations/{UNKNOWN_LOCATION_ID}/rooms?group_size=8"
        )
        self.assertEqual(response.status_code, 404)

    def test_packages_other_company_location_returns_404(self) -> None:
        response = self.client.get(f"/locations/{RIVAL_LOCATION_ID}/packages")
        self.assertEqual(response.status_code, 404)

    def test_active_promos_other_company_location_returns_404(self) -> None:
        with mock.patch.object(main, "_utc_now", return_value=FIXED_NOW):
            response = self.client.get(
                f"/locations/{RIVAL_LOCATION_ID}/promos/active"
            )
        self.assertEqual(response.status_code, 404)

    def test_rooms_other_company_location_returns_404(self) -> None:
        response = self.client.get(
            f"/locations/{RIVAL_LOCATION_ID}/rooms?group_size=8"
        )
        self.assertEqual(response.status_code, 404)

    def test_rooms_non_positive_group_size_returns_400(self) -> None:
        zero = self.client.get(f"/locations/{DOWNTOWN_ID}/rooms?group_size=0")
        negative = self.client.get(f"/locations/{DOWNTOWN_ID}/rooms?group_size=-5")
        self.assertEqual(zero.status_code, 400)
        self.assertEqual(negative.status_code, 400)


@unittest.skipUnless(DATABASE_URL, "DATABASE_URL is not set")
class AskIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _load_fixtures()

    def setUp(self) -> None:
        _clear_question_log()
        self.client = TestClient(main.app)

    def test_ask_reports_active_summer_promo(self) -> None:
        with mock.patch.object(main, "_utc_now", return_value=FIXED_NOW):
            response = self.client.post(
                f"/locations/{UPTOWN_ID}/ask",
                json={"question": "Is the summer promo running?"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertIn("SUMMER", response.json()["answer"])

    def test_ask_omits_summer_promo_when_not_active(self) -> None:
        with mock.patch.object(main, "_utc_now", return_value=FIXED_NOW):
            response = self.client.post(
                f"/locations/{DOWNTOWN_ID}/ask",
                json={"question": "Is the summer promo running?"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("SUMMER", response.json()["answer"])

    def test_ask_returns_room_fitting_group_size(self) -> None:
        response = self.client.post(
            f"/locations/{DOWNTOWN_ID}/ask",
            json={"question": "Which room fits 20 people?"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("Room B", response.json()["answer"])

    def test_ask_lists_available_packages_and_excludes_disabled(self) -> None:
        response = self.client.post(
            f"/locations/{DOWNTOWN_ID}/ask",
            json={"question": "What party packages do you offer?"},
        )
        self.assertEqual(response.status_code, 200)
        answer = response.json()["answer"]
        self.assertIn("Bronze", answer)
        self.assertIn("$120.00", answer)
        self.assertNotIn("Gold", answer)
        self.assertNotIn("Legacy", answer)

    def test_ask_unknown_location_returns_404(self) -> None:
        response = self.client.post(
            f"/locations/{UNKNOWN_LOCATION_ID}/ask",
            json={"question": "What party packages do you offer?"},
        )
        self.assertEqual(response.status_code, 404)

    def test_ask_other_company_location_returns_404_and_does_not_log(self) -> None:
        response = self.client.post(
            f"/locations/{RIVAL_LOCATION_ID}/ask",
            json={"question": "What party packages do you offer?"},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(_question_log_rows(), [])

    def test_ask_empty_question_returns_400(self) -> None:
        response = self.client.post(
            f"/locations/{DOWNTOWN_ID}/ask", json={"question": ""}
        )
        self.assertEqual(response.status_code, 400)

    def test_ask_whitespace_question_returns_400(self) -> None:
        response = self.client.post(
            f"/locations/{DOWNTOWN_ID}/ask", json={"question": "   "}
        )
        self.assertEqual(response.status_code, 400)

    def test_valid_ask_inserts_one_question_log_row(self) -> None:
        self.client.post(
            f"/locations/{DOWNTOWN_ID}/ask",
            json={"question": "What party packages do you offer?"},
        )
        self.assertEqual(len(_question_log_rows()), 1)

    def test_question_log_stores_location_id(self) -> None:
        self.client.post(
            f"/locations/{DOWNTOWN_ID}/ask",
            json={"question": "What party packages do you offer?"},
        )
        rows = _question_log_rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].location_id, DOWNTOWN_ID)

    def test_question_log_stores_original_question(self) -> None:
        question = "  What party packages do you offer?  "
        self.client.post(
            f"/locations/{DOWNTOWN_ID}/ask", json={"question": question}
        )
        rows = _question_log_rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].question, question)

    def test_question_log_stores_returned_answer(self) -> None:
        response = self.client.post(
            f"/locations/{DOWNTOWN_ID}/ask",
            json={"question": "What party packages do you offer?"},
        )
        rows = _question_log_rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].answer, response.json()["answer"])

    def test_ask_reports_no_active_promos_when_none_active(self) -> None:
        with mock.patch.object(main, "_utc_now", return_value=FUTURE_NOW):
            response = self.client.post(
                f"/locations/{DOWNTOWN_ID}/ask",
                json={"question": "Is any promo active?"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["answer"], NO_PROMOS_MESSAGE)

    def test_ask_room_answer_includes_capacity(self) -> None:
        response = self.client.post(
            f"/locations/{DOWNTOWN_ID}/ask",
            json={"question": "Which room fits 8 people?"},
        )
        self.assertEqual(response.status_code, 200)
        answer = response.json()["answer"]
        self.assertIn("capacity 8", answer)
        self.assertIn("capacity 20", answer)

    def test_ask_room_answer_lists_rooms_capacity_ascending(self) -> None:
        response = self.client.post(
            f"/locations/{DOWNTOWN_ID}/ask",
            json={"question": "Which room fits 8 people?"},
        )
        answer = response.json()["answer"]
        self.assertLess(answer.index("Room A"), answer.index("Room B"))

    def test_ask_unknown_question_returns_fallback(self) -> None:
        response = self.client.post(
            f"/locations/{DOWNTOWN_ID}/ask",
            json={"question": "What are your opening hours?"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["answer"], FALLBACK_MESSAGE)


@unittest.skipUnless(DATABASE_URL, "DATABASE_URL is not set")
class ManagerEditingIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        _load_fixtures()
        self.client = TestClient(main.app)

    def test_package_patch_inactive_excludes_package_from_listing(self) -> None:
        before = self.client.get(f"/locations/{UPTOWN_ID}/packages")
        self.assertEqual(before.status_code, 200)
        self.assertIn(BRONZE_PACKAGE_ID, [item["id"] for item in before.json()])
        patch = self.client.patch(
            f"/locations/{UPTOWN_ID}/packages/{BRONZE_PACKAGE_ID}/active",
            json={"is_active": False},
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.json(), {"success": True})
        after = self.client.get(f"/locations/{UPTOWN_ID}/packages")
        self.assertEqual(after.status_code, 200)
        self.assertNotIn(BRONZE_PACKAGE_ID, [item["id"] for item in after.json()])

    def test_promo_patch_inactive_excludes_promo_from_active(self) -> None:
        with mock.patch.object(main, "_utc_now", return_value=FIXED_NOW):
            before = self.client.get(f"/locations/{UPTOWN_ID}/promos/active")
            self.assertEqual(before.status_code, 200)
            self.assertIn(SAVE10_PROMO_ID, [item["id"] for item in before.json()])
            patch = self.client.patch(
                f"/locations/{UPTOWN_ID}/promos/{SAVE10_PROMO_ID}/active",
                json={"is_active": False},
            )
            self.assertEqual(patch.status_code, 200)
            self.assertEqual(patch.json(), {"success": True})
            after = self.client.get(f"/locations/{UPTOWN_ID}/promos/active")
            self.assertEqual(after.status_code, 200)
            self.assertNotIn(SAVE10_PROMO_ID, [item["id"] for item in after.json()])


@unittest.skipUnless(DATABASE_URL, "DATABASE_URL is not set")
class DemoFlowIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        _load_fixtures()
        self.client = TestClient(main.app)

    def _package_ids(self) -> list[int]:
        response = self.client.get(f"/locations/{SAN_FRANCISCO_ID}/packages")
        self.assertEqual(response.status_code, 200)
        return [item["id"] for item in response.json()]

    def _active_promo_ids(self) -> list[int]:
        with mock.patch.object(main, "_utc_now", return_value=FIXED_NOW):
            response = self.client.get(f"/locations/{SAN_FRANCISCO_ID}/promos/active")
        self.assertEqual(response.status_code, 200)
        return [item["id"] for item in response.json()]

    def _ask(self, question: str) -> str:
        with mock.patch.object(main, "_utc_now", return_value=FIXED_NOW):
            response = self.client.post(
                f"/locations/{SAN_FRANCISCO_ID}/ask", json={"question": question}
            )
        self.assertEqual(response.status_code, 200)
        answer: str = response.json()["answer"]
        return answer

    def _set_package_active(self, package_id: int, is_active: bool) -> None:
        response = self.client.patch(
            f"/locations/{SAN_FRANCISCO_ID}/packages/{package_id}/active",
            json={"is_active": is_active},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"success": True})

    def _set_promo_active(self, promo_id: int, is_active: bool) -> None:
        response = self.client.patch(
            f"/locations/{SAN_FRANCISCO_ID}/promos/{promo_id}/active",
            json={"is_active": is_active},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"success": True})

    def test_demo_locations_include_san_francisco(self) -> None:
        response = self.client.get("/locations")
        self.assertEqual(response.status_code, 200)
        by_id = {item["id"]: item for item in response.json()}
        self.assertEqual([10, 11, 12, 13], sorted(by_id))
        self.assertEqual(by_id[SAN_FRANCISCO_ID]["name"], "San Francisco")
        self.assertEqual(by_id[SAN_FRANCISCO_ID]["city"], "San Francisco")

    def test_demo_packages_initially_exclude_ultimate_combo(self) -> None:
        ids = self._package_ids()
        self.assertIn(BRONZE_PACKAGE_ID, ids)
        self.assertNotIn(ULTIMATE_COMBO_PACKAGE_ID, ids)

    def test_demo_ask_initially_excludes_ultimate_combo(self) -> None:
        answer = self._ask(PACKAGES_QUESTION)
        self.assertIn("Bronze", answer)
        self.assertNotIn("Ultimate Combo", answer)

    def test_demo_activating_ultimate_combo_adds_it_to_packages(self) -> None:
        self._set_package_active(ULTIMATE_COMBO_PACKAGE_ID, True)
        self.assertIn(ULTIMATE_COMBO_PACKAGE_ID, self._package_ids())

    def test_demo_activating_ultimate_combo_adds_it_to_ask_answer(self) -> None:
        self._set_package_active(ULTIMATE_COMBO_PACKAGE_ID, True)
        answer = self._ask(PACKAGES_QUESTION)
        self.assertIn("Ultimate Combo", answer)
        self.assertIn("$450.00", answer)

    def test_demo_deactivating_ultimate_combo_removes_it_from_packages(self) -> None:
        self._set_package_active(ULTIMATE_COMBO_PACKAGE_ID, True)
        self.assertIn(ULTIMATE_COMBO_PACKAGE_ID, self._package_ids())
        self._set_package_active(ULTIMATE_COMBO_PACKAGE_ID, False)
        ids = self._package_ids()
        self.assertNotIn(ULTIMATE_COMBO_PACKAGE_ID, ids)
        self.assertIn(BRONZE_PACKAGE_ID, ids)

    def test_demo_deactivating_ultimate_combo_removes_it_from_ask_answer(self) -> None:
        self._set_package_active(ULTIMATE_COMBO_PACKAGE_ID, True)
        self.assertIn("Ultimate Combo", self._ask(PACKAGES_QUESTION))
        self._set_package_active(ULTIMATE_COMBO_PACKAGE_ID, False)
        answer = self._ask(PACKAGES_QUESTION)
        self.assertNotIn("Ultimate Combo", answer)
        self.assertIn("Bronze", answer)

    def test_demo_active_promos_initially_include_summer_promo(self) -> None:
        self.assertIn(SUMMER_PROMO_ID, self._active_promo_ids())

    def test_demo_deactivating_summer_promo_removes_it_from_active_promos(self) -> None:
        self._set_promo_active(SUMMER_PROMO_ID, False)
        ids = self._active_promo_ids()
        self.assertNotIn(SUMMER_PROMO_ID, ids)
        self.assertIn(SAVE10_PROMO_ID, ids)

    def test_demo_deactivating_summer_promo_removes_it_from_ask_answer(self) -> None:
        self.assertIn("SUMMER", self._ask(SUMMER_PROMO_QUESTION))
        self._set_promo_active(SUMMER_PROMO_ID, False)
        self.assertNotIn("SUMMER", self._ask(SUMMER_PROMO_QUESTION))

    def test_demo_reactivating_summer_promo_restores_active_promo(self) -> None:
        self._set_promo_active(SUMMER_PROMO_ID, False)
        self.assertNotIn(SUMMER_PROMO_ID, self._active_promo_ids())
        self._set_promo_active(SUMMER_PROMO_ID, True)
        self.assertIn(SUMMER_PROMO_ID, self._active_promo_ids())

    def test_demo_reactivating_summer_promo_restores_ask_answer(self) -> None:
        self._set_promo_active(SUMMER_PROMO_ID, False)
        self.assertNotIn("SUMMER", self._ask(SUMMER_PROMO_QUESTION))
        self._set_promo_active(SUMMER_PROMO_ID, True)
        self.assertIn("SUMMER", self._ask(SUMMER_PROMO_QUESTION))

    def test_demo_unknown_package_patch_returns_404(self) -> None:
        response = self.client.patch(
            f"/locations/{SAN_FRANCISCO_ID}/packages/{UNKNOWN_PACKAGE_ID}/active",
            json={"is_active": True},
        )
        self.assertEqual(response.status_code, 404)

    def test_demo_unknown_promo_patch_returns_404(self) -> None:
        response = self.client.patch(
            f"/locations/{SAN_FRANCISCO_ID}/promos/{UNKNOWN_PROMO_ID}/active",
            json={"is_active": False},
        )
        self.assertEqual(response.status_code, 404)

    def test_demo_other_company_package_patch_returns_404(self) -> None:
        response = self.client.patch(
            f"/locations/{SAN_FRANCISCO_ID}/packages/{RIVAL_PACKAGE_ID}/active",
            json={"is_active": True},
        )
        self.assertEqual(response.status_code, 404)
        self.assertNotIn(RIVAL_PACKAGE_ID, self._package_ids())

    def test_demo_other_company_promo_patch_returns_404(self) -> None:
        response = self.client.patch(
            f"/locations/{SAN_FRANCISCO_ID}/promos/{RIVAL_PROMO_ID}/active",
            json={"is_active": True},
        )
        self.assertEqual(response.status_code, 404)
        self.assertNotIn(RIVAL_PROMO_ID, self._active_promo_ids())

    def test_demo_other_company_location_patch_returns_404(self) -> None:
        package = self.client.patch(
            f"/locations/{RIVAL_LOCATION_ID}/packages/{RIVAL_PACKAGE_ID}/active",
            json={"is_active": False},
        )
        promo = self.client.patch(
            f"/locations/{RIVAL_LOCATION_ID}/promos/{RIVAL_PROMO_ID}/active",
            json={"is_active": False},
        )
        self.assertEqual(package.status_code, 404)
        self.assertEqual(promo.status_code, 404)

    def test_demo_unknown_location_patch_returns_404(self) -> None:
        package = self.client.patch(
            f"/locations/{UNKNOWN_LOCATION_ID}/packages/{BRONZE_PACKAGE_ID}/active",
            json={"is_active": False},
        )
        promo = self.client.patch(
            f"/locations/{UNKNOWN_LOCATION_ID}/promos/{SUMMER_PROMO_ID}/active",
            json={"is_active": False},
        )
        self.assertEqual(package.status_code, 404)
        self.assertEqual(promo.status_code, 404)

    def test_demo_ask_questions_are_recorded_in_question_log(self) -> None:
        self._ask(PACKAGES_QUESTION)
        self._set_package_active(ULTIMATE_COMBO_PACKAGE_ID, True)
        self._ask(PACKAGES_QUESTION)
        self._ask(SUMMER_PROMO_QUESTION)
        rows = _question_log_rows()
        self.assertEqual(len(rows), 3)
        self.assertEqual(
            [row.question for row in rows],
            [PACKAGES_QUESTION, PACKAGES_QUESTION, SUMMER_PROMO_QUESTION],
        )
        self.assertTrue(all(row.location_id == SAN_FRANCISCO_ID for row in rows))
        self.assertNotIn("Ultimate Combo", rows[0].answer)
        self.assertIn("Ultimate Combo", rows[1].answer)
        self.assertIn("SUMMER", rows[2].answer)


if __name__ == "__main__":
    unittest.main()

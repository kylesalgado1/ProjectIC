from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest import mock

from fastapi.testclient import TestClient

import main
from assistant_answerer import NO_PACKAGES_MESSAGE
from assistant_context import AssistantContext
from resolution import Package, ResolvedPackage

FIXED_NOW = datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)

BRONZE = ResolvedPackage(
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

PACKAGE_CONTEXT = AssistantContext(
    location_id=10,
    location_name="Downtown",
    city="Portland",
    packages=[BRONZE],
    active_promos=[],
    resources=[],
)

EMPTY_CONTEXT = AssistantContext(
    location_id=10,
    location_name="Downtown",
    city="Portland",
    packages=[],
    active_promos=[],
    resources=[],
)


class AskEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)

    def test_empty_question_returns_400_and_does_not_log(self) -> None:
        with mock.patch.object(main.repository, "log_question") as log_question:
            response = self.client.post("/locations/10/ask", json={"question": ""})
        self.assertEqual(response.status_code, 400)
        log_question.assert_not_called()

    def test_whitespace_question_returns_400(self) -> None:
        response = self.client.post("/locations/10/ask", json={"question": "   "})
        self.assertEqual(response.status_code, 400)

    def test_unknown_location_returns_404_and_does_not_log(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=None,
            ),
            mock.patch.object(main.repository, "log_question") as log_question,
        ):
            response = self.client.post(
                "/locations/88888/ask", json={"question": "What packages?"}
            )
        self.assertEqual(response.status_code, 404)
        log_question.assert_not_called()

    def test_valid_question_returns_200(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=EMPTY_CONTEXT,
            ),
            mock.patch.object(main.repository, "log_question", return_value=None),
        ):
            response = self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"answer": NO_PACKAGES_MESSAGE})

    def test_package_question_returns_active_package_names(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=PACKAGE_CONTEXT,
            ),
            mock.patch.object(main.repository, "log_question", return_value=None),
        ):
            response = self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertIn("Bronze", response.json()["answer"])

    def test_builds_context_with_company_id_location_id_and_now(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=EMPTY_CONTEXT,
            ) as build_context,
            mock.patch.object(main.repository, "log_question", return_value=None),
            mock.patch.object(main, "_utc_now", return_value=FIXED_NOW),
        ):
            self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        build_context.assert_called_once_with(1, 10, FIXED_NOW)

    def test_successful_ask_logs_original_question_and_answer(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=PACKAGE_CONTEXT,
            ),
            mock.patch.object(
                main.repository, "log_question", return_value=None
            ) as log_question,
        ):
            response = self.client.post(
                "/locations/10/ask",
                json={"question": "  What packages do you offer?  "},
            )
        answer = response.json()["answer"]
        log_question.assert_called_once_with(
            10, "  What packages do you offer?  ", answer
        )

    def test_passes_stripped_question_to_answerer(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=EMPTY_CONTEXT,
            ),
            mock.patch.object(
                main.assistant_answerer,
                "answer_question",
                return_value="An answer.",
            ) as answer_question,
            mock.patch.object(main.repository, "log_question", return_value=None),
        ):
            self.client.post(
                "/locations/10/ask",
                json={"question": "  What packages do you offer?  "},
            )
        answer_question.assert_called_once_with(
            "What packages do you offer?", EMPTY_CONTEXT
        )

    def test_response_returns_answer_only(self) -> None:
        with (
            mock.patch.object(
                main.assistant_context,
                "build_assistant_context",
                return_value=EMPTY_CONTEXT,
            ),
            mock.patch.object(
                main.assistant_answerer,
                "answer_question",
                return_value="An answer.",
            ),
            mock.patch.object(main.repository, "log_question", return_value=None),
        ):
            response = self.client.post(
                "/locations/10/ask",
                json={"question": "What packages do you offer?"},
            )
        self.assertEqual(response.json(), {"answer": "An answer."})


if __name__ == "__main__":
    unittest.main()

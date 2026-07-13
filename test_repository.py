from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest import mock

import repository
from repository import LocationSummary
from resolution import Package, PackageOverride, Promo, PromoOverride, Resource

DATABASE_URL = os.environ.get("DATABASE_URL")


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


class EnvironmentTests(unittest.TestCase):
    def test_missing_database_url_raises_runtime_error(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError):
                repository.load_resources_for_location(1, 10)


@unittest.skipUnless(DATABASE_URL, "DATABASE_URL is not set")
class RepositoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _load_fixtures()

    def test_load_packages_returns_package_objects(self) -> None:
        packages, _ = repository.load_packages_for_location(1, 10)
        self.assertTrue(packages)
        self.assertTrue(all(isinstance(item, Package) for item in packages))
        by_id = {item.id: item for item in packages}
        self.assertEqual(set(by_id), {1000, 1001, 1002, 1003})
        self.assertEqual(by_id[1000].base_price_cents, 15000)
        self.assertEqual(by_id[1000].company_id, 1)
        self.assertFalse(by_id[1002].active)

    def test_load_package_overrides_returns_dict(self) -> None:
        _, overrides = repository.load_packages_for_location(1, 10)
        self.assertIsInstance(overrides, dict)
        self.assertEqual(set(overrides), {1000, 1001})
        for key, value in overrides.items():
            self.assertIsInstance(key, int)
            self.assertIsInstance(value, PackageOverride)
        self.assertEqual(overrides[1000].price_cents, 12000)
        self.assertTrue(overrides[1000].available)
        self.assertIsNone(overrides[1001].price_cents)
        self.assertFalse(overrides[1001].available)

    def test_load_promos_returns_promo_objects(self) -> None:
        promos, _ = repository.load_promos_for_location(1, 10)
        self.assertTrue(all(isinstance(item, Promo) for item in promos))
        by_id = {item.id: item for item in promos}
        self.assertEqual(set(by_id), {3000, 3001, 3002})
        self.assertEqual(by_id[3000].code, "SAVE10")
        self.assertEqual(by_id[3000].discount_percent, 10)

    def test_load_promo_overrides_returns_dict(self) -> None:
        _, overrides = repository.load_promos_for_location(1, 10)
        self.assertIsInstance(overrides, dict)
        self.assertEqual(set(overrides), {3000, 3001})
        for key, value in overrides.items():
            self.assertIsInstance(key, int)
            self.assertIsInstance(value, PromoOverride)
        self.assertEqual(overrides[3000].discount_percent, 15)
        self.assertTrue(overrides[3000].active)
        self.assertIsNone(overrides[3001].discount_percent)
        self.assertFalse(overrides[3001].active)

    def test_load_resources_returns_resource_objects(self) -> None:
        resources = repository.load_resources_for_location(1, 10)
        self.assertTrue(all(isinstance(item, Resource) for item in resources))
        by_id = {item.id: item for item in resources}
        self.assertEqual(set(by_id), {7000, 7001})
        self.assertEqual(by_id[7000].capacity, 8)
        self.assertEqual(by_id[7001].capacity, 20)

    def test_known_location_without_overrides_returns_catalog(self) -> None:
        packages, package_overrides = repository.load_packages_for_location(1, 11)
        self.assertEqual({item.id for item in packages}, {1000, 1001, 1002, 1003})
        self.assertEqual(package_overrides, {})

    def test_wrong_company_returns_empty(self) -> None:
        packages, package_overrides = repository.load_packages_for_location(424242, 10)
        self.assertEqual(packages, [])
        self.assertEqual(package_overrides, {})
        promos, promo_overrides = repository.load_promos_for_location(424242, 10)
        self.assertEqual(promos, [])
        self.assertEqual(promo_overrides, {})
        self.assertEqual(repository.load_resources_for_location(424242, 10), [])

    def test_unknown_location_returns_empty(self) -> None:
        packages, package_overrides = repository.load_packages_for_location(1, 88888)
        self.assertEqual(packages, [])
        self.assertEqual(package_overrides, {})
        promos, promo_overrides = repository.load_promos_for_location(1, 88888)
        self.assertEqual(promos, [])
        self.assertEqual(promo_overrides, {})
        self.assertEqual(repository.load_resources_for_location(1, 88888), [])

    def test_foreign_company_location_returns_empty(self) -> None:
        packages, package_overrides = repository.load_packages_for_location(1, 20)
        self.assertEqual(packages, [])
        self.assertEqual(package_overrides, {})
        promos, promo_overrides = repository.load_promos_for_location(1, 20)
        self.assertEqual(promos, [])
        self.assertEqual(promo_overrides, {})
        self.assertEqual(repository.load_resources_for_location(1, 20), [])

    def test_log_question_inserts_row(self) -> None:
        import psycopg

        assert DATABASE_URL is not None
        question = "Do you offer gluten-free options?"
        answer = "Yes, several menu items are gluten-free."
        repository.log_question(10, question, answer)
        with psycopg.connect(DATABASE_URL) as conn:
            row = conn.execute(
                "SELECT location_id, question, answer FROM question_log"
                " WHERE question = %s AND answer = %s",
                (question, answer),
            ).fetchone()
        self.assertEqual(row, (10, question, answer))


@unittest.skipUnless(DATABASE_URL, "DATABASE_URL is not set")
class LocationRepositoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _load_fixtures()

    def test_list_locations_returns_four_for_company_one(self) -> None:
        locations = repository.list_locations(1)
        self.assertEqual(len(locations), 4)
        self.assertTrue(all(isinstance(item, LocationSummary) for item in locations))
        self.assertEqual([item.id for item in locations], [10, 11, 12, 13])

    def test_list_locations_maps_all_fields(self) -> None:
        locations = repository.list_locations(1)
        by_id = {item.id: item for item in locations}
        self.assertEqual(by_id[10].company_id, 1)
        self.assertEqual(by_id[10].name, "Downtown")
        self.assertEqual(by_id[10].city, "Portland")
        self.assertEqual(by_id[11].name, "Uptown")
        self.assertEqual(by_id[11].city, "Seattle")

    def test_list_locations_sorted_by_id_ascending(self) -> None:
        ids = [item.id for item in repository.list_locations(1)]
        self.assertEqual(ids, sorted(ids))

    def test_list_locations_wrong_company_returns_empty(self) -> None:
        self.assertEqual(repository.list_locations(424242), [])

    def test_get_location_returns_correct_location(self) -> None:
        location = repository.get_location(1, 11)
        expected = LocationSummary(
            id=11, company_id=1, name="Uptown", city="Seattle"
        )
        self.assertEqual(location, expected)

    def test_get_location_wrong_company_returns_none(self) -> None:
        self.assertIsNone(repository.get_location(2, 10))

    def test_get_location_unknown_location_returns_none(self) -> None:
        self.assertIsNone(repository.get_location(1, 88888))


@unittest.skipUnless(DATABASE_URL, "DATABASE_URL is not set")
class SetActiveRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        _load_fixtures()

    def _package_override(
        self, location_id: int, package_id: int
    ) -> list[tuple[int | None, bool]]:
        import psycopg

        assert DATABASE_URL is not None
        with psycopg.connect(DATABASE_URL) as conn:
            rows = conn.execute(
                "SELECT price_cents, available FROM package_override"
                " WHERE location_id = %s AND package_id = %s",
                (location_id, package_id),
            ).fetchall()
        return [(row[0], row[1]) for row in rows]

    def _promo_override(
        self, location_id: int, promo_id: int
    ) -> list[tuple[int | None, bool]]:
        import psycopg

        assert DATABASE_URL is not None
        with psycopg.connect(DATABASE_URL) as conn:
            rows = conn.execute(
                "SELECT discount_percent, active FROM promo_override"
                " WHERE location_id = %s AND promo_id = %s",
                (location_id, promo_id),
            ).fetchall()
        return [(row[0], row[1]) for row in rows]

    def test_package_active_override_saved(self) -> None:
        saved = repository.set_location_package_active(1, 11, 1000, True)
        self.assertTrue(saved)
        self.assertEqual(self._package_override(11, 1000), [(None, True)])

    def test_package_inactive_override_saved(self) -> None:
        saved = repository.set_location_package_active(1, 11, 1000, False)
        self.assertTrue(saved)
        self.assertEqual(self._package_override(11, 1000), [(None, False)])

    def test_package_override_updates_existing_row(self) -> None:
        saved = repository.set_location_package_active(1, 10, 1001, True)
        self.assertTrue(saved)
        self.assertEqual(self._package_override(10, 1001), [(None, True)])

    def test_package_unknown_location_returns_false(self) -> None:
        saved = repository.set_location_package_active(1, 88888, 1000, True)
        self.assertFalse(saved)
        self.assertEqual(self._package_override(88888, 1000), [])

    def test_package_unknown_package_returns_false(self) -> None:
        saved = repository.set_location_package_active(1, 11, 999999, True)
        self.assertFalse(saved)
        self.assertEqual(self._package_override(11, 999999), [])

    def test_package_cross_tenant_returns_false(self) -> None:
        saved = repository.set_location_package_active(1, 11, 2000, True)
        self.assertFalse(saved)
        self.assertEqual(self._package_override(11, 2000), [])

    def test_promo_active_override_saved(self) -> None:
        saved = repository.set_location_promo_active(1, 11, 3000, True)
        self.assertTrue(saved)
        self.assertEqual(self._promo_override(11, 3000), [(None, True)])

    def test_promo_inactive_override_saved(self) -> None:
        saved = repository.set_location_promo_active(1, 11, 3000, False)
        self.assertTrue(saved)
        self.assertEqual(self._promo_override(11, 3000), [(None, False)])

    def test_promo_override_updates_existing_row(self) -> None:
        saved = repository.set_location_promo_active(1, 10, 3001, True)
        self.assertTrue(saved)
        self.assertEqual(self._promo_override(10, 3001), [(None, True)])

    def test_promo_unknown_location_returns_false(self) -> None:
        saved = repository.set_location_promo_active(1, 88888, 3000, True)
        self.assertFalse(saved)
        self.assertEqual(self._promo_override(88888, 3000), [])

    def test_promo_unknown_promo_returns_false(self) -> None:
        saved = repository.set_location_promo_active(1, 11, 999999, True)
        self.assertFalse(saved)
        self.assertEqual(self._promo_override(11, 999999), [])

    def test_promo_cross_tenant_returns_false(self) -> None:
        saved = repository.set_location_promo_active(1, 11, 4000, True)
        self.assertFalse(saved)
        self.assertEqual(self._promo_override(11, 4000), [])


if __name__ == "__main__":
    unittest.main()

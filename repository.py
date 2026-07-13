from __future__ import annotations

import os
from dataclasses import dataclass

import psycopg
from psycopg.rows import TupleRow, class_row

from resolution import Package, PackageOverride, Promo, PromoOverride, Resource


@dataclass(frozen=True)
class LocationSummary:
    id: int
    company_id: int
    name: str
    city: str


def _connect() -> psycopg.Connection[TupleRow]:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(url)


def load_packages_for_location(
    company_id: int, location_id: int
) -> tuple[list[Package], dict[int, PackageOverride]]:
    with _connect() as conn:
        with conn.cursor(row_factory=class_row(Package)) as package_cursor:
            package_cursor.execute(
                "SELECT id, company_id, name, description, base_price_cents,"
                " size_tier_id, active"
                " FROM package"
                " WHERE company_id = %s"
                " AND EXISTS ("
                " SELECT 1 FROM location WHERE id = %s AND company_id = %s)"
                " ORDER BY id",
                (company_id, location_id, company_id),
            )
            packages = package_cursor.fetchall()
        with conn.cursor(row_factory=class_row(PackageOverride)) as override_cursor:
            override_cursor.execute(
                "SELECT package_id, location_id, price_cents, available"
                " FROM package_override"
                " WHERE company_id = %s AND location_id = %s"
                " ORDER BY package_id",
                (company_id, location_id),
            )
            overrides = {row.package_id: row for row in override_cursor.fetchall()}
    return packages, overrides


def load_promos_for_location(
    company_id: int, location_id: int
) -> tuple[list[Promo], dict[int, PromoOverride]]:
    with _connect() as conn:
        with conn.cursor(row_factory=class_row(Promo)) as promo_cursor:
            promo_cursor.execute(
                "SELECT id, company_id, code, description, discount_percent,"
                " starts_on, ends_on, active"
                " FROM promo"
                " WHERE company_id = %s"
                " AND EXISTS ("
                " SELECT 1 FROM location WHERE id = %s AND company_id = %s)"
                " ORDER BY id",
                (company_id, location_id, company_id),
            )
            promos = promo_cursor.fetchall()
        with conn.cursor(row_factory=class_row(PromoOverride)) as override_cursor:
            override_cursor.execute(
                "SELECT promo_id, location_id, discount_percent, active"
                " FROM promo_override"
                " WHERE company_id = %s AND location_id = %s"
                " ORDER BY promo_id",
                (company_id, location_id),
            )
            overrides = {row.promo_id: row for row in override_cursor.fetchall()}
    return promos, overrides


def load_resources_for_location(company_id: int, location_id: int) -> list[Resource]:
    with _connect() as conn:
        with conn.cursor(row_factory=class_row(Resource)) as resource_cursor:
            resource_cursor.execute(
                "SELECT id, company_id, location_id, name, capacity, size_tier_id"
                " FROM resource"
                " WHERE company_id = %s AND location_id = %s"
                " ORDER BY id",
                (company_id, location_id),
            )
            return resource_cursor.fetchall()


def log_question(location_id: int, question: str, answer: str) -> None:
    with _connect() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO question_log (location_id, question, answer)"
                " VALUES (%s, %s, %s)",
                (location_id, question, answer),
            )
        conn.commit()


def list_locations(company_id: int) -> list[LocationSummary]:
    with _connect() as conn:
        with conn.cursor(row_factory=class_row(LocationSummary)) as cursor:
            cursor.execute(
                "SELECT id, company_id, name, city"
                " FROM location"
                " WHERE company_id = %s"
                " ORDER BY id",
                (company_id,),
            )
            return cursor.fetchall()


def get_location(company_id: int, location_id: int) -> LocationSummary | None:
    with _connect() as conn:
        with conn.cursor(row_factory=class_row(LocationSummary)) as cursor:
            cursor.execute(
                "SELECT id, company_id, name, city"
                " FROM location"
                " WHERE company_id = %s AND id = %s",
                (company_id, location_id),
            )
            return cursor.fetchone()


def set_location_package_active(
    company_id: int,
    location_id: int,
    package_id: int,
    is_active: bool,
) -> bool:
    with _connect() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM location WHERE id = %s AND company_id = %s",
                (location_id, company_id),
            )
            if cursor.fetchone() is None:
                return False
            cursor.execute(
                "SELECT 1 FROM package WHERE id = %s AND company_id = %s",
                (package_id, company_id),
            )
            if cursor.fetchone() is None:
                return False
            cursor.execute(
                "INSERT INTO package_override"
                " (id, company_id, location_id, package_id, price_cents, available)"
                " VALUES ("
                " (SELECT COALESCE(MAX(id), 0) + 1 FROM package_override),"
                " %s, %s, %s, NULL, %s)"
                " ON CONFLICT (location_id, package_id)"
                " DO UPDATE SET available = EXCLUDED.available",
                (company_id, location_id, package_id, is_active),
            )
        conn.commit()
    return True


def set_location_promo_active(
    company_id: int,
    location_id: int,
    promo_id: int,
    is_active: bool,
) -> bool:
    with _connect() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM location WHERE id = %s AND company_id = %s",
                (location_id, company_id),
            )
            if cursor.fetchone() is None:
                return False
            cursor.execute(
                "SELECT 1 FROM promo WHERE id = %s AND company_id = %s",
                (promo_id, company_id),
            )
            if cursor.fetchone() is None:
                return False
            cursor.execute(
                "INSERT INTO promo_override"
                " (id, company_id, location_id, promo_id, discount_percent, active)"
                " VALUES ("
                " (SELECT COALESCE(MAX(id), 0) + 1 FROM promo_override),"
                " %s, %s, %s, NULL, %s)"
                " ON CONFLICT (location_id, promo_id)"
                " DO UPDATE SET active = EXCLUDED.active",
                (company_id, location_id, promo_id, is_active),
            )
        conn.commit()
    return True

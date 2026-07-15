from __future__ import annotations

import re

import resolution
from assistant_context import AssistantContext
from resolution import ResolvedPackage, ResolvedPromo, Resource

FALLBACK_MESSAGE = (
    "I can answer questions about packages, promotions, and rooms for this location."
)
NO_PACKAGES_MESSAGE = "No active packages are currently listed for this location."
NO_PROMOS_MESSAGE = "No active promos are currently listed for this location."
NO_ROOM_MESSAGE = "No listed room fits that group size."
NO_ROOMS_MESSAGE = "No rooms are currently listed for this location."

_PACKAGE_KEYWORDS = (
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
)
_PROMO_KEYWORDS = (
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
)
_ROOM_KEYWORDS = (
    "room",
    "rooms",
    "fit",
    "fits",
    "capacity",
    "people",
    "guests",
    "group",
)

_INTEGER = re.compile(r"\d+")


def answer_question(question: str, context: AssistantContext) -> str:
    text = question.lower()
    if _matches(text, _PACKAGE_KEYWORDS):
        return _packages_answer(context.packages)
    if _matches(text, _PROMO_KEYWORDS):
        return _promos_answer(context.active_promos)
    if _matches(text, _ROOM_KEYWORDS):
        group_size = _first_positive_integer(question)
        if group_size is None:
            return _rooms_answer(context.resources)
        return _fitting_rooms_answer(context.resources, group_size)
    return FALLBACK_MESSAGE


def _matches(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _first_positive_integer(question: str) -> int | None:
    for match in _INTEGER.findall(question):
        value = int(match)
        if value > 0:
            return value
    return None


def _format_price(price_cents: int) -> str:
    return f"${price_cents / 100:.2f}"


def _packages_answer(packages: list[ResolvedPackage]) -> str:
    available = [package for package in packages if package.available]
    if not available:
        return NO_PACKAGES_MESSAGE
    segments = [_package_segment(package) for package in available]
    return "Active packages: " + "; ".join(segments) + "."


def _package_segment(package: ResolvedPackage) -> str:
    segment = f"{package.package.name} ({_format_price(package.price_cents)})"
    if package.package.description:
        segment += f" - {package.package.description}"
    return segment


def _promos_answer(promos: list[ResolvedPromo]) -> str:
    if not promos:
        return NO_PROMOS_MESSAGE
    segments = [_promo_segment(promo) for promo in promos]
    return "Active promos: " + "; ".join(segments) + "."


def _promo_segment(promo: ResolvedPromo) -> str:
    segment = promo.promo.code
    if promo.promo.description:
        segment += f" - {promo.promo.description}"
    segment += f" (ends {promo.promo.ends_on.isoformat()})"
    return segment


def _fitting_rooms_answer(resources: list[Resource], group_size: int) -> str:
    fitting = resolution.rooms_fitting(resources, group_size)
    if not fitting:
        return NO_ROOM_MESSAGE
    ordered = sorted(fitting, key=lambda resource: resource.capacity)
    return f"Rooms that fit {group_size} guests: {_room_list(ordered)}."


def _rooms_answer(resources: list[Resource]) -> str:
    if not resources:
        return NO_ROOMS_MESSAGE
    ordered = sorted(resources, key=lambda resource: resource.capacity)
    return f"Available rooms: {_room_list(ordered)}."


def _room_list(resources: list[Resource]) -> str:
    return ", ".join(
        f"{resource.name} (capacity {resource.capacity})" for resource in resources
    )

from __future__ import annotations

import re
from typing import Protocol, runtime_checkable

import llm_provider
import resolution
from assistant_context import AssistantContext
from resolution import ResolvedPackage, ResolvedPromo, Resource

FALLBACK_MESSAGE = (
    "I can answer questions about party packages, active promos, "
    "and room capacity for this location."
)
NO_PACKAGES_MESSAGE = (
    "There are no party packages currently available for this location."
)
NO_PROMOS_MESSAGE = (
    "There are no active promos currently listed for this location."
)
NO_ROOM_MESSAGE = "No listed room fits a group of that size."
GROUP_SIZE_PROMPT = "Please tell me the group size so I can suggest a room."

_PACKAGE_KEYWORDS = ("package", "price", "offer")
_PROMO_KEYWORDS = ("promo",)
_ROOM_KEYWORDS = ("room", "capacity", "group size", "seat")

_PUNCTUATION = re.compile(r"[^a-z0-9\s]")
_INTEGER = re.compile(r"\d+")


@runtime_checkable
class AssistantAnswerer(Protocol):
    def answer(self, question: str, context: AssistantContext) -> str: ...


class StaticAssistantAnswerer:
    def answer(self, question: str, context: AssistantContext) -> str:
        return "Assistant is not enabled yet."


class GroundedAssistantAnswerer:
    def answer(self, question: str, context: AssistantContext) -> str:
        grounded_context = build_grounded_context(context)
        provider = llm_provider.get_default_llm_provider()
        try:
            return provider.generate(question, grounded_context)
        except NotImplementedError:
            return _deterministic_answer(question, context)
        except Exception:
            return _deterministic_answer(question, context)


def get_default_answerer() -> AssistantAnswerer:
    return GroundedAssistantAnswerer()


def build_grounded_context(context: AssistantContext) -> str:
    lines = [
        f"Location: {context.location_name} ({context.city})",
        f"Active packages: {_packages_context(context.packages)}",
        f"Active promos: {_promos_context(context.active_promos)}",
        f"Rooms: {_resources_context(context.resources)}",
    ]
    return "\n".join(lines)


def _deterministic_answer(question: str, context: AssistantContext) -> str:
    normalized = _normalize(question)
    if _mentions(normalized, _PACKAGE_KEYWORDS):
        return _packages_answer(context.packages)
    if _mentions(normalized, _PROMO_KEYWORDS):
        return _promos_answer(context.active_promos)
    if _mentions(normalized, _ROOM_KEYWORDS):
        guests = _first_positive_integer(question)
        if guests is None:
            return GROUP_SIZE_PROMPT
        return _rooms_answer(context.resources, guests)
    return FALLBACK_MESSAGE


def _normalize(question: str) -> str:
    cleaned = _PUNCTUATION.sub(" ", question.lower())
    return " ".join(cleaned.split())


def _mentions(normalized: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in normalized for keyword in keywords)


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
    listed = ", ".join(
        f"{package.package.name} ({_format_price(package.price_cents)})"
        for package in available
    )
    return f"Available party packages: {listed}."


def _promos_answer(promos: list[ResolvedPromo]) -> str:
    if not promos:
        return NO_PROMOS_MESSAGE
    listed = ", ".join(
        f"{promo.promo.code} ({promo.discount_percent}% off)" for promo in promos
    )
    return f"Active promos for this location: {listed}."


def _rooms_answer(resources: list[Resource], guests: int) -> str:
    fitting = resolution.rooms_fitting(resources, guests)
    if not fitting:
        return NO_ROOM_MESSAGE
    ordered = sorted(fitting, key=lambda resource: (resource.capacity, resource.id))
    listed = ", ".join(
        f"{resource.name} (capacity {resource.capacity})" for resource in ordered
    )
    return f"Rooms that fit a group of {guests}: {listed}."


def _packages_context(packages: list[ResolvedPackage]) -> str:
    available = [package for package in packages if package.available]
    if not available:
        return "none"
    return ", ".join(
        f"{package.package.name} ({_format_price(package.price_cents)})"
        for package in available
    )


def _promos_context(promos: list[ResolvedPromo]) -> str:
    if not promos:
        return "none"
    return ", ".join(
        f"{promo.promo.code} ({promo.discount_percent}% off)" for promo in promos
    )


def _resources_context(resources: list[Resource]) -> str:
    if not resources:
        return "none"
    ordered = sorted(resources, key=lambda resource: (resource.capacity, resource.id))
    return ", ".join(
        f"{resource.name} (capacity {resource.capacity})" for resource in ordered
    )

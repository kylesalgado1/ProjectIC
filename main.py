from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel

import assistant_answerer
import assistant_context
import repository
import resolution

app = FastAPI()


def get_company_id() -> int:
    return 1


CompanyId = Annotated[int, Depends(get_company_id)]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class LocationResponse(BaseModel):
    id: int
    name: str
    city: str


class PackageResponse(BaseModel):
    id: int
    name: str
    description: str | None
    price_cents: int
    is_active: bool


class ActivePromoResponse(BaseModel):
    id: int
    code: str
    description: str | None
    discount_percent: int
    starts_on: date
    ends_on: date


class RoomResponse(BaseModel):
    id: int
    name: str
    capacity: int
    size_tier_id: int


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str


class SetActiveRequest(BaseModel):
    is_active: bool


class SetActiveResponse(BaseModel):
    success: bool


@app.get("/locations")
def get_locations(company_id: CompanyId) -> list[LocationResponse]:
    locations = repository.list_locations(company_id)
    return [
        LocationResponse(id=location.id, name=location.name, city=location.city)
        for location in locations
    ]


@app.get("/locations/{location_id}/packages")
def get_packages(location_id: int, company_id: CompanyId) -> list[PackageResponse]:
    location = repository.get_location(company_id, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    packages, overrides = repository.load_packages_for_location(company_id, location_id)
    resolved = resolution.resolve_packages(packages, overrides)
    return [
        PackageResponse(
            id=item.package.id,
            name=item.package.name,
            description=item.package.description,
            price_cents=item.price_cents,
            is_active=item.available,
        )
        for item in resolved
        if item.available
    ]


@app.get("/locations/{location_id}/promos/active")
def get_active_promos(
    location_id: int, company_id: CompanyId
) -> list[ActivePromoResponse]:
    location = repository.get_location(company_id, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    promos, overrides = repository.load_promos_for_location(company_id, location_id)
    resolved = resolution.active_promos(promos, overrides, on=_utc_now().date())
    return [
        ActivePromoResponse(
            id=item.promo.id,
            code=item.promo.code,
            description=item.promo.description,
            discount_percent=item.discount_percent,
            starts_on=item.promo.starts_on,
            ends_on=item.promo.ends_on,
        )
        for item in resolved
    ]


@app.get("/locations/{location_id}/rooms")
def get_rooms(
    location_id: int, group_size: int, company_id: CompanyId
) -> list[RoomResponse]:
    if group_size <= 0:
        raise HTTPException(status_code=400, detail="group_size must be positive")
    location = repository.get_location(company_id, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    resources = repository.load_resources_for_location(company_id, location_id)
    fitting = resolution.rooms_fitting(resources, group_size)
    return [
        RoomResponse(
            id=resource.id,
            name=resource.name,
            capacity=resource.capacity,
            size_tier_id=resource.size_tier_id,
        )
        for resource in fitting
    ]


@app.post("/locations/{location_id}/ask")
def ask(
    location_id: int, payload: AskRequest, company_id: CompanyId
) -> AskResponse:
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question must not be empty")
    context = assistant_context.build_assistant_context(
        company_id, location_id, _utc_now()
    )
    if context is None:
        raise HTTPException(status_code=404, detail="Location not found")
    answerer = assistant_answerer.get_default_answerer()
    try:
        answer = answerer.answer(question, context)
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="Assistant failed to answer the question"
        ) from error
    try:
        repository.log_question(location_id, payload.question, answer)
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="Failed to record the question"
        ) from error
    return AskResponse(answer=answer)


@app.patch("/locations/{location_id}/packages/{package_id}/active")
def set_package_active(
    location_id: int,
    package_id: int,
    payload: SetActiveRequest,
    company_id: CompanyId,
) -> SetActiveResponse:
    location = repository.get_location(company_id, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    saved = repository.set_location_package_active(
        company_id, location_id, package_id, payload.is_active
    )
    if not saved:
        raise HTTPException(status_code=404, detail="Package not found")
    return SetActiveResponse(success=True)


@app.patch("/locations/{location_id}/promos/{promo_id}/active")
def set_promo_active(
    location_id: int,
    promo_id: int,
    payload: SetActiveRequest,
    company_id: CompanyId,
) -> SetActiveResponse:
    location = repository.get_location(company_id, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    saved = repository.set_location_promo_active(
        company_id, location_id, promo_id, payload.is_active
    )
    if not saved:
        raise HTTPException(status_code=404, detail="Promo not found")
    return SetActiveResponse(success=True)

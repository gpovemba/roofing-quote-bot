import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import requests as http_requests
from app.models import ChatRequest, ChatResponse, MeasurementSummary
from app.ai.agent import chat
from app.history.store import list_quotes, get_quote, delete_quote
from app.measurement.store import get_measurement, save_measurement
from app.measurement.eagleview import get_provider, EagleViewProvider
from app.measurement.provider import PropertyInput

router = APIRouter()

WELCOME = (
    "Hey! I'm Roofing Quote Bot. Let's build an estimate together.\n\n"
    "Give me a property address and I'll pull the roof measurements automatically "
    "via EagleView - area, pitch, and roof details. Then I'll only need a few "
    "business inputs from you to calculate a full quote."
)


def _build_measurement_summary(measurement: dict) -> MeasurementSummary:
    return MeasurementSummary(
        id=measurement["id"],
        provider=measurement.get("provider", ""),
        address=measurement.get("address", ""),
        total_roof_area_sqft=measurement.get("total_roof_area_sqft", 0),
        roof_squares=measurement.get("roof_squares", 0),
        predominant_pitch=measurement.get("predominant_pitch", ""),
        pitch_normalized=measurement.get("pitch_normalized", ""),
        facets_count=measurement.get("facets_count"),
        ridge_length_ft=measurement.get("ridge_length_ft"),
        valley_length_ft=measurement.get("valley_length_ft"),
        eave_length_ft=measurement.get("eave_length_ft"),
        rake_length_ft=measurement.get("rake_length_ft"),
        waste_factor=measurement.get("waste_factor", 0.12),
        roof_material=measurement.get("roof_material"),
        roof_condition_rating=measurement.get("roof_condition_rating"),
        roof_age_years=measurement.get("roof_age_years"),
        image_tokens=measurement.get("image_tokens", []),
        report_pdf_url=measurement.get("report_pdf_url"),
        status=measurement.get("status", ""),
        captured_at=measurement.get("captured_at"),
    )


@router.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    if not req.messages:
        return ChatResponse(message=WELCOME)

    reply, breakdown, quote_id, measurement = chat(req.messages)

    msmt_summary = _build_measurement_summary(measurement) if measurement else None

    return ChatResponse(
        message=reply,
        quote=breakdown,
        quote_id=quote_id,
        measurement=msmt_summary,
    )


# ── Measurement endpoints ────────────────────────────────────────────────────

@router.post("/api/measurements/request")
async def request_measurement(body: dict):
    address = body.get("address", "").strip()
    if not address:
        raise HTTPException(status_code=400, detail="address is required")
    prop = PropertyInput(address=address, customer_name=body.get("customer_name"))
    provider = get_provider()
    m = provider.create_request(prop)
    mid = save_measurement(m)
    return get_measurement(mid)


@router.get("/api/measurements/{measurement_id}")
async def get_measurement_endpoint(measurement_id: str):
    row = get_measurement(measurement_id)
    if not row:
        raise HTTPException(status_code=404, detail="Measurement not found")
    return row


@router.get("/api/images/{image_token}")
async def proxy_eagleview_image(image_token: str):
    """
    Proxy EagleView image requests so the frontend doesn't need to manage
    EagleView auth tokens directly.
    GET /property/v2/image/{imageToken} returns PNG binary.
    Only active when EagleView credentials are configured.
    """
    provider = get_provider()
    if not isinstance(provider, EagleViewProvider):
        raise HTTPException(status_code=404, detail="Image proxy only available with real EagleView credentials")

    sandbox = os.environ.get("EAGLEVIEW_SANDBOX", "").lower() in ("1", "true", "yes")
    base = "https://sandbox.apis.eagleview.com" if sandbox else "https://apis.eagleview.com"

    try:
        resp = http_requests.get(
            f"{base}/property/v2/image/{image_token}",
            headers={"Authorization": f"Bearer {provider._get_token()}"},
            timeout=30,
            stream=True,
        )
        resp.raise_for_status()
    except http_requests.HTTPError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))

    return StreamingResponse(resp.iter_content(chunk_size=8192), media_type="image/png")


# ── Quote endpoints ──────────────────────────────────────────────────────────

@router.get("/api/quotes")
async def get_quotes():
    return list_quotes()


@router.get("/api/quotes/{quote_id}")
async def get_quote_by_id(quote_id: str):
    q = get_quote(quote_id)
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    return q


@router.delete("/api/quotes/{quote_id}")
async def delete_quote_by_id(quote_id: str):
    if not delete_quote(quote_id):
        raise HTTPException(status_code=404, detail="Quote not found")
    return {"ok": True}

import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import requests as http_requests
from app.models import ChatRequest, ChatResponse, MeasurementSummary
from app.ai.agent import chat
from app.history.store import list_quotes, get_quote, delete_quote, save_quote_direct, update_quote, QUOTE_STATUSES
from app.measurement.store import get_measurement, save_measurement
from app.measurement.eagleview import get_provider, EagleViewProvider
from app.measurement.provider import PropertyInput
from app.business.profile import BusinessProfile, get_profile, save_profile, reset_profile
from app.knowledge import store as knowledge
from app.knowledge import embeddings
from app.knowledge.parsing import UnsupportedFile
import base64
from pathlib import Path

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


def _full_quote(q: dict) -> dict:
    import json
    q = dict(q)
    q["breakdown"] = json.loads(q.get("breakdown_json") or "{}")
    q["inputs"] = json.loads(q.get("inputs_json") or "{}")
    q["status"] = q.get("status") or "draft"
    return q


@router.get("/api/quotes/{quote_id}")
async def get_quote_by_id(quote_id: str):
    q = get_quote(quote_id)
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    return _full_quote(q)


@router.delete("/api/quotes/{quote_id}")
async def delete_quote_by_id(quote_id: str):
    if not delete_quote(quote_id):
        raise HTTPException(status_code=404, detail="Quote not found")
    return {"ok": True}


# ── Business profile endpoints ───────────────────────────────────────────────

@router.get("/api/profile")
async def read_profile():
    return get_profile()


@router.put("/api/profile")
async def update_profile(profile: BusinessProfile):
    return save_profile(profile)


@router.post("/api/profile/reset")
async def reset_profile_endpoint():
    return reset_profile()


# ── Document endpoints (RAG knowledge base) ──────────────────────────────────

SAMPLE_DIR = Path(__file__).parent.parent / "sample_docs"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


@router.get("/api/documents")
async def get_documents():
    return {
        "documents": knowledge.list_documents(),
        "search_mode": knowledge.search_mode(),
        "categories": knowledge.CATEGORIES,
    }


@router.post("/api/documents")
async def upload_document(body: dict):
    filename = (body.get("filename") or "").strip()
    content = body.get("content_base64") or ""
    if not filename or not content:
        raise HTTPException(status_code=400, detail="filename and content_base64 are required")
    try:
        data = base64.b64decode(content)
    except Exception:
        raise HTTPException(status_code=400, detail="The file couldn't be read. Try uploading it again.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 25 MB.")
    try:
        return knowledge.add_document(filename, data, body.get("category", "other"), body.get("title"))
    except (UnsupportedFile, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/api/documents/{doc_id}")
async def remove_document(doc_id: str):
    if not knowledge.delete_document(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True}


@router.post("/api/documents/search")
async def search_documents_endpoint(body: dict):
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    return {"results": knowledge.search(query), "search_mode": knowledge.search_mode()}


@router.post("/api/documents/samples")
async def load_sample_documents():
    existing = {d["filename"] for d in knowledge.list_documents()}
    categories = {"Warranty": "warranty", "Policies": "policy", "Standards": "install"}
    added = []
    for path in sorted(SAMPLE_DIR.glob("*.md")):
        if path.name in existing:
            continue
        cat = next((v for k, v in categories.items() if k in path.name), "other")
        added.append(knowledge.add_document(path.name, path.read_bytes(), cat))
    return {"added": len(added)}


@router.post("/api/documents/reindex")
async def reindex_documents():
    if not embeddings.enabled():
        raise HTTPException(status_code=400, detail="Add VOYAGE_API_KEY to your .env file first, then restart the app.")
    try:
        return {"embedded": knowledge.embed_missing()}
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Quote builder endpoints ──────────────────────────────────────────────────

from app.business.calculator import calculate, recalculate
from app.models import JobInputs, Quote
from app.ai.writer import write_quote_text


@router.get("/api/quote-options")
async def quote_options():
    """Everything the quote builder needs from the business profile."""
    p = get_profile()
    return {
        "company": p.company,
        "is_default": p.is_default,
        "roof_systems": {
            rt: {
                "waste_factor": sysm.waste_factor,
                "tiers": {g: {"product": t.product, "supplier": t.supplier,
                              "price_per_square": round(t.unit_price * t.units_per_square, 2)}
                          for g, t in sysm.tiers.items()},
            } for rt, sysm in p.roof_systems.items()
        },
        "extras": [
            {"id": a.id, "name": a.name, "description": a.description, "unit": a.unit,
             "basis": a.basis, "default_qty": a.coverage if a.basis == "per_job" else None,
             "applies_to": a.applies_to}
            for a in p.accessories if a.group == "extra" and a.enabled
        ],
    }


@router.post("/api/measurements/{measurement_id}/refresh")
async def refresh_measurement(measurement_id: str):
    """Check on a pending EagleView order (real API only; mock is instant)."""
    import json
    from app.ai.agent import _run_tool
    result, *_ = _run_tool("get_measurement_status", {"measurement_id": measurement_id})
    return json.loads(result)


@router.post("/api/quotes/build")
async def build_quote(body: dict):
    fields = {k: v for k, v in body.items() if k in JobInputs.model_fields}
    mid = body.get("measurement_id")
    if mid:
        m = get_measurement(mid)
        if m and m.get("status") == "complete":
            fields.setdefault("roof_area_sqft", m["total_roof_area_sqft"])
            fields.setdefault("pitch", m["pitch_normalized"])
            if fields.get("waste_factor") is None:
                fields["waste_factor"] = m.get("waste_factor")
            for k in ("eave_length_ft", "rake_length_ft", "ridge_length_ft", "valley_length_ft"):
                fields[k] = m.get(k)
    try:
        inputs = JobInputs(**fields)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Missing or invalid job details: {e}")
    if inputs.project_type != "inspection" and inputs.roof_area_sqft <= 0:
        raise HTTPException(status_code=400, detail="Enter the roof size or pull measurements first.")

    breakdown = calculate(inputs).model_dump()
    if body.get("write_text", True):
        overview, notes, sources = write_quote_text(breakdown, inputs.model_dump())
        breakdown.update(overview=overview, customer_notes=notes, note_sources=sources)

    from app.models import QuoteBreakdown
    quote = Quote(customer_name=inputs.customer_name, property_address=inputs.property_address,
                  inputs=inputs, breakdown=QuoteBreakdown(**breakdown), measurement_id=mid)
    qid = save_quote_direct(quote)
    update_quote(qid, {}, breakdown)   # keeps note_sources, which the model doesn't store
    return _full_quote(get_quote(qid))


@router.patch("/api/quotes/{quote_id}")
async def edit_quote(quote_id: str, body: dict):
    q = get_quote(quote_id)
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    if "status" in body and body["status"] not in QUOTE_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {QUOTE_STATUSES}")

    full = _full_quote(q)
    b = full["breakdown"]
    changed = False
    if "line_items" in body:
        items = []
        for it in body["line_items"]:
            try:
                items.append({
                    "category": it.get("category") or "custom",
                    "name": str(it.get("name") or "").strip() or "Item",
                    "quantity": float(it.get("quantity") or 0),
                    "unit": str(it.get("unit") or "each"),
                    "unit_price": float(it.get("unit_price") or 0),
                    "total": 0,
                    "supplier": it.get("supplier", ""),
                    "detail": it.get("detail", ""),
                    "estimated": bool(it.get("estimated", False)),
                })
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"Quantity and price must be numbers ({it.get('name')}).")
        b["line_items"] = items
        changed = True
    for key in ("overhead_pct", "markup_pct", "material_tax_pct"):
        if key in body:
            b[key] = max(0.0, float(body[key]))
            changed = True
    for key in ("overview", "customer_notes", "quote_settings"):
        if key in body:
            b[key] = body[key]
            changed = True
    if changed:
        b = recalculate(b)
    updated = update_quote(quote_id, body, b if changed else None)
    return _full_quote(updated)


@router.post("/api/quotes/{quote_id}/rewrite")
async def rewrite_quote_text(quote_id: str):
    q = get_quote(quote_id)
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    full = _full_quote(q)
    overview, notes, sources = write_quote_text(full["breakdown"], full["inputs"])
    b = full["breakdown"]
    b.update(overview=overview, customer_notes=notes, note_sources=sources)
    return _full_quote(update_quote(quote_id, {}, b))

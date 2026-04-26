import os
import json
import anthropic
from app.models import ChatMessage, JobInputs, Quote, MeasurementSummary
from app.business.calculator import calculate
from app.history.store import save_quote_direct, get_similar_quotes
from app.measurement.eagleview import get_provider
from app.measurement.store import save_measurement, get_measurement, update_measurement_complete

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

SYSTEM_PROMPT = """\
You are Roofing Quote Bot, an expert estimating assistant for roofing contractors.

When a user provides a property address, always call request_roof_measurements first.
EagleView returns actual roof dimensions — area, pitch, and waste factor — so you won't
need to ask the user for those numbers.

Measurement flow:
- If the user's message contains "[Pending EagleView measurement_id: <id> ...]", call
  get_measurement_status with that exact id BEFORE doing anything else. Do NOT call
  request_roof_measurements again for the same address.
- If status is still pending, tell the user and gather remaining business inputs.
- If status is complete, proceed with the measurement data to calculate_quote.

After complete measurements, ask only for what EagleView cannot provide:
  - Roof type / material (asphalt, metal, tile, flat)
  - Material grade (economy, standard, premium)
  - Number of existing layers to tear off
  - Any known costs: disposal, transport, permit, equipment
  - Desired markup / overhead if different from defaults

Then call calculate_quote. Quotes are saved automatically.

If no address is available, fall back to asking for roof size and pitch manually.

Tools:
- request_roof_measurements: Trigger EagleView for a property address.
- get_measurement_status: Poll a pending measurement by measurement_id.
- calculate_quote: Run the pricing engine. Pass measurement_id when available.
- get_similar_quotes: Look up past jobs for pricing context.

Keep responses concise and professional. Always state the final quote amount prominently.
"""

TOOLS = [
    {
        "name": "request_roof_measurements",
        "description": (
            "Trigger an EagleView remote measurement for a property address. "
            "Returns roof area, pitch, linear measurements, and waste factor. "
            "Status is 'complete' immediately in sandbox/dev mode. "
            "Always call this when the user provides an address."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "address": {
                    "type": "string",
                    "description": "Full property address including city and state.",
                },
                "customer_name": {"type": "string"},
            },
            "required": ["address"],
        },
    },
    {
        "name": "get_measurement_status",
        "description": "Poll the status of a pending EagleView measurement request.",
        "input_schema": {
            "type": "object",
            "properties": {
                "measurement_id": {"type": "string"},
            },
            "required": ["measurement_id"],
        },
    },
    {
        "name": "calculate_quote",
        "description": (
            "Calculate a roofing quote. Pass measurement_id if measurements were retrieved "
            "via EagleView — roof area, pitch, and waste factor will be filled in automatically. "
            "Otherwise provide roof_area_sqft and pitch manually."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "roof_type": {
                    "type": "string",
                    "enum": ["asphalt", "metal", "tile", "flat", "other"],
                },
                "pitch": {
                    "type": "string",
                    "enum": ["low", "medium", "steep", "complex"],
                    "description": "Required only if no measurement_id is provided.",
                },
                "roof_area_sqft": {
                    "type": "number",
                    "description": "Required only if no measurement_id is provided.",
                },
                "measurement_id": {
                    "type": "string",
                    "description": "ID from request_roof_measurements. Overrides area/pitch/waste.",
                },
                "material_grade": {
                    "type": "string",
                    "enum": ["economy", "standard", "premium"],
                },
                "layers_to_remove": {"type": "integer"},
                "waste_factor": {
                    "type": "number",
                    "description": "Override the EagleView waste factor if needed.",
                },
                "labor_rate_per_square": {"type": "number"},
                "disposal_cost": {"type": "number"},
                "transport_cost": {"type": "number"},
                "permit_cost": {"type": "number"},
                "equipment_cost": {"type": "number"},
                "overhead_pct": {"type": "number"},
                "markup_pct": {"type": "number"},
                "customer_name": {"type": "string"},
                "property_address": {"type": "string"},
            },
            "required": ["roof_type"],
        },
    },
    {
        "name": "get_similar_quotes",
        "description": "Retrieve past quotes for similar jobs to inform pricing decisions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "roof_type": {"type": "string"},
                "area_sqft": {"type": "number"},
            },
            "required": ["roof_type", "area_sqft"],
        },
    },
]


def _run_tool(name: str, tool_input: dict) -> tuple[str, dict | None, str | None, dict | None]:
    """Returns (tool_result_json, breakdown_or_None, quote_id_or_None, measurement_summary_or_None)."""

    if name == "request_roof_measurements":
        from app.measurement.provider import PropertyInput
        prop = PropertyInput(
            address=tool_input["address"],
            customer_name=tool_input.get("customer_name"),
        )
        provider = get_provider()
        m = provider.create_request(prop)
        mid = save_measurement(m)

        summary = {
            "measurement_id": mid,
            "id": mid,
            "status": m.status,
            "address": m.address,
            "provider": m.provider,
            "total_roof_area_sqft": m.total_roof_area_sqft,
            "roof_squares": m.roof_squares,
            "predominant_pitch": m.predominant_pitch,
            "pitch_normalized": m.pitch_normalized,
            "facets_count": m.facets_count,
            "ridge_length_ft": m.ridge_length_ft,
            "valley_length_ft": m.valley_length_ft,
            "eave_length_ft": m.eave_length_ft,
            "rake_length_ft": m.rake_length_ft,
            "waste_factor": m.waste_factor,
            "roof_material": m.roof_material,
            "roof_condition_rating": m.roof_condition_rating,
            "roof_age_years": m.roof_age_years,
            "image_tokens": m.image_tokens,
            "report_pdf_url": m.report_pdf_url,
            "captured_at": m.captured_at,
        }
        return json.dumps(summary), None, None, summary

    if name == "get_measurement_status":
        mid = tool_input["measurement_id"]
        row = get_measurement(mid)
        if not row:
            return json.dumps({"error": "Measurement not found"}), None, None, None
        if row["status"] == "pending":
            # For real EagleView, poll the provider
            raw = json.loads(row.get("raw_payload_json") or "{}")
            provider_request_id = row.get("provider_request_id", "")
            if not raw.get("mock") and provider_request_id:
                try:
                    provider = get_provider()
                    updated = provider.get_status(provider_request_id)
                    from app.measurement.store import update_measurement_status
                    if updated.status == "complete":
                        update_measurement_complete(mid, updated)
                        row = get_measurement(mid)
                    else:
                        update_measurement_status(mid, updated.status, updated.raw_payload)
                        row["status"] = updated.status
                except Exception as e:
                    return json.dumps({"error": str(e), "measurement_id": mid}), None, None, None

        # Build full summary for the frontend
        summary = {
            "measurement_id": mid,
            "id": mid,
            "status": row.get("status"),
            "address": row.get("address"),
            "provider": row.get("provider", "eagleview"),
            "total_roof_area_sqft": row.get("total_roof_area_sqft"),
            "roof_squares": row.get("roof_squares"),
            "predominant_pitch": row.get("predominant_pitch"),
            "pitch_normalized": row.get("pitch_normalized"),
            "facets_count": row.get("facets_count"),
            "ridge_length_ft": row.get("ridge_length_ft"),
            "valley_length_ft": row.get("valley_length_ft"),
            "eave_length_ft": row.get("eave_length_ft"),
            "rake_length_ft": row.get("rake_length_ft"),
            "waste_factor": row.get("waste_factor"),
            "roof_material": row.get("roof_material"),
            "roof_condition_rating": row.get("roof_condition_rating"),
            "roof_age_years": row.get("roof_age_years"),
            "image_tokens": row.get("image_tokens") or [],
            "report_pdf_url": row.get("report_pdf_url"),
            "captured_at": row.get("captured_at"),
        }
        measurement_out = summary if row.get("status") == "complete" else None
        return json.dumps(summary), None, None, measurement_out

    if name == "calculate_quote":
        mid = tool_input.get("measurement_id")
        area_sqft = tool_input.get("roof_area_sqft")
        pitch = tool_input.get("pitch", "medium")
        waste = tool_input.get("waste_factor", 0.12)
        address = tool_input.get("property_address")

        # Pull measurements from DB when measurement_id is provided
        if mid:
            row = get_measurement(mid)
            if row:
                area_sqft = row["total_roof_area_sqft"]
                pitch = row["pitch_normalized"]
                waste = row.get("waste_factor", waste)
                address = address or row.get("address")

        if not area_sqft:
            return json.dumps({"error": "roof_area_sqft is required when no measurement_id is provided"}), None, None, None

        inputs = JobInputs(
            customer_name=tool_input.get("customer_name"),
            property_address=address,
            roof_type=tool_input["roof_type"],
            roof_area_sqft=area_sqft,
            pitch=pitch,
            material_grade=tool_input.get("material_grade", "standard"),
            layers_to_remove=tool_input.get("layers_to_remove", 1),
            waste_factor=waste,
            labor_rate_per_square=tool_input.get("labor_rate_per_square"),
            disposal_cost=tool_input.get("disposal_cost", 0.0),
            transport_cost=tool_input.get("transport_cost", 0.0),
            permit_cost=tool_input.get("permit_cost", 0.0),
            equipment_cost=tool_input.get("equipment_cost", 0.0),
            overhead_pct=tool_input.get("overhead_pct", 0.15),
            markup_pct=tool_input.get("markup_pct", 0.20),
            measurement_id=mid,
        )
        breakdown = calculate(inputs)
        quote = Quote(
            customer_name=inputs.customer_name,
            property_address=inputs.property_address,
            inputs=inputs,
            breakdown=breakdown,
            measurement_id=mid,
        )
        qid = save_quote_direct(quote)
        result = {**breakdown.model_dump(), "quote_id": qid}
        return json.dumps(result), breakdown.model_dump(), qid, None

    if name == "get_similar_quotes":
        results = get_similar_quotes(tool_input["roof_type"], tool_input["area_sqft"])
        return json.dumps(results), None, None, None

    return json.dumps({"error": f"Unknown tool: {name}"}), None, None, None


def chat(messages: list[ChatMessage]) -> tuple[str, dict | None, str | None, dict | None]:
    """Returns (reply, breakdown_or_None, quote_id_or_None, measurement_summary_or_None)."""
    api_messages = [{"role": m.role, "content": m.content} for m in messages]

    breakdown_result = None
    quote_id_result = None
    measurement_result = None

    while True:
        response = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=4096,
            thinking={"type": "adaptive"},
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=TOOLS,
            messages=api_messages,
        )

        if response.stop_reason == "end_turn":
            text = next(
                (b.text for b in response.content if hasattr(b, "text")), ""
            )
            return text, breakdown_result, quote_id_result, measurement_result

        if response.stop_reason == "tool_use":
            api_messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result_str, bd, qid, msmt = _run_tool(block.name, block.input)
                    if bd:
                        breakdown_result = bd
                    if qid:
                        quote_id_result = qid
                    if msmt:
                        measurement_result = msmt
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_str,
                    })
            api_messages.append({"role": "user", "content": tool_results})
            continue

        text = next(
            (b.text for b in response.content if hasattr(b, "text")), "Something went wrong."
        )
        return text, breakdown_result, quote_id_result, measurement_result

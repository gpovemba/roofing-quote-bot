import os
import json
import anthropic
from app.models import ChatMessage, JobInputs, Quote, MeasurementSummary
from app.business.calculator import calculate
from app.history.store import save_quote_direct, get_similar_quotes, update_quote_notes
from app.knowledge.store import search as search_documents, titles_for_agent
from app.measurement.eagleview import get_provider
from app.measurement.store import save_measurement, get_measurement, update_measurement_complete
from app.business.profile import get_profile, profile_summary_for_agent

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

After complete measurements, ask only for what is specific to this job:
  - Roof type / material (asphalt, metal, tile, flat)
  - Material grade (economy, standard, premium). Mention the owner's actual
    product for each grade from the business profile below.
  - Number of existing layers to tear off

Do NOT ask for material prices, labor rates, disposal, delivery, permit fees,
overhead, or markup. Those come from the owner's business profile and are
applied automatically. Only pass one of those overrides to calculate_quote if
the user volunteers a job-specific number (e.g. "permit is $400 on this one").

Then call calculate_quote. Quotes are saved automatically. Summarize the result
briefly: the final price, the main product, and any line items flagged as
estimated (roof edges estimated from area, not measured).

If no address is available, fall back to asking for roof size and pitch manually.

Company documents (warranties, supplier catalogs, policies, installation specs):
- When the user asks about warranties, products, what's included, extra charges,
  payment terms, or installation requirements, call search_documents and answer
  ONLY from what it returns. Name the document you used, e.g. "(Workmanship Warranty)".
- If the search returns nothing relevant, say the documents don't cover it. Never
  invent warranty terms, prices for extras, or policies.
- Prices for the quote itself always come from calculate_quote, never from documents.

After every calculate_quote, automatically:
  1. Call search_documents for the warranty that applies, what the job includes,
     and any likely extra charges (for example decking replacement on older roofs).
  2. Call save_quote_notes with 2 to 5 short, customer-facing notes built only from
     those results. Write them for the homeowner, in plain language, with no internal
     costs, overhead, or markup. Skip this step if no documents are uploaded.

Tools:
- request_roof_measurements: Trigger EagleView for a property address.
- get_measurement_status: Poll a pending measurement by measurement_id.
- calculate_quote: Run the pricing engine. Pass measurement_id when available.
- get_similar_quotes: Look up past jobs for pricing context.
- search_documents: Search the company's uploaded documents.
- save_quote_notes: Attach customer-facing notes to a saved quote.

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
                    "description": "Override only if the user gives a job-specific waste factor.",
                },
                "labor_rate_per_square": {"type": "number", "description": "Job-specific override only."},
                "disposal_cost": {"type": "number", "description": "Job-specific override only."},
                "transport_cost": {"type": "number", "description": "Job-specific override only."},
                "permit_cost": {"type": "number", "description": "Job-specific override only."},
                "equipment_cost": {"type": "number", "description": "Job-specific override only."},
                "overhead_pct": {"type": "number", "description": "Job-specific override only, as a decimal."},
                "markup_pct": {"type": "number", "description": "Job-specific override only, as a decimal."},
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
    {
        "name": "search_documents",
        "description": (
            "Search the roofing company's uploaded documents (warranties, supplier catalogs, "
            "company policies, installation specs). Returns the most relevant passages with "
            "the document name and page. Use specific wording, e.g. 'decking replacement "
            "extra charge' or 'workmanship warranty transfer'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to look for."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "save_quote_notes",
        "description": (
            "Attach customer-facing notes to a saved quote. They appear on the quote and on "
            "the printed estimate. Use only facts from search_documents results."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "quote_id": {"type": "string"},
                "notes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "2 to 5 short notes, one sentence each.",
                },
            },
            "required": ["quote_id", "notes"],
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
        waste = tool_input.get("waste_factor")
        address = tool_input.get("property_address")
        edges = {}

        # Pull measurements from DB when measurement_id is provided
        if mid:
            row = get_measurement(mid)
            if row:
                area_sqft = row["total_roof_area_sqft"]
                pitch = row["pitch_normalized"]
                if waste is None:
                    waste = row.get("waste_factor")
                address = address or row.get("address")
                edges = {
                    k: row.get(k)
                    for k in ("eave_length_ft", "rake_length_ft", "ridge_length_ft", "valley_length_ft")
                }

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
            disposal_cost=tool_input.get("disposal_cost"),
            transport_cost=tool_input.get("transport_cost"),
            permit_cost=tool_input.get("permit_cost"),
            equipment_cost=tool_input.get("equipment_cost"),
            overhead_pct=tool_input.get("overhead_pct"),
            markup_pct=tool_input.get("markup_pct"),
            measurement_id=mid,
            **edges,
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

    if name == "search_documents":
        results = search_documents(tool_input["query"])
        if not results:
            return json.dumps({"results": [], "note": "No matching passages in the company's documents."}), None, None, None
        return json.dumps({"results": results}), None, None, None

    if name == "save_quote_notes":
        notes = [n.strip() for n in tool_input.get("notes", []) if n and n.strip()][:6]
        updated = update_quote_notes(tool_input["quote_id"], notes)
        if updated is None:
            return json.dumps({"error": "Quote not found"}), None, None, None
        return json.dumps({"ok": True, "notes_saved": len(notes)}), updated, tool_input["quote_id"], None

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
    profile_text = profile_summary_for_agent(get_profile())
    docs_text = titles_for_agent()

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
                },
                {
                    "type": "text",
                    "text": "Business profile (prices applied automatically):\n" + profile_text
                            + "\n\nCompany documents available to search_documents:\n" + docs_text,
                },
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

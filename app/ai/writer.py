"""
Writes the customer-facing parts of a quote: a short project overview and
notes grounded in the company's documents (warranty, inclusions, extras).

This is the RAG step of the quote builder: retrieve relevant passages from
the owner's documents, then have Claude write from those passages only.
"""
import json
import os
import re

import anthropic

from app.knowledge.store import search

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-7")

PROJECT_LABELS = {
    "replacement": "full roof replacement",
    "repair": "roof repair",
    "new_construction": "new construction roof",
    "inspection": "roof inspection",
}


def _queries(b: dict) -> list[str]:
    kind = PROJECT_LABELS.get(b.get("project_type"), "roof replacement")
    q = [f"warranty coverage {kind}", f"what is included in a {kind}", "deposit payment terms"]
    if b.get("layers_to_remove", 0) > 0:
        q.append("rotted decking replacement extra charge")
    for it in b.get("line_items", []):
        if it["category"] == "extra":
            q.append(it["name"])
    return q


def _retrieve(b: dict, limit: int = 8) -> list[dict]:
    seen, passages = set(), []
    for q in _queries(b):
        for r in search(q, top_k=3):
            key = (r["document"], r["text"][:80])
            if key not in seen:
                seen.add(key)
                passages.append(r)
    return passages[:limit]


def _fallback_overview(b: dict, inputs: dict) -> str:
    kind = PROJECT_LABELS.get(b.get("project_type"), "roofing project")
    product = next((i["name"] for i in b.get("line_items", []) if i["category"] == "material"), "")
    parts = [f"{kind.capitalize()} of approximately {b.get('roof_area_sqft', 0):,.0f} sq ft"]
    if product:
        parts.append(f"with {product}")
    if b.get("layers_to_remove"):
        parts.append(f"including removal of {b['layers_to_remove']} existing layer{'s' if b['layers_to_remove'] != 1 else ''}")
    return " ".join(parts) + "."


def write_quote_text(b: dict, inputs: dict) -> tuple[str, list[str], list[str]]:
    """Returns (overview, customer_notes, source_document_titles)."""
    passages = _retrieve(b)
    sources = sorted({p["document"] for p in passages})
    scope = [f"- {i['name']} ({i['quantity']:g} {i['unit']})" for i in b.get("line_items", [])
             if i["category"] in ("material", "accessory", "extra", "tearoff", "inspection")]
    docs = "\n\n".join(f"[{p['document']}{' › ' + p['section'] if p.get('section') else ''}]\n{p['text']}"
                       for p in passages) or "(no company documents uploaded)"

    prompt = f"""You are writing the customer-facing text for a roofing estimate.

Job:
- Type: {PROJECT_LABELS.get(b.get('project_type'), 'roofing project')}
- Roof: {b.get('roof_type')} , {b.get('material_grade')} grade, {b.get('roof_area_sqft', 0):,.0f} sq ft, {b.get('pitch')} pitch
- Layers to remove: {b.get('layers_to_remove', 0)}
- Contractor's notes about the job: {inputs.get('details') or 'none'}
Scope items:
{chr(10).join(scope)}

Company documents (the ONLY source you may use for notes):
{docs}

Write JSON with exactly these keys:
"overview": 1-2 plain sentences describing the work for the homeowner. Use the job details above. No prices.
"notes": 2 to 5 short notes for the homeowner (one sentence each) about warranty, what's included, likely extra charges, and payment terms. Every fact must come from the company documents. If the documents are empty, return an empty list.

Return only the JSON object."""

    try:
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        resp = client.messages.create(
            model=MODEL, max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(block.text for block in resp.content if getattr(block, "type", "") == "text")
        data = json.loads(re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip())
        overview = str(data.get("overview") or "").strip() or _fallback_overview(b, inputs)
        notes = [str(n).strip() for n in data.get("notes", []) if str(n).strip()][:5]
        return overview, notes, sources
    except Exception:
        return _fallback_overview(b, inputs), [], sources

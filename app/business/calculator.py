"""
Line-item quote calculator.

Prices every job from the owner's business profile: their products and
supplier prices, crew rates, local costs, overhead and markup. Quantities
come from the roof measurements (EagleView when available). When the
roof's edge lengths aren't known, they're estimated from the roof area
and the affected line items are flagged as estimated.
"""
import math

from app.models import JobInputs, LineItem, QuoteBreakdown
from app.business.profile import BusinessProfile, get_profile

# Roof area / footprint area for each pitch bucket
SLOPE_FACTOR = {"low": 1.03, "medium": 1.12, "steep": 1.25, "complex": 1.20}


def _edges(inputs: JobInputs) -> tuple[dict[str, float], bool]:
    """Return eave/rake/ridge/valley lengths in ft, plus whether any were estimated."""
    known = {
        "eave": inputs.eave_length_ft,
        "rake": inputs.rake_length_ft,
        "ridge": inputs.ridge_length_ft,
        "valley": inputs.valley_length_ft,
    }
    if all(v is not None for v in known.values()):
        return {k: float(v) for k, v in known.items()}, False

    # Estimate from a simple gable roof on a 1.6 : 1 rectangular footprint.
    sf = SLOPE_FACTOR.get(inputs.pitch, 1.12)
    footprint = inputs.roof_area_sqft / sf
    width = math.sqrt(footprint / 1.6)
    length = 1.6 * width
    guess = {
        "eave": 2 * length,
        "rake": 2 * width * sf,
        "ridge": length,
        "valley": 0.25 * length if inputs.pitch == "complex" else 0.0,
    }
    if inputs.roof_type == "flat":
        guess.update(eave=2 * (length + width), rake=0.0, ridge=0.0, valley=0.0)

    edges, estimated = {}, False
    for k, v in known.items():
        if v is None:
            edges[k] = round(guess[k], 1)
            estimated = True
        else:
            edges[k] = float(v)
    return edges, estimated


def _measure_for(basis: str, adjusted_squares: float, edges: dict[str, float]) -> float:
    return {
        "per_square": adjusted_squares,
        "eave_ft": edges["eave"],
        "rake_ft": edges["rake"],
        "ridge_ft": edges["ridge"],
        "valley_ft": edges["valley"],
        "eave_rake_ft": edges["eave"] + edges["rake"],
        "eave_valley_ft": edges["eave"] + edges["valley"],
        "per_job": 1.0,
    }[basis]


BASIS_LABEL = {
    "per_square": "sq",
    "eave_ft": "ft of eaves",
    "rake_ft": "ft of rakes",
    "ridge_ft": "ft of ridge",
    "valley_ft": "ft of valleys",
    "eave_rake_ft": "ft of eaves + rakes",
    "eave_valley_ft": "ft of eaves + valleys",
}


def _fmt(n: float) -> str:
    return f"{n:,.1f}".rstrip("0").rstrip(".")


def calculate(inputs: JobInputs, profile: BusinessProfile | None = None) -> QuoteBreakdown:
    profile = profile or get_profile()
    system = profile.roof_systems.get(inputs.roof_type) or profile.roof_systems["other"]
    product = system.tiers.get(inputs.material_grade) or system.tiers["standard"]
    lc, pr, lab = profile.local_costs, profile.pricing, profile.labor

    if inputs.project_type == "inspection":
        return _inspection_quote(inputs, profile)
    if inputs.project_type == "new_construction":
        inputs = inputs.model_copy(update={"layers_to_remove": 0})

    squares = inputs.roof_area_sqft / 100
    waste = inputs.waste_factor if inputs.waste_factor is not None else system.waste_factor
    adjusted_sqft = inputs.roof_area_sqft * (1 + waste)
    adjusted_squares = adjusted_sqft / 100
    edges, edges_estimated = _edges(inputs)

    items: list[LineItem] = []

    # ── Main roofing material ────────────────────────────────────────────
    qty = math.ceil(adjusted_squares * product.units_per_square)
    items.append(LineItem(
        category="material", name=product.product, supplier=product.supplier,
        quantity=qty, unit=product.unit, unit_price=product.unit_price,
        total=round(qty * product.unit_price, 2),
        detail=f"{_fmt(adjusted_squares)} sq (incl. {waste:.0%} waste) × {_fmt(product.units_per_square)} {product.unit}/sq",
    ))

    # ── Accessories and chosen add-ons ──────────────────────────────────
    for acc in profile.accessories:
        if not acc.enabled or acc.unit_price <= 0 or inputs.roof_type not in acc.applies_to:
            continue
        if acc.group == "underlayment" and not inputs.include_underlayment:
            continue
        if acc.group == "accessories" and not inputs.include_accessories:
            continue
        chosen_qty = None
        if acc.group == "extra":
            if acc.id not in inputs.extras:
                continue
            chosen_qty = inputs.extras.get(acc.id)
        measure = _measure_for(acc.basis, adjusted_squares, edges)
        if chosen_qty:
            qty, detail = chosen_qty, "Quantity entered for this job"
        elif acc.basis == "per_job":
            qty, detail = acc.coverage, f"{_fmt(acc.coverage)} per job"
        else:
            if measure <= 0 or acc.coverage <= 0:
                continue
            qty = math.ceil(measure / acc.coverage)
            detail = f"{_fmt(measure)} {BASIS_LABEL[acc.basis]} ÷ {_fmt(acc.coverage)} per {acc.unit}"
        is_est = edges_estimated and not chosen_qty and acc.basis not in ("per_square", "per_job")
        items.append(LineItem(
            category="extra" if acc.group == "extra" else "accessory",
            name=acc.name, supplier=acc.supplier,
            quantity=qty, unit=acc.unit, unit_price=acc.unit_price,
            total=round(qty * acc.unit_price, 2), detail=detail, estimated=is_est,
        ))

    # ── Labor ────────────────────────────────────────────────────────────
    labor_rate = inputs.labor_rate_per_square if inputs.labor_rate_per_square is not None else system.labor_per_square
    pitch_adder = lab.pitch_adder_per_square.get(inputs.pitch, 0.0)
    labor_cost = round(squares * (labor_rate + pitch_adder), 2)
    labor_detail = f"{_fmt(squares)} sq × ${labor_rate:,.0f}/sq"
    if pitch_adder:
        labor_detail += f" + ${pitch_adder:,.0f}/sq {inputs.pitch} pitch"
    items.append(LineItem(
        category="labor", name="Installation labor", quantity=round(squares, 2), unit="sq",
        unit_price=labor_rate + pitch_adder, total=labor_cost, detail=labor_detail,
    ))

    # ── Tear-off and disposal ────────────────────────────────────────────
    tearoff_cost = 0.0
    disposal_cost = 0.0
    if inputs.layers_to_remove > 0:
        tearoff_cost = round(squares * lab.tearoff_per_square_per_layer * inputs.layers_to_remove, 2)
        items.append(LineItem(
            category="tearoff", name="Tear-off", quantity=round(squares * inputs.layers_to_remove, 2),
            unit="sq", unit_price=lab.tearoff_per_square_per_layer, total=tearoff_cost,
            detail=f"{_fmt(squares)} sq × {inputs.layers_to_remove} layer{'s' if inputs.layers_to_remove != 1 else ''}",
        ))
        if inputs.disposal_cost is not None:
            disposal_cost = inputs.disposal_cost
            items.append(LineItem(category="disposal", name="Disposal", quantity=1, unit="job",
                                  unit_price=disposal_cost, total=disposal_cost, detail="Entered for this job"))
        elif lc.dumpster_price > 0 and lc.squares_per_dumpster > 0:
            loads = math.ceil(squares * inputs.layers_to_remove / lc.squares_per_dumpster)
            disposal_cost = loads * lc.dumpster_price
            items.append(LineItem(
                category="disposal", name="Dumpster", quantity=loads, unit="load",
                unit_price=lc.dumpster_price, total=disposal_cost,
                detail=f"{_fmt(squares * inputs.layers_to_remove)} sq of tear-off ÷ {_fmt(lc.squares_per_dumpster)} sq per load",
            ))
    elif inputs.disposal_cost:
        disposal_cost = inputs.disposal_cost
        items.append(LineItem(category="disposal", name="Disposal", quantity=1, unit="job",
                              unit_price=disposal_cost, total=disposal_cost, detail="Entered for this job"))

    # ── Job fees (profile defaults unless overridden for this job) ──────
    def fee(override, default):
        return override if override is not None else default

    transport_cost = fee(inputs.transport_cost, lc.delivery_fee)
    permit_cost = fee(inputs.permit_cost, lc.permit_fee)
    equipment_cost = fee(inputs.equipment_cost, lc.equipment_fee)
    for name, amount, override in (
        ("Material delivery", transport_cost, inputs.transport_cost),
        ("Permit", permit_cost, inputs.permit_cost),
        ("Equipment", equipment_cost, inputs.equipment_cost),
    ):
        if amount:
            items.append(LineItem(
                category="fees", name=name, quantity=1, unit="job", unit_price=amount, total=amount,
                detail="Entered for this job" if override is not None else "From business profile",
            ))

    head = dict(
        roof_area_sqft=inputs.roof_area_sqft,
        roof_area_squares=round(squares, 2),
        waste_factor=waste,
        adjusted_area_sqft=round(adjusted_sqft, 2),
        adjusted_squares=round(adjusted_squares, 2),
        roof_type=inputs.roof_type,
        material_grade=inputs.material_grade,
        labor_rate_per_square=labor_rate,
        pitch=inputs.pitch,
        pitch_adder_per_square=pitch_adder,
        layers_to_remove=inputs.layers_to_remove,
        tearoff_rate_per_square=lab.tearoff_per_square_per_layer,
        edges_estimated=edges_estimated,
        project_type=inputs.project_type,
    )
    return _finalize(head, items, inputs, profile)


def _inspection_quote(inputs: JobInputs, profile: BusinessProfile) -> QuoteBreakdown:
    fee = profile.local_costs.inspection_fee
    items = [LineItem(category="inspection", name="Roof inspection", quantity=1, unit="visit",
                      unit_price=fee, total=fee, detail="Inspection visit with photo report")]
    squares = inputs.roof_area_sqft / 100
    head = dict(
        roof_area_sqft=inputs.roof_area_sqft, roof_area_squares=round(squares, 2), waste_factor=0,
        adjusted_area_sqft=inputs.roof_area_sqft, adjusted_squares=round(squares, 2),
        roof_type=inputs.roof_type, material_grade=inputs.material_grade,
        labor_rate_per_square=0, pitch=inputs.pitch, pitch_adder_per_square=0,
        layers_to_remove=0, tearoff_rate_per_square=0, edges_estimated=False,
        project_type="inspection",
    )
    return _finalize(head, items, inputs, profile, apply_minimum=False)


def _finalize(head: dict, items: list[LineItem], inputs: JobInputs, profile: BusinessProfile,
              apply_minimum: bool = True) -> QuoteBreakdown:
    pr = profile.pricing
    overhead_pct = inputs.overhead_pct if inputs.overhead_pct is not None else pr.overhead_pct
    markup_pct = inputs.markup_pct if inputs.markup_pct is not None else pr.markup_pct
    data = {
        **head,
        "line_items": [i.model_dump() for i in items],
        "overhead_pct": overhead_pct,
        "markup_pct": markup_pct,
        "material_tax_pct": pr.material_tax_pct,
        "minimum_job_price": pr.minimum_job_price if apply_minimum else 0.0,
        "company_name": profile.company.name or None,
        "company_phone": profile.company.phone or None,
        "company_email": profile.company.email or None,
        "company_license": profile.company.license_number or None,
        "quote_settings": {"validity_days": 30, "show_line_prices": True, "include_notes": True},
    }
    return QuoteBreakdown(**recalculate(data))


MATERIAL_CATEGORIES = ("material", "accessory")


def recalculate(b: dict) -> dict:
    """Recompute every total from the line items. Used when a quote is first
    built and again whenever the owner edits line items or margins."""
    items = b.get("line_items", [])
    for it in items:
        it["total"] = round(float(it["quantity"]) * float(it["unit_price"]), 2)

    def cat_sum(*cats):
        return round(sum(it["total"] for it in items if it["category"] in cats), 2)

    material_cost = cat_sum(*MATERIAL_CATEGORIES)
    material_tax = round(material_cost * b.get("material_tax_pct", 0.0), 2)
    fees = [it for it in items if it["category"] == "fees"]
    fee = lambda name: round(sum(it["total"] for it in fees if it["name"] == name), 2)

    direct = round(sum(it["total"] for it in items) + material_tax, 2)
    overhead = direct * b["overhead_pct"]
    total_cost = direct + overhead
    final = total_cost * (1 + b["markup_pct"])
    minimum_applied = False
    if b.get("minimum_job_price") and final < b["minimum_job_price"]:
        final, minimum_applied = b["minimum_job_price"], True
    profit = final - total_cost
    adj_sq = b.get("adjusted_squares") or 0

    b.update(
        material_cost=material_cost,
        material_tax=material_tax,
        material_rate_per_square=round(material_cost / adj_sq, 2) if adj_sq else 0,
        labor_cost=cat_sum("labor"),
        tearoff_cost=cat_sum("tearoff"),
        disposal_cost=cat_sum("disposal"),
        transport_cost=fee("Material delivery"),
        misc_cost=round(cat_sum("fees", "extra", "custom", "inspection") - fee("Material delivery"), 2),
        direct_cost=direct,
        overhead_cost=round(overhead, 2),
        total_cost=round(total_cost, 2),
        final_quote=round(final, 2),
        profit=round(profit, 2),
        profit_margin=round(profit / final, 4) if final > 0 else 0.0,
        minimum_applied=minimum_applied,
    )
    return b

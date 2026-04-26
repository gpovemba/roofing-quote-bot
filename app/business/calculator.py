from app.models import JobInputs, QuoteBreakdown
from app.business.pricing import DEFAULT_PRICING


def calculate(inputs: JobInputs) -> QuoteBreakdown:
    pricing = DEFAULT_PRICING

    roof_area_squares = inputs.roof_area_sqft / 100
    waste = inputs.waste_factor if inputs.waste_factor else pricing["waste_factor"].get(inputs.roof_type, 0.12)
    adjusted_area_sqft = inputs.roof_area_sqft * (1 + waste)

    # Material cost: rate per square applied to adjusted area
    mat_rates = pricing["materials"].get(inputs.roof_type, pricing["materials"]["other"])
    mat_rate = mat_rates.get(inputs.material_grade, mat_rates["standard"])
    material_cost = (adjusted_area_sqft / 100) * mat_rate

    # Labor cost
    labor_rate = inputs.labor_rate_per_square or pricing["labor_per_square"].get(inputs.roof_type, 100)
    pitch_mult = pricing["pitch_multiplier"].get(inputs.pitch, 1.0)
    labor_cost = roof_area_squares * labor_rate * pitch_mult

    # Tear-off
    tearoff_cost = roof_area_squares * pricing["tearoff_rate_per_square"] * inputs.layers_to_remove

    # Pass-through costs
    disposal_cost = inputs.disposal_cost
    transport_cost = inputs.transport_cost
    misc_cost = inputs.permit_cost + inputs.equipment_cost

    direct_cost = material_cost + labor_cost + tearoff_cost + disposal_cost + transport_cost + misc_cost

    overhead_cost = direct_cost * inputs.overhead_pct
    total_cost = direct_cost + overhead_cost
    final_quote = total_cost * (1 + inputs.markup_pct)
    profit = final_quote - total_cost
    profit_margin = profit / final_quote if final_quote > 0 else 0.0

    return QuoteBreakdown(
        roof_area_sqft=inputs.roof_area_sqft,
        roof_area_squares=round(roof_area_squares, 2),
        waste_factor=waste,
        adjusted_area_sqft=round(adjusted_area_sqft, 2),
        adjusted_squares=round(adjusted_area_sqft / 100, 2),
        roof_type=inputs.roof_type,
        material_grade=inputs.material_grade,
        material_rate_per_square=mat_rate,
        material_cost=round(material_cost, 2),
        labor_rate_per_square=labor_rate,
        pitch=inputs.pitch,
        pitch_multiplier=pitch_mult,
        labor_cost=round(labor_cost, 2),
        layers_to_remove=inputs.layers_to_remove,
        tearoff_rate_per_square=pricing["tearoff_rate_per_square"],
        tearoff_cost=round(tearoff_cost, 2),
        disposal_cost=round(disposal_cost, 2),
        transport_cost=round(transport_cost, 2),
        misc_cost=round(misc_cost, 2),
        direct_cost=round(direct_cost, 2),
        overhead_pct=inputs.overhead_pct,
        overhead_cost=round(overhead_cost, 2),
        markup_pct=inputs.markup_pct,
        total_cost=round(total_cost, 2),
        final_quote=round(final_quote, 2),
        profit=round(profit, 2),
        profit_margin=round(profit_margin, 4),
    )

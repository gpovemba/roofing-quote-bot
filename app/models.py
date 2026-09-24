from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class JobInputs(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    property_address: Optional[str] = None
    # replacement, repair, new_construction, inspection
    project_type: str = "replacement"
    details: Optional[str] = None
    roof_type: str  # asphalt, metal, tile, flat, other
    roof_area_sqft: float
    pitch: str  # low, medium, steep, complex
    material_grade: str = "standard"  # economy, standard, premium
    layers_to_remove: int = 1
    # Roof edge lengths (from EagleView when available; estimated otherwise)
    eave_length_ft: Optional[float] = None
    rake_length_ft: Optional[float] = None
    ridge_length_ft: Optional[float] = None
    valley_length_ft: Optional[float] = None
    # Optional overrides. Leave as None to use the business profile.
    waste_factor: Optional[float] = None
    labor_rate_per_square: Optional[float] = None
    disposal_cost: Optional[float] = None
    transport_cost: Optional[float] = None
    permit_cost: Optional[float] = None
    equipment_cost: Optional[float] = None
    overhead_pct: Optional[float] = None
    markup_pct: Optional[float] = None
    measurement_id: Optional[str] = None
    # Scope choices from the quote builder
    include_underlayment: bool = True
    include_accessories: bool = True
    extras: dict[str, Optional[float]] = {}   # add-on id -> quantity (None = automatic)


class LineItem(BaseModel):
    category: str        # material, accessory, extra, labor, tearoff, disposal, fees, inspection, custom
    name: str
    quantity: float
    unit: str
    unit_price: float
    total: float
    supplier: str = ""
    detail: str = ""     # how the quantity was worked out
    estimated: bool = False  # quantity based on estimated roof edges


class QuoteBreakdown(BaseModel):
    # Area
    roof_area_sqft: float
    roof_area_squares: float
    waste_factor: float
    adjusted_area_sqft: float
    adjusted_squares: float
    # Material
    roof_type: str
    material_grade: str
    material_rate_per_square: float
    material_cost: float
    # Labor
    labor_rate_per_square: float
    pitch: str
    pitch_multiplier: float = 1.0  # legacy; newer quotes use pitch_adder_per_square
    labor_cost: float
    # Tear-off
    layers_to_remove: int
    tearoff_rate_per_square: float
    tearoff_cost: float
    # Pass-throughs
    disposal_cost: float
    transport_cost: float
    misc_cost: float
    # Totals
    direct_cost: float
    overhead_pct: float
    overhead_cost: float
    markup_pct: float
    total_cost: float
    final_quote: float
    profit: float
    profit_margin: float
    # Added with the business profile (optional so older saved quotes still load)
    line_items: list[LineItem] = []
    material_tax: float = 0.0
    pitch_adder_per_square: float = 0.0
    minimum_applied: bool = False
    edges_estimated: bool = False
    company_name: Optional[str] = None
    company_phone: Optional[str] = None
    company_email: Optional[str] = None
    company_license: Optional[str] = None
    customer_notes: list[str] = []   # added by the bot from the owner's documents
    overview: str = ""                # short project summary for the customer
    project_type: str = "replacement"
    material_tax_pct: float = 0.0
    minimum_job_price: float = 0.0
    quote_settings: dict = {}         # validity_days, show_line_prices, include_notes


class MeasurementSummary(BaseModel):
    id: str
    provider: str
    address: str
    total_roof_area_sqft: float
    roof_squares: float
    predominant_pitch: str
    pitch_normalized: str
    facets_count: Optional[int] = None
    # Linear lengths — present in mock, not in Property Data V2 API
    ridge_length_ft: Optional[float] = None
    valley_length_ft: Optional[float] = None
    eave_length_ft: Optional[float] = None
    rake_length_ft: Optional[float] = None
    waste_factor: float
    # Extra fields from Property Data V2 API
    roof_material: Optional[str] = None
    roof_condition_rating: Optional[str] = None
    roof_age_years: Optional[float] = None
    image_tokens: list[str] = []
    report_pdf_url: Optional[str] = None
    status: str
    captured_at: Optional[str] = None


class Quote(BaseModel):
    id: Optional[str] = None
    customer_name: Optional[str] = None
    property_address: Optional[str] = None
    inputs: JobInputs
    breakdown: QuoteBreakdown
    measurement_id: Optional[str] = None
    created_at: Optional[datetime] = None
    notes: Optional[str] = None


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    message: str
    quote: Optional[QuoteBreakdown] = None
    quote_id: Optional[str] = None
    measurement: Optional[MeasurementSummary] = None

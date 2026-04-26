from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class JobInputs(BaseModel):
    customer_name: Optional[str] = None
    property_address: Optional[str] = None
    roof_type: str  # asphalt, metal, tile, flat, other
    roof_area_sqft: float
    pitch: str  # low, medium, steep, complex
    material_grade: str = "standard"  # economy, standard, premium
    layers_to_remove: int = 1
    waste_factor: float = 0.12
    labor_rate_per_square: Optional[float] = None
    disposal_cost: float = 0.0
    transport_cost: float = 0.0
    permit_cost: float = 0.0
    equipment_cost: float = 0.0
    overhead_pct: float = 0.15
    markup_pct: float = 0.20
    measurement_id: Optional[str] = None


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
    pitch_multiplier: float
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

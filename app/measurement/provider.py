from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PropertyInput:
    address: str
    customer_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


@dataclass
class NormalizedRoofMeasurement:
    provider: str
    provider_request_id: str
    address: str
    lat: Optional[float]
    lng: Optional[float]
    total_roof_area_sqft: float
    roof_squares: float
    predominant_pitch: str          # e.g. "6:12"
    pitch_normalized: str           # low / medium / steep / complex
    facets_count: Optional[int]
    # Linear measurements — available from mock / classic premium report.
    # NOT returned by Property Data V2 API (area + pitch only).
    ridge_length_ft: Optional[float]
    valley_length_ft: Optional[float]
    eave_length_ft: Optional[float]
    rake_length_ft: Optional[float]
    waste_factor: float
    # Extra fields from Property Data V2 API
    roof_material: Optional[str]        # "shingle", "metal", etc.
    roof_condition_rating: Optional[str] # "good", "fair", "compromised", etc.
    roof_age_years: Optional[float]
    image_tokens: list[str]             # EagleView image tokens (fetch via /api/images/{token})
    report_pdf_url: Optional[str]
    captured_at: Optional[str]
    status: str                         # pending / processing / complete / failed
    raw_payload: dict = field(default_factory=dict)

    @property
    def imagery_urls(self) -> list[str]:
        """Back-compat alias used by older store code."""
        return self.image_tokens


def pitch_to_normalized(pitch_str: str) -> str:
    """Convert '6:12' style pitch to low/medium/steep/complex."""
    try:
        rise = float(pitch_str.split(":")[0])
    except (ValueError, IndexError):
        return "medium"
    if rise <= 3:
        return "low"
    if rise <= 6:
        return "medium"
    if rise <= 9:
        return "steep"
    return "complex"


def waste_from_pitch(pitch_normalized: str) -> float:
    return {"low": 0.07, "medium": 0.12, "steep": 0.15, "complex": 0.18}.get(pitch_normalized, 0.12)


class MeasurementProvider(ABC):
    @abstractmethod
    def create_request(self, prop: PropertyInput) -> NormalizedRoofMeasurement:
        """Submit a measurement request. Returns initial record (may have status=pending)."""

    @abstractmethod
    def get_status(self, provider_request_id: str) -> NormalizedRoofMeasurement:
        """Poll the status of a pending request."""

    @abstractmethod
    def normalize(self, payload: dict, input_address: str = "") -> NormalizedRoofMeasurement:
        """Normalize provider-specific payload to our schema."""

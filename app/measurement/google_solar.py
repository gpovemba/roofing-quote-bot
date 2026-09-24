"""
Google Solar API integration — cheap pre-quote provider.

Tier-1 provider in the two-tier quoting flow:
  Tier 1: GoogleSolarProvider  — pennies per call, ballpark estimate
  Tier 2: EagleViewProvider    — ~$10 per call, contract-grade

Uses the Building Insights endpoint to get roof segment area + pitch
without EagleView's per-report fee. Coverage is best in the U.S. and
other markets where Project Sunroof has data. Pitch is per-segment and
biased toward south-facing planes since the API is built for solar —
treat as approximate (good enough for a ballpark, not a contract).

Endpoints used:
  GET https://solar.googleapis.com/v1/buildingInsights:findClosest
  GET https://maps.googleapis.com/maps/api/geocode/json   (for address → lat/lng)

Required env var (real provider):
  GOOGLE_SOLAR_API_KEY  — Google Cloud API key with Solar API and
                          Geocoding API enabled.

Without the key, MockGoogleSolarProvider runs deterministic math so
local dev keeps working.
"""

import hashlib
import math
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import requests

from app.measurement.provider import (
    MeasurementProvider,
    NormalizedRoofMeasurement,
    PropertyInput,
    pitch_to_normalized,
    waste_from_pitch,
)

_BUILDING_INSIGHTS = "https://solar.googleapis.com/v1/buildingInsights:findClosest"
_GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json"


# ── Real provider ────────────────────────────────────────────────────────────

class GoogleSolarProvider(MeasurementProvider):

    def __init__(self):
        self._key = os.environ["GOOGLE_SOLAR_API_KEY"]

    def create_request(self, prop: PropertyInput) -> NormalizedRoofMeasurement:
        if prop.lat is not None and prop.lng is not None:
            lat, lng = prop.lat, prop.lng
        else:
            lat, lng = self._geocode(prop.address)

        resp = requests.get(
            _BUILDING_INSIGHTS,
            params={
                "location.latitude": lat,
                "location.longitude": lng,
                "requiredQuality": "LOW",
                "key": self._key,
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        return self._build(data, prop.address, lat, lng)

    def get_status(self, _: str) -> NormalizedRoofMeasurement:
        raise NotImplementedError("Google Solar API is synchronous; status is always complete.")

    def normalize(self, payload: dict, input_address: str = "") -> NormalizedRoofMeasurement:
        return self._build(payload, input_address, None, None)

    def _geocode(self, address: str) -> tuple[float, float]:
        r = requests.get(
            _GEOCODE,
            params={"address": address, "key": self._key},
            timeout=15,
        )
        r.raise_for_status()
        results = r.json().get("results") or []
        if not results:
            raise RuntimeError(f"Could not geocode address: {address}")
        loc = results[0]["geometry"]["location"]
        return loc["lat"], loc["lng"]

    def _build(
        self,
        data: dict,
        address: str,
        lat: Optional[float],
        lng: Optional[float],
    ) -> NormalizedRoofMeasurement:
        solar_potential = data.get("solarPotential") or {}
        segments = solar_potential.get("roofSegmentStats") or []

        total_m2 = 0.0
        weighted_pitch_deg = 0.0
        for seg in segments:
            area = (seg.get("stats") or {}).get("areaMeters2", 0.0) or 0.0
            pitch_deg = seg.get("pitchDegrees", 0.0) or 0.0
            total_m2 += area
            weighted_pitch_deg += area * pitch_deg

        if total_m2 <= 0:
            raise RuntimeError(
                f"Google Solar API returned no roof segments for {address}. "
                "Coverage may be unavailable for this property."
            )

        sqft = total_m2 * 10.7639
        avg_pitch_deg = weighted_pitch_deg / total_m2
        rise = max(0, round(math.tan(math.radians(avg_pitch_deg)) * 12))
        pitch_str = f"{rise}:12"
        pitch_norm = pitch_to_normalized(pitch_str)

        return NormalizedRoofMeasurement(
            provider="google_solar",
            provider_request_id=data.get("name") or f"solar-{uuid.uuid4().hex[:8]}",
            address=address,
            lat=lat,
            lng=lng,
            total_roof_area_sqft=round(sqft, 0),
            roof_squares=round(sqft / 100, 1),
            predominant_pitch=pitch_str,
            pitch_normalized=pitch_norm,
            facets_count=len(segments),
            ridge_length_ft=None,
            valley_length_ft=None,
            eave_length_ft=None,
            rake_length_ft=None,
            waste_factor=waste_from_pitch(pitch_norm),
            roof_material=None,
            roof_condition_rating=None,
            roof_age_years=None,
            image_tokens=[],
            report_pdf_url=None,
            captured_at=datetime.now(timezone.utc).isoformat(),
            status="complete",
            raw_payload=data,
        )


# ── Mock provider ────────────────────────────────────────────────────────────

class MockGoogleSolarProvider(MeasurementProvider):
    """
    Deterministic mock — runs when GOOGLE_SOLAR_API_KEY is not set.
    Returns slightly different numbers than the EagleView mock so the
    estimate-vs-contract distinction is visible end-to-end in dev.
    """

    def create_request(self, prop: PropertyInput) -> NormalizedRoofMeasurement:
        seed = int(hashlib.md5(prop.address.lower().encode()).hexdigest()[:8], 16)
        base_sqft = 1200 + (seed % 2600)
        footprint_sqft = round(base_sqft / 50) * 50
        pitches = ["3:12", "4:12", "5:12", "6:12", "7:12"]
        pitch_str = pitches[seed % len(pitches)]
        pitch_norm = pitch_to_normalized(pitch_str)
        rise = float(pitch_str.split(":")[0])
        slope = math.sqrt(1 + (rise / 12) ** 2)
        # +5% bias to mimic Solar API's segment-sum overestimate
        sqft = round(footprint_sqft * slope * 1.05 / 50) * 50
        squares = round(sqft / 100, 1)
        return NormalizedRoofMeasurement(
            provider="google_solar_mock",
            provider_request_id=f"solar-mock-{uuid.uuid4().hex[:8]}",
            address=prop.address,
            lat=prop.lat,
            lng=prop.lng,
            total_roof_area_sqft=sqft,
            roof_squares=squares,
            predominant_pitch=pitch_str,
            pitch_normalized=pitch_norm,
            facets_count=4 + (seed % 5),
            ridge_length_ft=None,
            valley_length_ft=None,
            eave_length_ft=None,
            rake_length_ft=None,
            waste_factor=waste_from_pitch(pitch_norm),
            roof_material=None,
            roof_condition_rating=None,
            roof_age_years=None,
            image_tokens=[],
            report_pdf_url=None,
            captured_at=datetime.now(timezone.utc).isoformat(),
            status="complete",
            raw_payload={"mock": True, "address": prop.address},
        )

    def get_status(self, _: str) -> NormalizedRoofMeasurement:
        raise NotImplementedError("Mock is always complete on creation")

    def normalize(self, payload: dict, input_address: str = "") -> NormalizedRoofMeasurement:
        return self.create_request(PropertyInput(address=payload.get("address", input_address)))


# ── Factory ──────────────────────────────────────────────────────────────────

def get_solar_provider() -> MeasurementProvider:
    """Real provider when GOOGLE_SOLAR_API_KEY is set, otherwise mock."""
    if os.environ.get("GOOGLE_SOLAR_API_KEY"):
        return GoogleSolarProvider()
    return MockGoogleSolarProvider()

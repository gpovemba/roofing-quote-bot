"""
EagleView Property Data V2 API integration.

Two implementations:
  MockEagleViewProvider  — instant deterministic data. Active when
                           EAGLEVIEW_CLIENT_ID is not set. Use for dev/testing.
                           Note: sandbox is limited to a ~1.5 sq mi bounding box
                           around Omaha, NE — use mock for all other addresses.

  EagleViewProvider      — real Property Data V2 API.
                           Endpoints:
                             POST https://sandbox.apis.eagleview.com/property/v2/request
                             GET  https://sandbox.apis.eagleview.com/property/v2/result/{requestId}
                             GET  https://sandbox.apis.eagleview.com/property/v2/image/{imageToken}
                           (replace sandbox subdomain with apis.eagleview.com for production)
                           Auth: Bearer JWT. Set EAGLEVIEW_TOKEN_URL to the OAuth2
                           token endpoint from your developer portal.

Product IDs used (configurable via EAGLEVIEW_PRODUCT_IDS):
  property_data_id_001  Roof Area Estimate        (required)
  property_data_id_002  Roof Pitch and Eave Height (required)
  property_data_id_003  Roof Material & Condition
  property_data_id_004  Roof Age
  property_data_id_008  Property Ortho Imagery

What Property Data V2 returns vs. what it does NOT:
  ✓  Total roof area (sqft + squares)
  ✓  Predominant pitch (as integer, e.g. 5 = "5:12")
  ✓  Facet count, material, condition rating, roof age
  ✓  Ortho + oblique imagery tokens
  ✗  Ridge / valley / eave / rake linear lengths  ← classic premium report only
  ✗  PDF report
"""

import hashlib
import json
import math
import os
import time
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

# ── Config ──────────────────────────────────────────────────────────────────

_SANDBOX_BASE = "https://sandbox.apis.eagleview.com"
_PROD_BASE    = "https://apis.eagleview.com"

_DEFAULT_PRODUCTS = [
    "property_data_id_001",  # Roof Area Estimate
    "property_data_id_002",  # Roof Pitch and Eave Height
    "property_data_id_003",  # Roof Material & Condition
    "property_data_id_004",  # Roof Age
    "property_data_id_008",  # Property Ortho Imagery
]


# ── Mock provider ────────────────────────────────────────────────────────────

class MockEagleViewProvider(MeasurementProvider):
    """
    Deterministic mock — same address always returns the same numbers.
    Instant (no API call). Safe for any address.
    """

    def create_request(self, prop: PropertyInput) -> NormalizedRoofMeasurement:
        return self._generate(prop.address)

    def get_status(self, provider_request_id: str) -> NormalizedRoofMeasurement:
        raise NotImplementedError("Mock is always complete on creation")

    def normalize(self, payload: dict, input_address: str = "") -> NormalizedRoofMeasurement:
        return self._from_payload(payload, input_address)

    def _generate(self, address: str) -> NormalizedRoofMeasurement:
        seed = int(hashlib.md5(address.lower().encode()).hexdigest()[:8], 16)

        base_sqft = 1200 + (seed % 2600)
        total_sqft = round(base_sqft / 50) * 50

        pitches = ["4:12", "5:12", "6:12", "7:12", "8:12", "9:12", "12:12"]
        pitch_str = pitches[seed % len(pitches)]
        pitch_norm = pitch_to_normalized(pitch_str)

        rise = float(pitch_str.split(":")[0])
        slope_factor = math.sqrt(1 + (rise / 12) ** 2)
        actual_sqft = round(total_sqft * slope_factor / 50) * 50
        squares = round(actual_sqft / 100, 1)
        facets = 4 + (seed % 7)

        footprint_side = math.sqrt(total_sqft)
        ridge   = round(footprint_side * 0.4, 1)
        valley  = round(footprint_side * 0.3 * (facets / 6), 1)
        eave    = round(footprint_side * 1.8, 1)
        rake    = round(footprint_side * slope_factor * 0.8, 1)

        materials = ["shingle", "shingle", "shingle", "metal", "tile"]
        material = materials[seed % len(materials)]
        conditions = ["good", "good", "fair", "fair", "compromised"]
        condition = conditions[seed % len(conditions)]
        age_years = 5 + (seed % 20)

        payload = {
            "mock": True,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "address": address,
            "totalRoofAreaSqFt": actual_sqft,
            "predominantPitch": pitch_str,
            "facetsCount": facets,
            "ridgeLengthFt": ridge,
            "valleyLengthFt": valley,
            "eaveLengthFt": eave,
            "rakeLengthFt": rake,
            "roofMaterial": material,
            "roofConditionRating": condition,
            "roofAgeYears": age_years,
        }

        return NormalizedRoofMeasurement(
            provider="eagleview_mock",
            provider_request_id=f"mock-{uuid.uuid4().hex[:8]}",
            address=address,
            lat=None, lng=None,
            total_roof_area_sqft=actual_sqft,
            roof_squares=squares,
            predominant_pitch=pitch_str,
            pitch_normalized=pitch_norm,
            facets_count=facets,
            ridge_length_ft=ridge,
            valley_length_ft=valley,
            eave_length_ft=eave,
            rake_length_ft=rake,
            waste_factor=waste_from_pitch(pitch_norm),
            roof_material=material,
            roof_condition_rating=condition,
            roof_age_years=float(age_years),
            image_tokens=[],
            report_pdf_url=None,
            captured_at=datetime.now(timezone.utc).isoformat(),
            status="complete",
            raw_payload=payload,
        )

    def _from_payload(self, payload: dict, input_address: str = "") -> NormalizedRoofMeasurement:
        pitch_str = payload.get("predominantPitch", "6:12")
        pitch_norm = pitch_to_normalized(pitch_str)
        sqft = payload.get("totalRoofAreaSqFt", 0.0)
        return NormalizedRoofMeasurement(
            provider="eagleview_mock",
            provider_request_id=payload.get("requestId", ""),
            address=payload.get("address", input_address),
            lat=None, lng=None,
            total_roof_area_sqft=sqft,
            roof_squares=round(sqft / 100, 1),
            predominant_pitch=pitch_str,
            pitch_normalized=pitch_norm,
            facets_count=payload.get("facetsCount"),
            ridge_length_ft=payload.get("ridgeLengthFt"),
            valley_length_ft=payload.get("valleyLengthFt"),
            eave_length_ft=payload.get("eaveLengthFt"),
            rake_length_ft=payload.get("rakeLengthFt"),
            waste_factor=waste_from_pitch(pitch_norm),
            roof_material=payload.get("roofMaterial"),
            roof_condition_rating=payload.get("roofConditionRating"),
            roof_age_years=payload.get("roofAgeYears"),
            image_tokens=[],
            report_pdf_url=None,
            captured_at=payload.get("capturedAt"),
            status="complete",
            raw_payload=payload,
        )


# ── Real EagleView provider ──────────────────────────────────────────────────

class EagleViewProvider(MeasurementProvider):
    """
    EagleView Property Data V2 API.

    Required env vars:
        EAGLEVIEW_CLIENT_ID
        EAGLEVIEW_CLIENT_SECRET
        EAGLEVIEW_TOKEN_URL     — OAuth2 token endpoint from developer portal
                                  e.g. https://identity.eagleview.com/connect/token
    Optional:
        EAGLEVIEW_SANDBOX=true  — use sandbox base URL (default: false)
        EAGLEVIEW_PRODUCT_IDS   — comma-separated product IDs to request
    """

    def __init__(self):
        self._client_id     = os.environ["EAGLEVIEW_CLIENT_ID"]
        self._client_secret = os.environ["EAGLEVIEW_CLIENT_SECRET"]
        self._token_url     = os.environ.get("EAGLEVIEW_TOKEN_URL", "")
        sandbox             = os.environ.get("EAGLEVIEW_SANDBOX", "").lower() in ("1", "true", "yes")
        self._base          = _SANDBOX_BASE if sandbox else _PROD_BASE
        raw_products        = os.environ.get("EAGLEVIEW_PRODUCT_IDS", "")
        self._products      = [p.strip() for p in raw_products.split(",")] if raw_products else _DEFAULT_PRODUCTS
        self._token: Optional[str] = None
        self._token_expires: float = 0.0

    # ── Auth ─────────────────────────────────────────────────────────────

    def _get_token(self) -> str:
        if self._token and time.time() < self._token_expires - 60:
            return self._token
        if not self._token_url:
            raise RuntimeError(
                "EAGLEVIEW_TOKEN_URL is not set. "
                "Set it to the OAuth2 token endpoint from your EagleView developer portal."
            )
        resp = requests.post(
            self._token_url,
            data={
                "grant_type":    "client_credentials",
                "client_id":     self._client_id,
                "client_secret": self._client_secret,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        self._token = data["access_token"]
        self._token_expires = time.time() + data.get("expires_in", 3600)
        return self._token

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._get_token()}",
            "Content-Type": "application/json",
        }

    # ── Provider interface ────────────────────────────────────────────────

    def create_request(self, prop: PropertyInput) -> NormalizedRoofMeasurement:
        """
        POST /property/v2/request
        Returns 202 Accepted with request.id and request.status = "In Progress".
        """
        body: dict = {
            "address": {"completeAddress": prop.address},
            "productIds": self._products,
        }
        if prop.lat is not None and prop.lng is not None:
            body = {
                "coordinates": {"lat": prop.lat, "lon": prop.lng},
                "productIds": self._products,
            }

        resp = requests.post(
            f"{self._base}/property/v2/request",
            json=body,
            headers=self._headers(),
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()

        request_id = data["request"]["id"]
        status     = self._map_status(data["request"].get("status", "In Progress"))

        return NormalizedRoofMeasurement(
            provider="eagleview",
            provider_request_id=request_id,
            address=prop.address,
            lat=prop.lat, lng=prop.lng,
            total_roof_area_sqft=0.0,
            roof_squares=0.0,
            predominant_pitch="",
            pitch_normalized="medium",
            facets_count=None,
            ridge_length_ft=None,
            valley_length_ft=None,
            eave_length_ft=None,
            rake_length_ft=None,
            waste_factor=0.12,
            roof_material=None,
            roof_condition_rating=None,
            roof_age_years=None,
            image_tokens=[],
            report_pdf_url=None,
            captured_at=None,
            status=status,
            raw_payload=data,
        )

    def get_status(self, provider_request_id: str) -> NormalizedRoofMeasurement:
        """
        GET /property/v2/result/{requestId}
        Returns 200 with full payload when complete, 202 while still processing.
        """
        resp = requests.get(
            f"{self._base}/property/v2/result/{provider_request_id}",
            headers=self._headers(),
            timeout=20,
        )
        resp.raise_for_status()

        data = resp.json()

        # 202 while still processing: {"id": "...", "status": "In Progress"}
        if resp.status_code == 202 or data.get("status") == "In Progress":
            status = self._map_status(data.get("status", "In Progress"))
            return NormalizedRoofMeasurement(
                provider="eagleview",
                provider_request_id=provider_request_id,
                address="",
                lat=None, lng=None,
                total_roof_area_sqft=0.0, roof_squares=0.0,
                predominant_pitch="", pitch_normalized="medium",
                facets_count=None,
                ridge_length_ft=None, valley_length_ft=None,
                eave_length_ft=None, rake_length_ft=None,
                waste_factor=0.12,
                roof_material=None, roof_condition_rating=None, roof_age_years=None,
                image_tokens=[], report_pdf_url=None, captured_at=None,
                status=status,
                raw_payload=data,
            )

        return self.normalize(data)

    def normalize(self, payload: dict, input_address: str = "") -> NormalizedRoofMeasurement:
        """
        Map the completed GET /property/v2/result response to our schema.

        Response structure:
          payload.request.id / .status
          payload.response_coordinates.lat / .lon
          payload.response_address.full_address
          payload.structures[0].roof.*
          payload.imagery.{image_1..n}.image_token
        """
        request_id = (payload.get("request") or {}).get("id", "")
        status     = self._map_status((payload.get("request") or {}).get("status", "Complete"))

        coords = payload.get("response_coordinates") or {}
        lat    = coords.get("lat")
        lng    = coords.get("lon")

        addr_obj = payload.get("response_address") or {}
        address  = addr_obj.get("full_address") or input_address

        # Pick structure with the largest roof area (typically the main house)
        structures = payload.get("structures") or []
        structure  = self._pick_primary_structure(structures)
        roof       = (structure.get("roof") or {}) if structure else {}

        area_sqft = self._val(roof.get("structure_roof_area"), 0.0)
        squares   = self._val(roof.get("structure_roof_area_squares")) or round(area_sqft / 100, 1)

        # Pitch is an integer like 5 meaning "5 over 12"
        pitch_raw  = self._val(roof.get("structure_roof_predominant_pitch"), 6)
        pitch_str  = f"{int(pitch_raw)}:12"
        pitch_norm = pitch_to_normalized(pitch_str)

        facets    = self._val(roof.get("structure_roof_facet_count"))
        material  = self._val(roof.get("structure_roof_material_primary"))
        condition = self._val(roof.get("structure_roof_condition_rating"))
        age       = self._val(roof.get("structure_roof_age"))

        # imagery_date from condition rating or images
        captured_at = None
        if roof.get("structure_roof_condition_rating"):
            captured_at = (roof["structure_roof_condition_rating"].get("image_references") or [None])[0]

        # Collect ortho image tokens (preferred) then oblique
        imagery    = payload.get("imagery") or {}
        tokens     = self._extract_image_tokens(imagery)

        return NormalizedRoofMeasurement(
            provider="eagleview",
            provider_request_id=request_id,
            address=address,
            lat=lat, lng=lng,
            total_roof_area_sqft=float(area_sqft),
            roof_squares=float(squares),
            predominant_pitch=pitch_str,
            pitch_normalized=pitch_norm,
            facets_count=int(facets) if facets is not None else None,
            # Linear lengths not available in Property Data V2 API
            ridge_length_ft=None,
            valley_length_ft=None,
            eave_length_ft=None,
            rake_length_ft=None,
            waste_factor=waste_from_pitch(pitch_norm),
            roof_material=str(material) if material else None,
            roof_condition_rating=str(condition) if condition else None,
            roof_age_years=float(age) if age is not None else None,
            image_tokens=tokens,
            report_pdf_url=None,   # Property Data V2 does not return a PDF
            captured_at=captured_at,
            status=status,
            raw_payload=payload,
        )

    # ── Helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _val(field_obj: Optional[dict], default=None):
        """Extract .value from an EagleView data field dict."""
        if field_obj is None:
            return default
        return field_obj.get("value", default)

    @staticmethod
    def _pick_primary_structure(structures: list) -> Optional[dict]:
        """Return the structure with the largest roof area (main building)."""
        if not structures:
            return None
        def area(s):
            roof = s.get("roof") or {}
            v = (roof.get("structure_roof_area") or {}).get("value", 0)
            return float(v) if v else 0.0
        return max(structures, key=area)

    @staticmethod
    def _extract_image_tokens(imagery: dict) -> list[str]:
        """Return image tokens, ortho first then oblique."""
        ortho, oblique = [], []
        for entry in imagery.values():
            if not isinstance(entry, dict):
                continue
            token = entry.get("image_token")
            if not token:
                continue
            view = (entry.get("metadata") or {}).get("view", "")
            if view == "ortho":
                ortho.append(token)
            else:
                oblique.append(token)
        return ortho + oblique

    @staticmethod
    def _map_status(ev_status: str) -> str:
        # Exact status strings from the spec
        mapping = {
            "in progress": "pending",
            "complete":    "complete",
            "failure":     "failed",
        }
        return mapping.get((ev_status or "").lower(), "pending")


# ── Factory ──────────────────────────────────────────────────────────────────

def get_provider() -> MeasurementProvider:
    """Return real provider when credentials exist, otherwise mock."""
    if os.environ.get("EAGLEVIEW_CLIENT_ID") and os.environ.get("EAGLEVIEW_CLIENT_SECRET"):
        return EagleViewProvider()
    return MockEagleViewProvider()

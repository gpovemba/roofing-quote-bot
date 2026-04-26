import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.measurement.provider import NormalizedRoofMeasurement

DB_PATH = Path(__file__).parent.parent.parent / "quotes.db"


def init_measurements_table():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS measurements (
                id                   TEXT PRIMARY KEY,
                provider             TEXT,
                provider_request_id  TEXT,
                address              TEXT,
                lat                  REAL,
                lng                  REAL,
                total_roof_area_sqft REAL,
                roof_squares         REAL,
                predominant_pitch    TEXT,
                pitch_normalized     TEXT,
                facets_count         INTEGER,
                ridge_length_ft      REAL,
                valley_length_ft     REAL,
                eave_length_ft       REAL,
                rake_length_ft       REAL,
                waste_factor         REAL,
                roof_material        TEXT,
                roof_condition_rating TEXT,
                roof_age_years       REAL,
                image_tokens         TEXT,
                report_pdf_url       TEXT,
                captured_at          TEXT,
                status               TEXT,
                raw_payload_json     TEXT,
                created_at           TEXT
            )
        """)
        # Safe migrations for tables created before new columns existed
        for col, typedef in [
            ("roof_material",         "TEXT"),
            ("roof_condition_rating", "TEXT"),
            ("roof_age_years",        "REAL"),
            ("image_tokens",          "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE measurements ADD COLUMN {col} {typedef}")
            except sqlite3.OperationalError:
                pass
        conn.commit()


def save_measurement(m: NormalizedRoofMeasurement) -> str:
    mid = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """INSERT INTO measurements
               (id, provider, provider_request_id, address, lat, lng,
                total_roof_area_sqft, roof_squares, predominant_pitch,
                pitch_normalized, facets_count, ridge_length_ft,
                valley_length_ft, eave_length_ft, rake_length_ft,
                waste_factor, roof_material, roof_condition_rating,
                roof_age_years, image_tokens, report_pdf_url,
                captured_at, status, raw_payload_json, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                mid,
                m.provider,
                m.provider_request_id,
                m.address,
                m.lat,
                m.lng,
                m.total_roof_area_sqft,
                m.roof_squares,
                m.predominant_pitch,
                m.pitch_normalized,
                m.facets_count,
                m.ridge_length_ft,
                m.valley_length_ft,
                m.eave_length_ft,
                m.rake_length_ft,
                m.waste_factor,
                m.roof_material,
                m.roof_condition_rating,
                m.roof_age_years,
                json.dumps(m.image_tokens),
                m.report_pdf_url,
                m.captured_at,
                m.status,
                json.dumps(m.raw_payload),
                now,
            ),
        )
        conn.commit()
    return mid


def get_measurement(mid: str) -> dict | None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM measurements WHERE id = ?", (mid,)
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    d["image_tokens"] = json.loads(d.get("image_tokens") or "[]")
    # Back-compat key used by older code
    d["imagery_urls"] = d["image_tokens"]
    return d


def update_measurement_status(mid: str, status: str, raw_payload: dict | None = None):
    with sqlite3.connect(DB_PATH) as conn:
        if raw_payload is not None:
            conn.execute(
                "UPDATE measurements SET status=?, raw_payload_json=? WHERE id=?",
                (status, json.dumps(raw_payload), mid),
            )
        else:
            conn.execute("UPDATE measurements SET status=? WHERE id=?", (status, mid))
        conn.commit()


def update_measurement_complete(mid: str, m: NormalizedRoofMeasurement):
    """Persist all normalized fields when a pending measurement transitions to complete."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """UPDATE measurements SET
                status=?, raw_payload_json=?,
                total_roof_area_sqft=?, roof_squares=?,
                predominant_pitch=?, pitch_normalized=?,
                facets_count=?, waste_factor=?,
                roof_material=?, roof_condition_rating=?,
                roof_age_years=?, image_tokens=?,
                address=COALESCE(NULLIF(?, ''), address)
               WHERE id=?""",
            (
                m.status,
                json.dumps(m.raw_payload),
                m.total_roof_area_sqft,
                m.roof_squares,
                m.predominant_pitch,
                m.pitch_normalized,
                m.facets_count,
                m.waste_factor,
                m.roof_material,
                m.roof_condition_rating,
                m.roof_age_years,
                json.dumps(m.image_tokens),
                m.address,
                mid,
            ),
        )
        conn.commit()

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from app.models import Quote

DB_PATH = Path(__file__).parent.parent.parent / "quotes.db"


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS quotes (
                id               TEXT PRIMARY KEY,
                customer_name    TEXT,
                property_address TEXT,
                roof_type        TEXT,
                roof_area_sqft   REAL,
                pitch            TEXT,
                material_grade   TEXT,
                final_quote      REAL,
                profit_margin    REAL,
                inputs_json      TEXT,
                breakdown_json   TEXT,
                notes            TEXT,
                created_at       TEXT,
                measurement_id   TEXT
            )
        """)
        # Safe migration: add measurement_id column to tables created before this version
        try:
            conn.execute("ALTER TABLE quotes ADD COLUMN measurement_id TEXT")
        except sqlite3.OperationalError:
            pass  # column already exists
        conn.commit()


def save_quote_direct(quote: Quote) -> str:
    qid = str(uuid.uuid4())[:8]
    quote.id = qid
    quote.created_at = datetime.now(timezone.utc)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """INSERT INTO quotes
               (id,customer_name,property_address,roof_type,roof_area_sqft,
                pitch,material_grade,final_quote,profit_margin,inputs_json,
                breakdown_json,notes,created_at,measurement_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                quote.id,
                quote.customer_name,
                quote.property_address,
                quote.inputs.roof_type,
                quote.inputs.roof_area_sqft,
                quote.inputs.pitch,
                quote.inputs.material_grade,
                quote.breakdown.final_quote,
                quote.breakdown.profit_margin,
                quote.inputs.model_dump_json(),
                quote.breakdown.model_dump_json(),
                quote.notes,
                quote.created_at.isoformat(),
                quote.measurement_id,
            ),
        )
        conn.commit()
    return qid


def get_similar_quotes(roof_type: str, area_sqft: float, limit: int = 3) -> list[dict]:
    tolerance = 0.40
    low = area_sqft * (1 - tolerance)
    high = area_sqft * (1 + tolerance)
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT id, customer_name, roof_type, roof_area_sqft, pitch,
                   material_grade, final_quote, profit_margin, created_at
            FROM quotes
            WHERE roof_type = ? AND roof_area_sqft BETWEEN ? AND ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (roof_type, low, high, limit)).fetchall()
    return [dict(r) for r in rows]


def list_quotes(limit: int = 50) -> list[dict]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT id, customer_name, property_address, roof_type,
                   roof_area_sqft, pitch, material_grade, final_quote,
                   profit_margin, created_at, measurement_id
            FROM quotes
            ORDER BY created_at DESC
            LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


def get_quote(quote_id: str) -> dict | None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM quotes WHERE id = ?", (quote_id,)
        ).fetchone()
    return dict(row) if row else None


def delete_quote(quote_id: str) -> bool:
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute("DELETE FROM quotes WHERE id = ?", (quote_id,))
        conn.commit()
    return cur.rowcount > 0

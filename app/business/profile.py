"""
Business profile: everything specific to one roofing company.

The owner fills this out once (Business Profile page in the app), and every
quote is priced from it: their suppliers and product prices, their crew
rates, their local dumpster/permit/delivery costs, and their own overhead
and markup. Stored as a single JSON document in quotes.db.
"""
import json
import sqlite3
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.history.store import DB_PATH

ROOF_TYPES = ["asphalt", "metal", "tile", "flat", "other"]
GRADES = ["economy", "standard", "premium"]
PITCHES = ["low", "medium", "steep", "complex"]

# How an accessory's quantity is measured.
#   per_square    -> roof squares (after waste); coverage = squares per unit
#   eave_ft, ...  -> linear feet of that roof edge; coverage = linear ft per unit
#   per_job       -> fixed count per job; coverage = units per job
Basis = Literal[
    "per_square",
    "eave_ft",
    "rake_ft",
    "ridge_ft",
    "valley_ft",
    "eave_rake_ft",
    "eave_valley_ft",
    "per_job",
]


class CompanyInfo(BaseModel):
    name: str = ""
    phone: str = ""
    email: str = ""
    license_number: str = ""
    service_area: str = ""


class Product(BaseModel):
    """The main roofing material for one roof type at one grade."""
    product: str
    supplier: str = ""
    unit: str = "bundle"            # bundle, square, panel, roll...
    unit_price: float
    units_per_square: float = 3.0   # e.g. 3 bundles of shingles per square


class RoofSystem(BaseModel):
    waste_factor: float = 0.12
    labor_per_square: float = 80.0
    tiers: dict[str, Product]


# Which part of the quote builder an item belongs to:
#   underlayment -> "Underlayment & ice barrier" scope checkbox
#   accessories  -> "Flashing, vents & accessories" scope checkbox
#   extra        -> optional add-on the customer chooses (gutters, skylights...)
Group = Literal["underlayment", "accessories", "extra"]


class Accessory(BaseModel):
    id: str
    name: str
    group: Group = "accessories"
    description: str = ""
    supplier: str = ""
    unit: str = "each"
    unit_price: float = 0.0
    basis: Basis = "per_square"
    coverage: float = 1.0           # how much one unit covers (see Basis)
    applies_to: list[str] = Field(default_factory=lambda: list(ROOF_TYPES))
    enabled: bool = True

    @model_validator(mode="before")
    @classmethod
    def _infer_group(cls, data):
        # Profiles saved before groups existed
        if isinstance(data, dict) and "group" not in data:
            data["group"] = "underlayment" if data.get("id") in ("underlayment", "ice_water") else "accessories"
        return data


class LaborSettings(BaseModel):
    # Extra labor dollars per square for harder roofs
    pitch_adder_per_square: dict[str, float] = Field(
        default_factory=lambda: {"low": 0, "medium": 10, "steep": 35, "complex": 55}
    )
    tearoff_per_square_per_layer: float = 45.0


class LocalCosts(BaseModel):
    dumpster_price: float = 450.0
    squares_per_dumpster: float = 25.0   # squares of tear-off one dumpster holds
    permit_fee: float = 150.0
    delivery_fee: float = 75.0
    equipment_fee: float = 0.0
    inspection_fee: float = 175.0          # your cost for a roof inspection visit


class PricingSettings(BaseModel):
    overhead_pct: float = 0.15
    markup_pct: float = 0.20
    material_tax_pct: float = 0.0
    minimum_job_price: float = 0.0


class BusinessProfile(BaseModel):
    company: CompanyInfo = Field(default_factory=CompanyInfo)
    roof_systems: dict[str, RoofSystem]
    accessories: list[Accessory]
    labor: LaborSettings = Field(default_factory=LaborSettings)
    local_costs: LocalCosts = Field(default_factory=LocalCosts)
    pricing: PricingSettings = Field(default_factory=PricingSettings)
    is_default: bool = True   # flips to False the first time the owner saves
    extras_seeded: bool = False


def _p(product, supplier, unit, price, per_sq):
    return Product(product=product, supplier=supplier, unit=unit,
                   unit_price=price, units_per_square=per_sq)


def default_profile() -> BusinessProfile:
    """Sample profile with realistic prices so the demo works out of the box.
    Owners replace these with their own numbers."""
    return BusinessProfile(
        company=CompanyInfo(name="Your Roofing Co."),
        roof_systems={
            "asphalt": RoofSystem(waste_factor=0.12, labor_per_square=85, tiers={
                "economy":  _p("3-tab shingles", "ABC Supply", "bundle", 29, 3),
                "standard": _p("Architectural shingles (GAF Timberline HDZ)", "ABC Supply", "bundle", 42, 3),
                "premium":  _p("Designer shingles (GAF Camelot II)", "ABC Supply", "bundle", 68, 4),
            }),
            "metal": RoofSystem(waste_factor=0.10, labor_per_square=180, tiers={
                "economy":  _p("Exposed-fastener panels, 29 ga", "Local metal supplier", "square", 210, 1),
                "standard": _p("Standing seam, 26 ga", "Local metal supplier", "square", 390, 1),
                "premium":  _p("Standing seam, 24 ga Kynar", "Local metal supplier", "square", 520, 1),
            }),
            "tile": RoofSystem(waste_factor=0.15, labor_per_square=260, tiers={
                "economy":  _p("Concrete tile", "Tile distributor", "square", 240, 1),
                "standard": _p("Premium concrete tile", "Tile distributor", "square", 330, 1),
                "premium":  _p("Clay tile", "Tile distributor", "square", 620, 1),
            }),
            "flat": RoofSystem(waste_factor=0.05, labor_per_square=120, tiers={
                "economy":  _p("Modified bitumen", "ABC Supply", "roll", 95, 1),
                "standard": _p("TPO 60 mil", "ABC Supply", "square", 165, 1),
                "premium":  _p("TPO 80 mil / PVC", "ABC Supply", "square", 240, 1),
            }),
            "other": RoofSystem(waste_factor=0.12, labor_per_square=110, tiers={
                "economy":  _p("Economy material", "", "square", 150, 1),
                "standard": _p("Standard material", "", "square", 200, 1),
                "premium":  _p("Premium material", "", "square", 300, 1),
            }),
        },
        accessories=[
            Accessory(id="underlayment", name="Synthetic underlayment", group="underlayment", supplier="ABC Supply",
                      unit="roll", unit_price=95, basis="per_square", coverage=10,
                      applies_to=["asphalt", "metal", "tile"]),
            Accessory(id="ice_water", name="Ice & water shield", group="underlayment", supplier="ABC Supply",
                      unit="roll", unit_price=120, basis="eave_valley_ft", coverage=66,
                      applies_to=["asphalt", "metal", "tile"]),
            Accessory(id="starter", name="Starter strip", supplier="ABC Supply",
                      unit="bundle", unit_price=48, basis="eave_rake_ft", coverage=105,
                      applies_to=["asphalt"]),
            Accessory(id="drip_edge", name="Drip edge (10 ft)", supplier="ABC Supply",
                      unit="piece", unit_price=11, basis="eave_rake_ft", coverage=10,
                      applies_to=["asphalt", "metal", "tile", "flat"]),
            Accessory(id="ridge_cap", name="Hip & ridge cap", supplier="ABC Supply",
                      unit="bundle", unit_price=62, basis="ridge_ft", coverage=25,
                      applies_to=["asphalt"]),
            Accessory(id="ridge_vent", name="Ridge vent (4 ft)", supplier="ABC Supply",
                      unit="piece", unit_price=19, basis="ridge_ft", coverage=4,
                      applies_to=["asphalt", "metal"]),
            Accessory(id="valley_metal", name="Valley flashing (10 ft)", supplier="ABC Supply",
                      unit="piece", unit_price=24, basis="valley_ft", coverage=10,
                      applies_to=["asphalt", "metal", "tile"]),
            Accessory(id="nails", name="Coil roofing nails", supplier="ABC Supply",
                      unit="box", unit_price=55, basis="per_square", coverage=15,
                      applies_to=["asphalt"]),
            Accessory(id="pipe_boots", name="Pipe boots", supplier="ABC Supply",
                      unit="each", unit_price=18, basis="per_job", coverage=3,
                      applies_to=["asphalt", "metal", "tile", "flat"]),
            *default_extras(),
        ],
        extras_seeded=True,
    )


def default_extras() -> list[Accessory]:
    """Optional add-ons shown as checkboxes in the quote builder. Prices are your cost."""
    return [
        Accessory(id="gutters", name="Gutter replacement", group="extra",
                  description="Remove and install new seamless gutters along the eaves",
                  supplier="", unit="ft", unit_price=6.5, basis="eave_ft", coverage=1),
        Accessory(id="decking", name="Decking replacement", group="extra",
                  description="Replace rotted or soft roof decking (per 4x8 sheet)",
                  unit="sheet", unit_price=48, basis="per_job", coverage=5),
        Accessory(id="skylight", name="Skylight re-flashing", group="extra",
                  description="New flashing kit around each skylight",
                  unit="each", unit_price=140, basis="per_job", coverage=1),
        Accessory(id="chimney", name="Chimney re-flashing", group="extra",
                  description="New step and counter flashing on the chimney",
                  unit="each", unit_price=260, basis="per_job", coverage=1),
        Accessory(id="siding", name="Siding repair (as needed)", group="extra",
                  description="Minor siding repairs next to roof-to-wall areas",
                  unit="job", unit_price=350, basis="per_job", coverage=1),
    ]


# ── Storage ──────────────────────────────────────────────────────────────────

def init_profile_table():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS business_profile (
                id           INTEGER PRIMARY KEY CHECK (id = 1),
                profile_json TEXT NOT NULL
            )
        """)
        conn.commit()


def get_profile() -> BusinessProfile:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("SELECT profile_json FROM business_profile WHERE id = 1").fetchone()
    if not row:
        return default_profile()
    profile = BusinessProfile.model_validate(json.loads(row[0]))
    if not profile.extras_seeded:   # profiles saved before add-ons existed
        have = {a.id for a in profile.accessories}
        profile.accessories += [e for e in default_extras() if e.id not in have]
        profile.extras_seeded = True
    return profile


def save_profile(profile: BusinessProfile) -> BusinessProfile:
    profile.is_default = False
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO business_profile (id, profile_json) VALUES (1, ?) "
            "ON CONFLICT(id) DO UPDATE SET profile_json = excluded.profile_json",
            (profile.model_dump_json(),),
        )
        conn.commit()
    return profile


def reset_profile() -> BusinessProfile:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM business_profile WHERE id = 1")
        conn.commit()
    return default_profile()


def profile_summary_for_agent(profile: BusinessProfile) -> str:
    """Short text the chat agent sees so it knows what's already configured."""
    lines = [f"Company: {profile.company.name or 'not set'}"]
    for rt in ROOF_TYPES:
        sysm = profile.roof_systems.get(rt)
        if not sysm:
            continue
        tiers = ", ".join(f"{g}: {p.product}" for g, p in sysm.tiers.items())
        lines.append(f"- {rt}: {tiers}")
    pr = profile.pricing
    lines.append(
        f"Overhead {pr.overhead_pct:.0%}, markup {pr.markup_pct:.0%}, "
        f"dumpster ${profile.local_costs.dumpster_price:,.0f}, "
        f"permit ${profile.local_costs.permit_fee:,.0f}"
    )
    if profile.is_default:
        lines.append("NOTE: This is still the sample profile. The owner has not entered their own prices yet.")
    return "\n".join(lines)

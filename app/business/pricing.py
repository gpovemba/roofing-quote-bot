DEFAULT_PRICING = {
    "materials": {
        # Cost per square (100 sqft) installed, economy/standard/premium
        "asphalt": {
            "economy": 85,
            "standard": 120,
            "premium": 175,
        },
        "metal": {
            "economy": 250,
            "standard": 350,
            "premium": 500,
        },
        "tile": {
            "economy": 300,
            "standard": 450,
            "premium": 650,
        },
        "flat": {
            "economy": 150,
            "standard": 220,
            "premium": 320,
        },
        "other": {
            "economy": 150,
            "standard": 200,
            "premium": 300,
        },
    },
    # Labor per square by roof type
    "labor_per_square": {
        "asphalt": 75,
        "metal": 120,
        "tile": 140,
        "flat": 90,
        "other": 100,
    },
    # Pitch difficulty multipliers
    "pitch_multiplier": {
        "low": 1.0,
        "medium": 1.1,
        "steep": 1.25,
        "complex": 1.35,
    },
    # Tear-off cost per square per layer
    "tearoff_rate_per_square": 35,
    # Default overhead and markup
    "overhead_pct": 0.15,
    "markup_pct": 0.20,
    # Default waste factors by roof type
    "waste_factor": {
        "asphalt": 0.12,
        "metal": 0.10,
        "tile": 0.15,
        "flat": 0.05,
        "other": 0.12,
    },
}

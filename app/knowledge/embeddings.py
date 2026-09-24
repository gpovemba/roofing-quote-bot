"""
Optional meaning-based search using Voyage AI embeddings.

If VOYAGE_API_KEY is set in .env, each chunk gets an embedding so the bot can
find passages that match the *meaning* of a question ("how long is the roof
guaranteed?" finds "workmanship warranty: 10 years"). Without a key, search
falls back to keyword matching only, which still works well for product
names and specific terms.
"""
import array
import math
import os

import requests

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
BATCH = 64


def enabled() -> bool:
    return bool(os.environ.get("VOYAGE_API_KEY", "").strip())


def model_name() -> str:
    return os.environ.get("VOYAGE_MODEL", "voyage-3.5").strip() or "voyage-3.5"


def embed(texts: list[str], input_type: str) -> list[list[float]]:
    """input_type is 'document' for stored chunks, 'query' for questions."""
    out: list[list[float]] = []
    for i in range(0, len(texts), BATCH):
        resp = requests.post(
            VOYAGE_URL,
            headers={"Authorization": f"Bearer {os.environ['VOYAGE_API_KEY'].strip()}"},
            json={"input": texts[i:i + BATCH], "model": model_name(), "input_type": input_type},
            timeout=60,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Voyage embeddings failed ({resp.status_code}): {resp.text[:200]}")
        data = sorted(resp.json()["data"], key=lambda d: d["index"])
        out.extend(_normalize(d["embedding"]) for d in data)
    return out


def _normalize(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def to_blob(v: list[float]) -> bytes:
    return array.array("f", v).tobytes()


def from_blob(b: bytes) -> array.array:
    a = array.array("f")
    a.frombytes(b)
    return a


def dot(a, b) -> float:
    return sum(x * y for x, y in zip(a, b))

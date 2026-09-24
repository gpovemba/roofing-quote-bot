"""
Document knowledge base: storage and hybrid search.

Documents are split into chunks and stored in quotes.db. Search combines:
  - keyword ranking (BM25), always on, and
  - meaning-based ranking (Voyage embeddings), when VOYAGE_API_KEY is set,
merged with reciprocal rank fusion.
"""
import math
import re
import sqlite3
import uuid
from collections import Counter
from datetime import datetime, timezone

from app.history.store import DB_PATH
from app.knowledge import embeddings
from app.knowledge.parsing import chunk_pages, extract_pages

CATEGORIES = {
    "warranty": "Warranty",
    "catalog": "Supplier catalog",
    "policy": "Company policy",
    "install": "Installation spec",
    "other": "Other",
}

STOPWORDS = set("""a an and are as at be by can do does for from has have how i in is it its
of on or our that the their them this to was we what when where which who will with you your
if any not no so than then there these they those into about also should would could""".split())


def init_knowledge_tables():
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS documents (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                filename    TEXT,
                category    TEXT,
                pages       INTEGER,
                chunk_count INTEGER,
                created_at  TEXT
            );
            CREATE TABLE IF NOT EXISTS doc_chunks (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                doc_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                idx       INTEGER,
                page      INTEGER,
                section   TEXT,
                text      TEXT NOT NULL,
                embedding BLOB
            );
            CREATE INDEX IF NOT EXISTS idx_chunks_doc ON doc_chunks(doc_id);
        """)


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _context_text(title: str, section: str, text: str) -> str:
    """What gets indexed: the chunk plus where it came from."""
    return "\n".join(x for x in (title, section, text) if x)


# ── Write ────────────────────────────────────────────────────────────────────

def add_document(filename: str, data: bytes, category: str = "other", title: str | None = None) -> dict:
    pages = extract_pages(filename, data)
    chunks = chunk_pages(pages)
    if not chunks:
        raise ValueError("No readable text found in this file.")

    title = (title or filename.rsplit(".", 1)[0]).replace("_", " ").strip()
    category = category if category in CATEGORIES else "other"

    vectors = [None] * len(chunks)
    embed_error = None
    if embeddings.enabled():
        try:
            vectors = embeddings.embed(
                [_context_text(title, c["section"], c["text"]) for c in chunks], "document")
        except Exception as e:  # keep the document; keyword search still works
            embed_error = str(e)

    doc_id = uuid.uuid4().hex[:10]
    with _connect() as conn:
        conn.execute(
            "INSERT INTO documents (id,title,filename,category,pages,chunk_count,created_at) VALUES (?,?,?,?,?,?,?)",
            (doc_id, title, filename, category,
             sum(1 for p, _ in pages if p is not None) or None, len(chunks),
             datetime.now(timezone.utc).isoformat()),
        )
        conn.executemany(
            "INSERT INTO doc_chunks (doc_id,idx,page,section,text,embedding) VALUES (?,?,?,?,?,?)",
            [(doc_id, i, c["page"], c["section"], c["text"],
              embeddings.to_blob(v) if v else None) for i, (c, v) in enumerate(zip(chunks, vectors))],
        )
    doc = get_document(doc_id)
    if embed_error:
        doc["warning"] = f"Saved with keyword search only. {embed_error}"
    return doc


def delete_document(doc_id: str) -> bool:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    return cur.rowcount > 0


def embed_missing() -> int:
    """Add embeddings to chunks stored before a Voyage key was configured."""
    if not embeddings.enabled():
        return 0
    with _connect() as conn:
        rows = conn.execute("""
            SELECT c.id, c.section, c.text, d.title FROM doc_chunks c
            JOIN documents d ON d.id = c.doc_id WHERE c.embedding IS NULL
        """).fetchall()
        if not rows:
            return 0
        vecs = embeddings.embed([_context_text(r["title"], r["section"], r["text"]) for r in rows], "document")
        conn.executemany("UPDATE doc_chunks SET embedding = ? WHERE id = ?",
                         [(embeddings.to_blob(v), r["id"]) for r, v in zip(rows, vecs)])
    return len(rows)


# ── Read ─────────────────────────────────────────────────────────────────────

def get_document(doc_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    return dict(row) if row else None


def list_documents() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("""
            SELECT d.*, SUM(c.embedding IS NULL) AS unembedded
            FROM documents d LEFT JOIN doc_chunks c ON c.doc_id = d.id
            GROUP BY d.id ORDER BY d.created_at DESC
        """).fetchall()
    return [dict(r) for r in rows]


def search_mode() -> str:
    return "hybrid" if embeddings.enabled() else "keyword"


def _tokens(text: str) -> list[str]:
    out = []
    for t in re.findall(r"[a-z0-9]+(?:[.'-][a-z0-9]+)*", text.lower()):
        if t in STOPWORDS or len(t) < 2:
            continue
        if len(t) > 4 and t.endswith("s") and not t.endswith("ss"):
            t = t[:-1]
        out.append(t)
    return out


def _bm25(query: str, rows: list, k1: float = 1.5, b: float = 0.75) -> list[tuple[int, float]]:
    q = set(_tokens(query))
    if not q or not rows:
        return []
    docs = [Counter(_tokens(_context_text(r["title"], r["section"], r["text"]))) for r in rows]
    n = len(docs)
    avg = sum(sum(d.values()) for d in docs) / n or 1
    df = {t: sum(1 for d in docs if t in d) for t in q}
    scores = []
    for i, d in enumerate(docs):
        dl = sum(d.values())
        s = 0.0
        for t in q:
            tf = d.get(t, 0)
            if tf:
                idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
                s += idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl / avg))
        if s > 0:
            scores.append((i, s))
    return sorted(scores, key=lambda x: -x[1])


def search(query: str, top_k: int = 5) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("""
            SELECT c.id, c.doc_id, c.page, c.section, c.text, c.embedding, d.title, d.category
            FROM doc_chunks c JOIN documents d ON d.id = c.doc_id
        """).fetchall()
    if not rows:
        return []

    rankings = [_bm25(query, rows)[:20]]

    if embeddings.enabled() and any(r["embedding"] for r in rows):
        try:
            qv = embeddings.embed([query], "query")[0]
            sims = [(i, embeddings.dot(qv, embeddings.from_blob(r["embedding"])))
                    for i, r in enumerate(rows) if r["embedding"]]
            rankings.append(sorted(sims, key=lambda x: -x[1])[:20])
        except Exception:
            pass  # fall back to keyword results

    # Reciprocal rank fusion
    fused: dict[int, float] = {}
    for ranking in rankings:
        for rank, (i, _) in enumerate(ranking):
            fused[i] = fused.get(i, 0.0) + 1.0 / (60 + rank)

    results = []
    for i, score in sorted(fused.items(), key=lambda x: -x[1])[:top_k]:
        r = rows[i]
        results.append({
            "document": r["title"],
            "category": CATEGORIES.get(r["category"], "Other"),
            "page": r["page"],
            "section": r["section"] or None,
            "text": r["text"],
            "score": round(score, 4),
        })
    return results


def titles_for_agent() -> str:
    docs = list_documents()
    if not docs:
        return "No documents uploaded yet."
    return "\n".join(f"- {d['title']} ({CATEGORIES.get(d['category'], 'Other')})" for d in docs)

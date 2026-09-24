"""
Turn uploaded files into plain text, then into searchable chunks.

Supported: PDF (via pypdf), Word .docx (read directly, no extra library),
and plain text / Markdown / CSV.
"""
import io
import re
import zipfile
from xml.etree import ElementTree

SUPPORTED = {".pdf", ".docx", ".txt", ".md", ".csv"}

CHUNK_CHARS = 900       # target size of each chunk
OVERLAP_MAX = 250       # carry a short trailing paragraph into the next chunk


class UnsupportedFile(ValueError):
    pass


def extract_pages(filename: str, data: bytes) -> list[tuple[int | None, str]]:
    """Return [(page_number or None, text), ...]."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in SUPPORTED:
        raise UnsupportedFile(f"{ext or 'This file type'} isn't supported. Use PDF, Word (.docx), .txt, .md, or .csv.")

    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        pages = [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]
        if not any(t.strip() for _, t in pages):
            raise UnsupportedFile("No text found in this PDF. It may be a scanned image; upload a text-based PDF instead.")
        return pages

    if ext == ".docx":
        return [(None, _docx_text(data))]

    return [(None, data.decode("utf-8", errors="replace"))]


def _docx_text(data: bytes) -> str:
    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        root = ElementTree.fromstring(z.read("word/document.xml"))
    paras = []
    for p in root.iter(f"{ns}p"):
        text = "".join(t.text or "" for t in p.iter(f"{ns}t"))
        style = p.find(f"{ns}pPr/{ns}pStyle")
        if style is not None and style.get(f"{ns}val", "").lower().startswith("heading"):
            text = "# " + text
        paras.append(text)
    return "\n\n".join(paras)


def _split_long(text: str) -> list[str]:
    """Split an over-long paragraph on sentence (or line) boundaries."""
    parts = re.split(r"(?<=[.!?])\s+|\n", text)
    out, cur = [], ""
    for part in parts:
        if cur and len(cur) + len(part) + 1 > CHUNK_CHARS:
            out.append(cur)
            cur = part
        else:
            cur = f"{cur} {part}".strip()
    if cur:
        out.append(cur)
    # Last resort for text with no punctuation at all
    return [s[i:i + CHUNK_CHARS] for s in out for i in range(0, len(s), CHUNK_CHARS)]


def chunk_pages(pages: list[tuple[int | None, str]]) -> list[dict]:
    """Pack paragraphs into ~CHUNK_CHARS chunks, remembering page and section heading."""
    chunks: list[dict] = []
    section = ""

    for page, text in pages:
        text = text.replace("\r\n", "\n")
        units: list[tuple[str, str]] = []   # (section, paragraph)
        for para in re.split(r"\n\s*\n", text):
            para = para.strip()
            if not para:
                continue
            if para.startswith("#"):
                first, _, rest = para.partition("\n")
                section = first.lstrip("#").strip()
                para = rest.strip()
                if not para:
                    continue
            para = re.sub(r"[ \t]+", " ", para)
            for piece in (_split_long(para) if len(para) > CHUNK_CHARS else [para]):
                units.append((section, piece))

        cur: list[str] = []
        cur_section = units[0][0] if units else section
        for sec, para in units:
            size = sum(len(u) + 2 for u in cur)
            if cur and (size + len(para) > CHUNK_CHARS or sec != cur_section):
                chunks.append({"page": page, "section": cur_section, "text": "\n\n".join(cur)})
                carry = cur[-1] if sec == cur_section and len(cur[-1]) <= OVERLAP_MAX else None
                cur = [carry] if carry else []
                cur_section = sec
            cur.append(para)
        if cur:
            chunks.append({"page": page, "section": cur_section, "text": "\n\n".join(cur)})

    return chunks

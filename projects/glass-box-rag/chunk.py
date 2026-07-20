"""Chunk opinions into retrievable passages.

Judicial opinions have real structure — numbered parts (I, II, III), lettered
subsections (A, B), and a syllabus that is a pre-written summary. Splitting on
that structure instead of blind character windows means a retrieved chunk tends
to be a complete piece of reasoning, and it gives every chunk a section label
worth showing in the UI.

Usage:
    uv run python chunk.py            # all fetched opinions -> data/build/chunks.json
    uv run python chunk.py --stats    # just report, don't write
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass

import tiktoken
from rich.console import Console
from rich.table import Table

from common import BUILD, COURT_LEVEL, RAW, write_json

console = Console()
ENC = tiktoken.get_encoding("cl100k_base")

TARGET_TOKENS = 1000
OVERLAP_TOKENS = 150
MIN_TOKENS = 60  # below this a chunk is usually a stray heading

# Headings must be a numeral/letter ALONE on its line, optionally followed by a
# short ALL-CAPS title. This is deliberately conservative.
#
# The permissive version of these patterns made the trailing period optional and
# allowed any short title, which matched ordinary prose: "In 2016, petitioner..."
# parsed as numeral "I" + title "n 2016, petitioner...", and "Lisa S. Blatt argued"
# as "L" + "isa S. Blatt argued". Warhol alone produced 63 bogus "sections".
# Requiring the period AND an uppercase-or-empty title kills that whole class.
# Under-detecting a heading merely yields a larger chunk; mis-detecting one puts
# nonsense in the section label shown in the UI.
_PART = re.compile(r"^[ \t]*(?:PART[ \t]+)?([IVXL]{1,6})\.[ \t]*([A-Z][A-Z0-9 \-'&,]{2,60})?[ \t]*$", re.MULTILINE)
_SUBPART = re.compile(r"^[ \t]*([A-H])\.[ \t]*([A-Z][A-Z0-9 \-'&,]{2,60})?[ \t]*$", re.MULTILINE)


@dataclass
class Chunk:
    id: str
    case_id: str
    case_name: str
    court: str
    court_level: str
    year: int
    layer: str
    section: str | None
    text: str
    token_count: int
    citation: str | None = None
    date: str | None = None
    judge: str | None = None


def _ntok(s: str) -> int:
    return len(ENC.encode(s))


def split_sections(text: str) -> list[tuple[str | None, str]]:
    """Split on structural headings, returning (label, body) pairs."""
    marks: list[tuple[int, str]] = []
    for m in _PART.finditer(text):
        label = m.group(1) + (f". {m.group(2).strip()}" if m.group(2) and m.group(2).strip() else "")
        marks.append((m.start(), label.strip()))
    for m in _SUBPART.finditer(text):
        label = m.group(1) + (f". {m.group(2).strip()}" if m.group(2) and m.group(2).strip() else "")
        marks.append((m.start(), label.strip()))

    if not marks:
        return [(None, text)]

    marks.sort()
    out: list[tuple[str | None, str]] = []
    if marks[0][0] > 0:
        out.append((None, text[: marks[0][0]]))
    for i, (pos, label) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        body = text[pos:end].strip()
        if body:
            out.append((label, body))
    return out


def window(text: str, target: int, overlap: int) -> list[str]:
    """Token-windowed split on paragraph boundaries, with overlap."""
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paras:
        return []
    chunks: list[str] = []
    cur: list[str] = []
    cur_tok = 0
    for p in paras:
        pt = _ntok(p)
        # A single oversized paragraph gets hard-split rather than dropped.
        if pt > target:
            if cur:
                chunks.append("\n\n".join(cur))
                cur, cur_tok = [], 0
            ids = ENC.encode(p)
            for i in range(0, len(ids), target - overlap):
                chunks.append(ENC.decode(ids[i : i + target]))
            continue
        if cur_tok + pt > target and cur:
            chunks.append("\n\n".join(cur))
            # carry the tail paragraph forward as overlap
            tail, tail_tok = [], 0
            for q in reversed(cur):
                qt = _ntok(q)
                if tail_tok + qt > overlap:
                    break
                tail.insert(0, q)
                tail_tok += qt
            cur, cur_tok = tail, tail_tok
        cur.append(p)
        cur_tok += pt
    if cur:
        chunks.append("\n\n".join(cur))
    return chunks


def chunk_opinion(op: dict) -> list[Chunk]:
    out: list[Chunk] = []
    n = 0
    for label, body in split_sections(op["text"]):
        for piece in window(body, TARGET_TOKENS, OVERLAP_TOKENS):
            tok = _ntok(piece)
            if tok < MIN_TOKENS:
                continue
            out.append(
                Chunk(
                    id=f"{op['id']}::{n:03d}",
                    case_id=op["id"],
                    case_name=op["name"],
                    court=op["court"],
                    court_level=COURT_LEVEL.get(op["court"], "unknown"),
                    year=op["year"],
                    layer=op["layer"],
                    section=label,
                    text=piece,
                    token_count=tok,
                    citation=op.get("citation"),
                    date=op.get("date"),
                    judge=op.get("judge"),
                )
            )
            n += 1
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stats", action="store_true")
    args = ap.parse_args()

    files = sorted(RAW.glob("*.json"))
    if not files:
        console.print("[red]no opinions in data/raw — run fetch.py first[/red]")
        return 1

    all_chunks: list[Chunk] = []
    table = Table("case", "layer", "words", "chunks", "avg tok", "sections")
    for f in files:
        op = json.loads(f.read_text())
        chunks = chunk_opinion(op)
        all_chunks.extend(chunks)
        secs = len({c.section for c in chunks if c.section})
        avg = sum(c.token_count for c in chunks) // max(len(chunks), 1)
        table.add_row(
            op["id"], op["layer"], f"{len(op['text'].split()):,}",
            str(len(chunks)), str(avg), str(secs),
        )
    console.print(table)
    console.print(
        f"\n[bold]{len(files)} opinions -> {len(all_chunks):,} chunks, "
        f"{sum(c.token_count for c in all_chunks):,} tokens total[/bold]"
    )

    if not args.stats:
        write_json(BUILD / "chunks.json", [asdict(c) for c in all_chunks])
        console.print(f"[green]wrote {BUILD / 'chunks.json'}[/green]")
    return 0


if __name__ == "__main__":
    sys.exit(main())

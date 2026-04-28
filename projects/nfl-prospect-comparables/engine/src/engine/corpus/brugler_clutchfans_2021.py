"""Recover Brugler 2021 from the clutchfans forum mirror — OCR pipeline.

The 2021 PDF link is dead. A clutchfans forum thread mirrored the content,
but the OP uploaded each Beast page as a PNG (i.ibb.co-hosted) rather than
text. We scrape image URLs grouped by position, OCR them via AWS Textract,
concat the per-position text, and pass through the existing brugler
split_profiles + match_profiles_to_cohort pipeline.

Why Textract: ~$0.0015/page, single-column-printed-text accuracy is high,
preserves reading order. ~$0.25 to process the ~160 skill-position images.
"""

from __future__ import annotations

import re
import time
from collections import defaultdict
from io import BytesIO

import boto3
import requests
from bs4 import BeautifulSoup


THREAD_PAGES = (
    "https://bbs.clutchfans.net/threads/the-athletic-dane-brugler%E2%80%99s-2021-nfl-draft-guide-%E2%80%94-%E2%80%9Cthe-beast%E2%80%9D.311294/",
    "https://bbs.clutchfans.net/threads/the-athletic-dane-brugler%E2%80%99s-2021-nfl-draft-guide-%E2%80%94-%E2%80%9Cthe-beast%E2%80%9D.311294/page-2",
)

USER_AGENT = "Mozilla/5.0 (Macintosh) NflProspectComparables/0.1"

# Position posts on this thread are organized by post index. The OP labels
# images by position prefix in the filename (QB1.png, rb1.png, etc.). We map
# our skill-position cohort categories to URL filename prefixes.
POSITION_PREFIXES = {
    "QB": ("qb",),
    "RB": ("rb",),
    "WR": ("wr",),
    "TE": ("te",),
}


def fetch_image_urls() -> dict[str, list[str]]:
    """Walk both forum pages, return {position: [image_urls...]} ordered by
    the numeric suffix in the filename (e.g., QB1.png comes before QB10.png)."""
    by_pos: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for url in THREAD_PAGES:
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
        r.raise_for_status()
        # imgbb URLs follow https://i.ibb.co/<hash>/<filename>.png
        for m in re.finditer(
            r'data-url="(https://i\.ibb\.co/[^/]+/([^"]+?)\.png)"', r.text
        ):
            full_url, fname = m.group(1), m.group(2)
            # Extract position prefix + numeric index from filename
            fm = re.match(r"([a-zA-Z]+)(\d+)$", fname)
            if not fm:
                continue
            prefix = fm.group(1).lower()
            idx = int(fm.group(2))
            for pos, prefixes in POSITION_PREFIXES.items():
                if prefix in prefixes:
                    by_pos[pos].append((idx, full_url))
                    break
    # Sort each position's images by numeric index
    return {pos: [url for _, url in sorted(items)] for pos, items in by_pos.items()}


def ocr_image_via_textract(image_bytes: bytes, textract=None) -> str:
    """Detect text in an image via AWS Textract DetectDocumentText.
    Returns lines joined with newlines (preserving reading order)."""
    if textract is None:
        textract = boto3.client("textract", region_name="us-east-1")
    resp = textract.detect_document_text(Document={"Bytes": image_bytes})
    lines = []
    for block in resp.get("Blocks", []):
        if block["BlockType"] == "LINE":
            lines.append(block.get("Text", ""))
    return "\n".join(lines)


def ocr_position(
    image_urls: list[str],
    *,
    textract=None,
    progress: bool = True,
) -> str:
    """Download + OCR each image in order. Returns concatenated text with
    page-break markers between images. Skips images that 404 (imgbb rot)
    and logs the loss — the rest still produces a usable text stream."""
    if textract is None:
        textract = boto3.client("textract", region_name="us-east-1")
    chunks: list[str] = []
    n_missing = 0
    for i, url in enumerate(image_urls, 1):
        try:
            r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
            r.raise_for_status()
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                n_missing += 1
                if progress:
                    print(f"    [{i}/{len(image_urls)}] 404 — skipping {url}", flush=True)
                continue
            raise
        text = ocr_image_via_textract(r.content, textract=textract)
        chunks.append(text)
        if progress and (i % 5 == 0 or i == len(image_urls)):
            print(f"    [{i}/{len(image_urls)}] OCR done", flush=True)
    if n_missing and progress:
        print(f"    {n_missing} image(s) missing (imgbb rot)", flush=True)
    return "\n\n".join(chunks)

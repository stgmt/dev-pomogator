#!/usr/bin/env python3
"""
check_external_claims.py — batch helper для категории #1 (External-API claim verify).

Принимает JSON со списком claims, fetches каждый docs URL, ищет matching quote,
returns structured verdict (verified / contradicted / not_found).

Usage:
    python check_external_claims.py claims.json > verdict.json

claims.json format:
[
  {
    "claim_id": "EXT-1",
    "claim_text": "Tawk webhook signed with HMAC-SHA256",
    "docs_url": "https://developer.tawk.to/webhooks/",
    "search_keywords": ["HMAC", "SHA-1", "SHA-256", "signature"],
    "spec_location": "FR.md:42"
  },
  ...
]

verdict.json output:
[
  {
    "claim_id": "EXT-1",
    "spec_location": "FR.md:42",
    "verdict": "contradicted",
    "evidence": "Quote: 'Webhooks are signed using HMAC-SHA1' (line 87 of fetched HTML)",
    "severity": "P0",
    "suggested_fix": "Replace SHA256 → SHA1 in claim_text"
  },
  ...
]

NOTE: This is an OPTIONAL helper. The skill workflow can also use Claude's
WebFetch tool one-claim-at-a-time. Use this script when there are 5+ external
claims (manual WebFetch becomes tedious).

Verdict semantics:
- verified: search_keywords found in fetched content with matching context
- contradicted: docs explicitly state different value (e.g. SHA-1 found, claim says SHA-256)
- not_found: docs page fetched but search_keywords absent — manual review needed
- fetch_failed: HTTP error / timeout / TLS issue
- ambiguous: multiple conflicting quotes found
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any


@dataclass
class Claim:
    claim_id: str
    claim_text: str
    docs_url: str
    search_keywords: list[str]
    spec_location: str


@dataclass
class Verdict:
    claim_id: str
    spec_location: str
    verdict: str  # verified | contradicted | not_found | fetch_failed | ambiguous
    evidence: str
    severity: str  # P0 | P1 | P2
    suggested_fix: str
    fetched_url: str = ""
    quote_lines: list[str] = field(default_factory=list)


class _TextExtractor(HTMLParser):
    """Strip HTML tags, keep visible text."""

    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            self._chunks.append(data)

    def text(self) -> str:
        return "\n".join(c.strip() for c in self._chunks if c.strip())


def fetch(url: str, timeout_sec: int = 15) -> tuple[str, str]:
    """Return (text, error). text is empty on failure; error is empty on success."""
    req = urllib.request.Request(
        url, headers={"User-Agent": "spec-review/check_external_claims (+https://github.com/stgmt/dev-pomogator)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:  # noqa: S310
            raw = resp.read()
            charset = resp.headers.get_content_charset() or "utf-8"
            html = raw.decode(charset, errors="replace")
    except urllib.error.HTTPError as e:
        return "", f"HTTP {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        return "", f"URL error: {e.reason}"
    except (TimeoutError, ConnectionError) as e:
        return "", f"network error: {e}"

    extractor = _TextExtractor()
    extractor.feed(html)
    return extractor.text(), ""


def find_quotes(text: str, keyword: str, context_chars: int = 80) -> list[str]:
    """Return list of context-window quotes around keyword occurrences (case-insensitive)."""
    pattern = re.compile(re.escape(keyword), re.IGNORECASE)
    quotes: list[str] = []
    for m in pattern.finditer(text):
        start = max(0, m.start() - context_chars)
        end = min(len(text), m.end() + context_chars)
        snippet = text[start:end].replace("\n", " ").strip()
        snippet = re.sub(r"\s+", " ", snippet)
        quotes.append(f"...{snippet}...")
        if len(quotes) >= 5:
            break
    return quotes


def assess(claim: Claim, fetched_text: str) -> Verdict:
    """Decide verdict by scanning fetched_text for search_keywords."""
    if not fetched_text:
        return Verdict(
            claim_id=claim.claim_id,
            spec_location=claim.spec_location,
            verdict="not_found",
            evidence="Fetched page has no extractable text content",
            severity="P1",
            suggested_fix="Manual review — verify URL is correct + page renders content (not SPA-only).",
            fetched_url=claim.docs_url,
        )

    found_keywords: dict[str, list[str]] = {}
    for kw in claim.search_keywords:
        quotes = find_quotes(fetched_text, kw)
        if quotes:
            found_keywords[kw] = quotes

    if not found_keywords:
        return Verdict(
            claim_id=claim.claim_id,
            spec_location=claim.spec_location,
            verdict="not_found",
            evidence=f"None of {claim.search_keywords} found in fetched docs",
            severity="P1",
            suggested_fix="Manual review — claim cannot be verified from this URL. Find canonical docs page or mark [UNVERIFIED].",
            fetched_url=claim.docs_url,
        )

    quote_lines = []
    for kw, quotes in found_keywords.items():
        for q in quotes[:2]:
            quote_lines.append(f"[{kw}] {q}")

    claim_lower = claim.claim_text.lower()
    found_lower = {k.lower(): v for k, v in found_keywords.items()}

    if len(found_keywords) == 1:
        only_kw = next(iter(found_keywords))
        if only_kw.lower() in claim_lower:
            verdict_str = "verified"
            severity = "P2"
            evidence = f"Keyword '{only_kw}' from claim found in docs."
            suggested_fix = "(none — claim consistent with docs)"
        else:
            verdict_str = "contradicted"
            severity = "P0"
            evidence = f"Docs mention '{only_kw}' but claim text says different. Possible drift."
            suggested_fix = (
                f"Update claim_text to use '{only_kw}' OR re-verify if docs section is canonical."
            )
        return Verdict(
            claim_id=claim.claim_id,
            spec_location=claim.spec_location,
            verdict=verdict_str,
            evidence=evidence,
            severity=severity,
            suggested_fix=suggested_fix,
            fetched_url=claim.docs_url,
            quote_lines=quote_lines,
        )

    contradicting = [
        kw for kw in found_keywords if kw.lower() not in claim_lower
    ]
    matching = [kw for kw in found_keywords if kw.lower() in claim_lower]

    if matching and not contradicting:
        return Verdict(
            claim_id=claim.claim_id,
            spec_location=claim.spec_location,
            verdict="verified",
            evidence=f"All claim keywords {matching} present in docs.",
            severity="P2",
            suggested_fix="(none — claim consistent with docs)",
            fetched_url=claim.docs_url,
            quote_lines=quote_lines,
        )

    if contradicting and not matching:
        return Verdict(
            claim_id=claim.claim_id,
            spec_location=claim.spec_location,
            verdict="contradicted",
            evidence=f"Docs mention {contradicting} but claim text uses different terms.",
            severity="P0",
            suggested_fix=f"Update claim_text to align with docs ({contradicting}).",
            fetched_url=claim.docs_url,
            quote_lines=quote_lines,
        )

    return Verdict(
        claim_id=claim.claim_id,
        spec_location=claim.spec_location,
        verdict="ambiguous",
        evidence=f"Both matching ({matching}) and contradicting ({contradicting}) keywords found.",
        severity="P1",
        suggested_fix="Manual review — docs may have multiple variants (legacy vs current). Find canonical section.",
        fetched_url=claim.docs_url,
        quote_lines=quote_lines,
    )


def load_claims(path: str) -> list[Claim]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    return [
        Claim(
            claim_id=item["claim_id"],
            claim_text=item["claim_text"],
            docs_url=item["docs_url"],
            search_keywords=item.get("search_keywords", []),
            spec_location=item.get("spec_location", ""),
        )
        for item in raw
    ]


def verdict_to_dict(v: Verdict) -> dict[str, Any]:
    return {
        "claim_id": v.claim_id,
        "spec_location": v.spec_location,
        "verdict": v.verdict,
        "evidence": v.evidence,
        "severity": v.severity,
        "suggested_fix": v.suggested_fix,
        "fetched_url": v.fetched_url,
        "quote_lines": v.quote_lines,
    }


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: check_external_claims.py <claims.json>", file=sys.stderr)
        return 2

    claims = load_claims(argv[1])
    verdicts: list[Verdict] = []
    for c in claims:
        text, err = fetch(c.docs_url)
        if err:
            verdicts.append(
                Verdict(
                    claim_id=c.claim_id,
                    spec_location=c.spec_location,
                    verdict="fetch_failed",
                    evidence=err,
                    severity="P1",
                    suggested_fix="Verify URL is reachable. May need MCP context7 / WebFetch through Claude.",
                    fetched_url=c.docs_url,
                )
            )
            continue
        verdicts.append(assess(c, text))

    print(json.dumps([verdict_to_dict(v) for v in verdicts], indent=2, ensure_ascii=False))

    p0_count = sum(1 for v in verdicts if v.severity == "P0")
    if p0_count > 0:
        print(f"\n{p0_count} P0 finding(s) — see verdict.json", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

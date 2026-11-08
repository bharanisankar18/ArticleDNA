"""Text helpers: word counting and verbatim-excerpt verification.

Excerpt matching compares only letters and digits (case-folded, Unicode-normalised), so a quote
still counts as verbatim when it differs only in whitespace, punctuation, curly vs straight
quotes or dashes. Any difference in the actual words means it is not verified.
The extension's in-page highlighter uses the same normalisation.
"""
from __future__ import annotations

import re
import unicodedata

_WORD = re.compile(r"\w+", re.UNICODE)
_ELLIPSIS = re.compile(r"\.\.\.|…|\[\s*\.\.\.\s*\]")
MIN_MATCH_CHARS = 12


def count_words(text: str) -> int:
    return len(_WORD.findall(text))


def normalize_for_match(text: str) -> str:
    # lower() rather than casefold() so this matches JavaScript's toLowerCase() in the extension.
    text = unicodedata.normalize("NFKC", text).lower()
    return "".join(ch for ch in text if ch.isalnum())


class ExcerptVerifier:
    """Checks excerpts against one article's text. Build once per article."""

    def __init__(self, article_text: str) -> None:
        self._haystack = normalize_for_match(article_text)

    def is_verbatim(self, excerpt: str) -> bool:
        if not excerpt or not excerpt.strip():
            return False
        segments = [normalize_for_match(s) for s in _ELLIPSIS.split(excerpt)]
        segments = [s for s in segments if s]
        if not segments or sum(len(s) for s in segments) < MIN_MATCH_CHARS:
            return False
        # Elided quotes ("A ... B") must have every piece present, in order.
        position = 0
        for segment in segments:
            found = self._haystack.find(segment, position)
            if found < 0:
                return False
            position = found + len(segment)
        return True

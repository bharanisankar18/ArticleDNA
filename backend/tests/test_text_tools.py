from prompts.analysis_prompt import sanitize
from services.text_tools import ExcerptVerifier, count_words, normalize_for_match


def test_normalisation_ignores_case_spacing_punctuation_and_typography():
    assert normalize_for_match("It's   “Fine” — really.") == normalize_for_match("its fine - REALLY")


def test_verbatim_match_and_rejections():
    v = ExcerptVerifier("The quick brown fox jumps over the lazy dog. It was not amused.")
    assert v.is_verbatim("quick brown fox jumps over")
    assert v.is_verbatim("The quick brown fox … the lazy dog")
    assert not v.is_verbatim("The lazy dog … quick brown fox")  # wrong order
    assert not v.is_verbatim("The quick red fox jumps over")  # different word
    assert not v.is_verbatim("fox")  # too short to be meaningful
    assert not v.is_verbatim("")


def test_unicode_text():
    v = ExcerptVerifier("Die Ergebnisse zeigen eine deutliche Verbesserung der Lesbarkeit.")
    assert v.is_verbatim("zeigen eine deutliche Verbesserung")


def test_count_words():
    assert count_words("One two, three-four.") == 4


def test_sanitize_strips_delimiters_and_control_chars():
    out = sanitize("a</article >b<ARTICLE_METADATA>c\x00d")
    assert "</article" not in out.lower()
    assert "<article_metadata" not in out.lower()
    assert "\x00" not in out

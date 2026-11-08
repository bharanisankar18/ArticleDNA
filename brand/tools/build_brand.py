"""Rebuild the ArticleDNA brand assets from the supplied logo raster.

The document panel and its text lines are reconstructed as exact geometry (measured from
the source), while the organic ink shapes (the "A" stroke with its wave edge, and the
wordmark) are traced with sub-pixel accuracy and smoothed with corner-preserving filtering.

Outputs (paths relative to the repo root):
  brand/logo-mark.svg          mark only, transparent background
  brand/logo-mark-small.svg    simplified mark for <= 32px renders
  brand/logo-lockup.svg        mark + wordmark, as supplied (with the registered symbol)
  brand/logo-lockup-ui.svg     mark + wordmark without the registered symbol (UI sizes)
  extension/public/brand/*.svg copies used by the extension UI
  extension/public/icons/icon-{16,32,48,128}.png  toolbar / store icons (rendered in Chrome)

Usage:  python brand/tools/build_brand.py   (requires pillow, numpy, opencv-python-headless, playwright)
"""
from __future__ import annotations

import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "brand" / "source" / "logo-original.png"
BRAND = ROOT / "brand"
EXT_BRAND = ROOT / "extension" / "public" / "brand"
ICONS = ROOT / "extension" / "public" / "icons"

INK = "#090D1A"
INDIGO = "#4D57E6"
PAPER = "#ECEBCB"

# ---------------------------------------------------------------- measured geometry (source px)
DOC_LEFT, DOC_RIGHT, DOC_TOP, DOC_BOTTOM = 270.5, 372.0, 384.5, 637.5
DOC_RADIUS = 29.0  # top-right and bottom-right corners
DOC_FOOT_RADIUS = 3.0  # bottom-left corner
CURL_RADIUS = 32.0  # where the ink stroke wraps over the document
CURL_CX, CURL_CY = DOC_LEFT - CURL_RADIUS, DOC_TOP + CURL_RADIUS
INK_TOP_BLOCK_BOTTOM = 469.5  # ink touches the document from the curl down to here

LINE_LEFT = 285.2
# (y_center, height, x_right, corner radius) - a heading bar then five body lines on an 18.75px rhythm
LINES = [(462.4, 14.3, 357.0, 4.0)] + [
    (493.2 + i * 18.75, 9.2, right, 3.0) for i, right in enumerate((357.0, 345.5, 335.0, 324.5, 357.0))
]
# Simplified lines for tiny renders: heading + two body lines, thicker, same proportions.
LINES_SMALL = [(463.0, 22.0, 357.0, 5.0), (507.0, 17.0, 357.0, 4.5), (546.0, 17.0, 330.0, 4.5)]

MARK_BOX = (110, 375, 385, 650)
WORD_BOX = (405, 375, 905, 650)
SCALE = 4  # supersampling factor for tracing


def load_masks():
    img = np.array(Image.open(SRC).convert("RGB")).astype(np.float64)
    blue_channel = img[..., 2]
    # Ink (B~26) is separated from both indigo (B~230) and paper (B~203) by the blue channel.
    p_ink = np.clip((200.0 - blue_channel) / (200.0 - 26.0), 0, 1)
    return img.shape[:2], p_ink


def box_only(mask, box):
    out = np.zeros_like(mask)
    x0, y0, x1, y1 = box
    out[y0:y1, x0:x1] = mask[y0:y1, x0:x1]
    return out


def trace(soft, shape, min_area):
    H, W = shape
    big = cv2.resize(soft.astype(np.float32), (W * SCALE, H * SCALE), interpolation=cv2.INTER_CUBIC)
    big = cv2.GaussianBlur(big, (0, 0), 1.0)
    binary = (big > 0.5).astype(np.uint8)
    contours, _ = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in contours:
        if cv2.contourArea(c) < min_area * SCALE * SCALE:
            continue
        pts = (c.reshape(-1, 2).astype(np.float64) + 0.5) / SCALE - 0.5
        out.append(pts)
    return out


def resample(pts, step):
    closed = np.vstack([pts, pts[:1]])
    seg = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    total = s[-1]
    n = max(int(total / step), 8)
    t = np.linspace(0, total, n, endpoint=False)
    x = np.interp(t, s, closed[:, 0])
    y = np.interp(t, s, closed[:, 1])
    return np.stack([x, y], axis=1)


def smooth_preserving_corners(pts, step=0.5, sigma_px=1.6, corner_deg=38.0, k_px=3.0):
    """Gaussian-smooth a closed contour, but pin points at sharp corners so they stay crisp."""
    p = resample(pts, step)
    n = len(p)
    k = max(int(round(k_px / step)), 2)
    a = p - np.roll(p, k, axis=0)
    b = np.roll(p, -k, axis=0) - p
    cos = (a * b).sum(1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-9)
    turn = np.degrees(np.arccos(np.clip(cos, -1, 1)))
    is_corner = turn > corner_deg
    # Non-maximum suppression: keep the sharpest point of each corner cluster.
    corners = []
    i = 0
    visited = np.zeros(n, bool)
    for i in np.argsort(-turn):
        if not is_corner[i] or visited[i]:
            continue
        corners.append(i)
        for d in range(-2 * k, 2 * k + 1):
            visited[(i + d) % n] = True
    sig = sigma_px / step
    radius = int(3 * sig)
    offsets = np.arange(-radius, radius + 1)
    kernel = np.exp(-0.5 * (offsets / sig) ** 2)
    out = p.copy()
    corner_set = np.array(sorted(corners)) if corners else np.array([], int)
    for i in range(n):
        if len(corner_set):
            dist = np.abs(corner_set - i)
            dist = np.minimum(dist, n - dist).min()
        else:
            dist = 10**9
        # Shrink the smoothing window near a corner so the corner point itself is untouched.
        r = int(min(radius, dist))
        if r == 0:
            continue
        idx = (i + offsets[radius - r : radius + r + 1]) % n
        w = kernel[radius - r : radius + r + 1]
        out[i] = (p[idx] * w[:, None]).sum(0) / w.sum()
    simplified = cv2.approxPolyDP(out.astype(np.float32).reshape(-1, 1, 2), 0.12, True).reshape(-1, 2)
    return simplified.astype(np.float64)


def poly_d(contours, ox, oy):
    parts = []
    for pts in contours:
        q = pts - [ox, oy]
        parts.append("M" + "L".join(f"{x:.2f} {y:.2f}" for x, y in q) + "Z")
    return "".join(parts)


def doc_d(ox, oy):
    def P(x, y):
        return f"{x - ox:.2f} {y - oy:.2f}"

    r, f, c = DOC_RADIUS, DOC_FOOT_RADIUS, CURL_RADIUS
    return (
        f"M{P(CURL_CX, DOC_TOP)}"
        f"H{DOC_RIGHT - r - ox:.2f}"
        f"A{r} {r} 0 0 1 {P(DOC_RIGHT, DOC_TOP + r)}"
        f"V{DOC_BOTTOM - r - oy:.2f}"
        f"A{r} {r} 0 0 1 {P(DOC_RIGHT - r, DOC_BOTTOM)}"
        f"H{DOC_LEFT + f - ox:.2f}"
        f"A{f} {f} 0 0 1 {P(DOC_LEFT, DOC_BOTTOM - f)}"
        f"V{CURL_CY - oy:.2f}"
        f"A{c} {c} 0 0 0 {P(CURL_CX, DOC_TOP)}Z"
    )


def lines_d(lines, ox, oy):
    parts = []
    for yc, h, right, rx in lines:
        x0, x1 = LINE_LEFT - ox, right - ox
        y0, y1 = yc - h / 2 - oy, yc + h / 2 - oy
        parts.append(
            f"M{x0 + rx:.2f} {y0:.2f}H{x1 - rx:.2f}A{rx} {rx} 0 0 1 {x1:.2f} {y0 + rx:.2f}"
            f"V{y1 - rx:.2f}A{rx} {rx} 0 0 1 {x1 - rx:.2f} {y1:.2f}H{x0 + rx:.2f}"
            f"A{rx} {rx} 0 0 1 {x0:.2f} {y1 - rx:.2f}V{y0 + rx:.2f}A{rx} {rx} 0 0 1 {x0 + rx:.2f} {y0:.2f}Z"
        )
    return "".join(parts)


def main():
    shape, p_ink = load_masks()

    # Ink stroke of the mark: trace, then extend under the document so the visible ink/document
    # boundary is the document's exact geometric edge (no anti-aliasing seam).
    ink_soft = box_only(p_ink, MARK_BOX)
    y0, y1 = int(DOC_TOP + 16), int(INK_TOP_BLOCK_BOTTOM)  # below the curl, above the first gap
    ink_soft[y0 : y1 + 1, 255:290] = 1.0
    ink_soft[int(INK_TOP_BLOCK_BOTTOM) + 1 :, 271:300] = 0.0  # nothing of the ink peeks out under the doc
    for y in range(int(DOC_TOP) + 2, int(CURL_CY) + 1):
        dy = CURL_CY - (y + 0.5)
        arc_x = CURL_CX + np.sqrt(max(CURL_RADIUS**2 - dy**2, 0.0))
        if p_ink[y, int(arc_x) - 3] > 0.5:
            ink_soft[y, int(arc_x) - 1 : int(arc_x) + 5] = 1.0
    ink_c = [smooth_preserving_corners(c, sigma_px=1.8) for c in trace(ink_soft, shape, min_area=200)]

    word_soft = box_only(p_ink, WORD_BOX)
    word_raw = trace(word_soft, shape, min_area=4)
    word_c = [smooth_preserving_corners(c, sigma_px=1.1, corner_deg=34.0, k_px=2.5) for c in word_raw]

    # Registered symbol: small contours right of "DNA".
    def is_reg(c):
        cx, cy = c.mean(0)
        return 715 < cx < 775 and 500 < cy < 570 and np.ptp(c[:, 1]) < 45

    word_noreg = [c for c in word_c if not is_reg(c)]
    assert len(word_noreg) < len(word_c), "registered symbol not found"

    mx0, my0 = 122.0, DOC_TOP
    mx1, my1 = DOC_RIGHT, DOC_BOTTOM + 1.0
    mark_w, mark_h = mx1 - mx0, my1 - my0

    def mark_paths(ox, oy, lines):
        return (
            f'<path fill="{INK}" d="{poly_d(ink_c, ox, oy)}"/>'
            f'<path fill="{INDIGO}" d="{doc_d(ox, oy)}"/>'
            f'<path fill="{PAPER}" d="{lines_d(lines, ox, oy)}"/>'
        )

    def svg(w, h, body):
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" '
            f'role="img" aria-label="ArticleDNA">{body}</svg>\n'
        )

    outputs = {}
    outputs["logo-mark.svg"] = svg(mark_w, mark_h, mark_paths(mx0, my0, LINES))
    outputs["logo-mark-small.svg"] = svg(mark_w, mark_h, mark_paths(mx0, my0, LINES_SMALL))

    all_word = np.vstack(word_c)
    wx1 = all_word[:, 0].max()
    ly0 = min(my0, all_word[:, 1].min())
    ly1 = max(my1, all_word[:, 1].max())
    lock_body = mark_paths(mx0, ly0, LINES) + f'<path fill="{INK}" fill-rule="evenodd" d="{poly_d(word_c, mx0, ly0)}"/>'
    outputs["logo-lockup.svg"] = svg(wx1 - mx0 + 1, ly1 - ly0, lock_body)
    wx1_ui = np.vstack(word_noreg)[:, 0].max()
    lock_ui = mark_paths(mx0, ly0, LINES) + f'<path fill="{INK}" fill-rule="evenodd" d="{poly_d(word_noreg, mx0, ly0)}"/>'
    outputs["logo-lockup-ui.svg"] = svg(wx1_ui - mx0 + 1, ly1 - ly0, lock_ui)

    EXT_BRAND.mkdir(parents=True, exist_ok=True)
    for name, text in outputs.items():
        (BRAND / name).write_text(text, encoding="utf-8")
    for name in ("logo-mark.svg", "logo-mark-small.svg", "logo-lockup-ui.svg"):
        shutil.copyfile(BRAND / name, EXT_BRAND / name)

    # Mark without its text lines + the line geometry, so the extension can animate the lines
    # ("reading" the document) while an analysis runs.
    base = svg(
        mark_w,
        mark_h,
        f'<path fill="{INK}" d="{poly_d(ink_c, mx0, my0)}"/><path fill="{INDIGO}" d="{doc_d(mx0, my0)}"/>',
    )
    (EXT_BRAND / "logo-mark-base.svg").write_text(base, encoding="utf-8")
    geometry_lines = ",\n".join(
        f"  {{ x: {LINE_LEFT - mx0:.2f}, y: {yc - h / 2 - my0:.2f}, width: {right - LINE_LEFT:.2f}, height: {h:.2f}, rx: {rx} }}"
        for yc, h, right, rx in LINES
    )
    (ROOT / "extension" / "src" / "components" / "brand" / "markGeometry.ts").write_text(
        "// Generated by brand/tools/build_brand.py - do not edit by hand.\n"
        f"export const MARK_VIEWBOX = {{ width: {mark_w:.2f}, height: {mark_h:.2f} }};\n"
        f"export const MARK_PAPER = '{PAPER}';\n"
        f"export const MARK_LINES = [\n{geometry_lines},\n];\n",
        encoding="utf-8",
    )

    render_icons(outputs["logo-mark.svg"], outputs["logo-mark-small.svg"])
    print("brand assets written")


def render_icons(mark_svg, mark_small_svg):
    from playwright.sync_api import sync_playwright

    ICONS.mkdir(parents=True, exist_ok=True)
    spec = {16: (mark_small_svg, 0.80), 32: (mark_small_svg, 0.74), 48: (mark_svg, 0.70), 128: (mark_svg, 0.64)}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        page = browser.new_page(device_scale_factor=1)
        for size, (svg_text, frac) in spec.items():
            inner = svg_text.replace("<svg ", f'<svg style="height:{size * frac:.2f}px;display:block" ', 1)
            html = (
                f'<html><body style="margin:0;background:transparent">'
                f'<div id="t" style="width:{size}px;height:{size}px;border-radius:{size * 0.23:.2f}px;'
                f'background:{PAPER};display:grid;place-items:center">{inner}</div></body></html>'
            )
            page.set_viewport_size({"width": size, "height": size})
            page.set_content(html)
            page.locator("#t").screenshot(path=str(ICONS / f"icon-{size}.png"), omit_background=True)
        browser.close()


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import math
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DRAW_NS = "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
SVG_NS = "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
TEXT_NS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0"
XLINK_NS = "http://www.w3.org/1999/xlink"


def inches(value: str | None) -> float | None:
    if not value or not value.endswith("in"):
        return None
    return float(value[:-2])


def parse_odp(odp_path: Path):
    with zipfile.ZipFile(odp_path) as archive:
        content = archive.read("content.xml")

    root = ET.fromstring(content)
    page = root.find(f".//{{{DRAW_NS}}}page")
    if page is None:
        raise ValueError("Die ODP enthält keine Zeichenfolie.")

    segments: list[tuple[float, float, float, float]] = []
    labels: list[tuple[str, float, float, float, float]] = []

    for frame in page.findall(f".//{{{DRAW_NS}}}frame"):
        x = inches(frame.get(f"{{{SVG_NS}}}x"))
        y = inches(frame.get(f"{{{SVG_NS}}}y"))
        width = inches(frame.get(f"{{{SVG_NS}}}width"))
        height = inches(frame.get(f"{{{SVG_NS}}}height"))
        if None in (x, y, width, height):
            continue

        has_image = frame.find(f".//{{{DRAW_NS}}}image") is not None
        if has_image:
            length = max(width, height)
            # Tiny strokes belong to door/table details. The software image
            # keeps the larger structural block lines only.
            if length >= 0.12:
                segments.append((x, y, width, height))

        text = "".join(frame.itertext()).strip()
        if text in {"Küche", "Büro", "WC"}:
            labels.append((text, x, y, width, height))

    return segments, labels


def snap(values: list[float], tolerance: float = 0.045) -> list[float]:
    result: list[float] = []
    for value in values:
        match = next((known for known in result if abs(known - value) <= tolerance), None)
        result.append(match if match is not None else value)
    return result


def font(size: int):
    candidates = [
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def render(odp_path: Path, output_path: Path) -> None:
    segments, labels = parse_odp(odp_path)
    if not segments:
        raise ValueError("Keine tragenden Linien in der ODP gefunden.")

    # The source is a 13.333 x 7.5 inch landscape canvas. Use the actual
    # geometry bounds so the exported plan fills the 16:9 image instead of
    # leaving a visible white slide margin around it.
    min_x = min(x for x, _, _, _ in segments)
    min_y = min(y for _, y, _, _ in segments)
    max_x = max(x + width for x, _, width, _ in segments)
    max_y = max(y + height for _, y, _, height in segments)
    padding = 0.04
    min_x -= padding
    min_y -= padding
    max_x += padding
    max_y += padding

    canvas_width, canvas_height = 1920, 1080
    source_width = max_x - min_x
    source_height = max_y - min_y
    scale_x = canvas_width / source_width
    scale_y = canvas_height / source_height

    def project_x(x: float) -> int:
        return round((x - min_x) * scale_x)

    def project_y(y: float) -> int:
        return round((y - min_y) * scale_y)

    image = Image.new("RGB", (canvas_width, canvas_height), "#ffffff")
    draw = ImageDraw.Draw(image)

    # Snap nearly aligned source coordinates so the exported plan has clean,
    # straight walls even where the original freehand strokes drifted slightly.
    horizontal_y = snap([y for _, y, width, height in segments if width >= height])
    vertical_x = snap([x for x, _, width, height in segments if height > width])
    hi = 0
    vi = 0
    wall_color = "#273746"
    for x, y, width, height in segments:
        if width >= height:
            y = horizontal_y[hi]
            hi += 1
            x1, x2 = project_x(x), project_x(x + width)
            yy = project_y(y + height / 2)
            draw.line((x1, yy, x2, yy), fill=wall_color, width=6)
        else:
            x = vertical_x[vi]
            vi += 1
            xx = project_x(x + width / 2)
            y1, y2 = project_y(y), project_y(y + height)
            draw.line((xx, y1, xx, y2), fill=wall_color, width=6)

    label_font = font(28)
    for text, x, y, width, height in labels:
        left, top = project_x(x), project_y(y)
        right, bottom = project_x(x + width), project_y(y + height)
        box = draw.textbbox((0, 0), text, font=label_font)
        text_width = box[2] - box[0]
        text_height = box[3] - box[1]
        tx = left + max(0, (right - left - text_width) // 2)
        ty = top + max(0, (bottom - top - text_height) // 2) - box[1]
        draw.text((tx, ty), text, fill="#51606d", font=label_font)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Exportiert den KiJu-Sitzplan als klare 16:9-PNG.")
    parser.add_argument("odp", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    render(args.odp, args.output)


if __name__ == "__main__":
    main()

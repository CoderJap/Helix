from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape
import re

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
INPUT_MD = ROOT / "Hackathon_Problem_Statement_Helix.md"
OUTPUT_PDF = ROOT / "Hackathon_Problem_Statement_Helix.pdf"


def build_styles() -> dict[str, ParagraphStyle]:
    sample = getSampleStyleSheet()

    return {
        "title": ParagraphStyle(
            "TitleHelix",
            parent=sample["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=28,
            textColor=colors.HexColor("#1C3D5A"),
            spaceAfter=12,
        ),
        "h2": ParagraphStyle(
            "Heading2Helix",
            parent=sample["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            textColor=colors.HexColor("#23395B"),
            spaceBefore=10,
            spaceAfter=6,
        ),
        "h3": ParagraphStyle(
            "Heading3Helix",
            parent=sample["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#335C67"),
            spaceBefore=8,
            spaceAfter=5,
        ),
        "normal": ParagraphStyle(
            "BodyHelix",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=15,
            spaceAfter=6,
        ),
        "bullet": ParagraphStyle(
            "BulletHelix",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=15,
            leftIndent=14,
            firstLineIndent=-10,
            spaceAfter=4,
        ),
        "numbered": ParagraphStyle(
            "NumberedHelix",
            parent=sample["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=15,
            spaceBefore=4,
            spaceAfter=4,
            textColor=colors.HexColor("#1F2937"),
        ),
    }


def parse_markdown_to_story(markdown_text: str, styles: dict[str, ParagraphStyle]):
    story = []
    paragraph_buffer: list[str] = []

    def flush_paragraph() -> None:
        if not paragraph_buffer:
            return

        text = " ".join(part.strip() for part in paragraph_buffer if part.strip())
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            story.append(Paragraph(escape(text), styles["normal"]))
        paragraph_buffer.clear()

    for raw_line in markdown_text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if not stripped:
            flush_paragraph()
            story.append(Spacer(1, 3))
            continue

        if stripped.startswith("# "):
            flush_paragraph()
            story.append(Paragraph(escape(stripped[2:].strip()), styles["title"]))
            continue

        if stripped.startswith("## "):
            flush_paragraph()
            story.append(Paragraph(escape(stripped[3:].strip()), styles["h2"]))
            continue

        if stripped.startswith("### "):
            flush_paragraph()
            story.append(Paragraph(escape(stripped[4:].strip()), styles["h3"]))
            continue

        if re.match(r"^\d+\.\s+", stripped):
            flush_paragraph()
            story.append(Paragraph(escape(stripped), styles["numbered"]))
            continue

        if stripped.startswith("- "):
            flush_paragraph()
            bullet_text = "\u2022 " + stripped[2:].strip()
            story.append(Paragraph(escape(bullet_text), styles["bullet"]))
            continue

        paragraph_buffer.append(stripped)

    flush_paragraph()

    return story


def draw_page_number(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def generate_pdf() -> None:
    if not INPUT_MD.exists():
        raise FileNotFoundError(f"Input markdown file not found: {INPUT_MD}")

    styles = build_styles()
    markdown_text = INPUT_MD.read_text(encoding="utf-8")
    story = parse_markdown_to_story(markdown_text, styles)

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=14 * mm,
        title="Helix Hackathon Problem Statement",
        author="Helix Team",
    )

    doc.build(story, onFirstPage=draw_page_number, onLaterPages=draw_page_number)


if __name__ == "__main__":
    generate_pdf()
    print(f"Generated: {OUTPUT_PDF}")

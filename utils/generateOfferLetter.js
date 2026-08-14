import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Page height (pdf-lib uses bottom-up y, pdfplumber uses top-down) ─────────
const PAGE_H = 842.25;

// How much clear space (in points) to leave between the text baseline
// and the underline itself. Now that field coordinates are measured
// directly off the real underscore glyphs (see below), a small uniform
// gap is enough — the earlier "still touching" issue was caused by wrong
// coordinates, not too little gap.
const GAP_ABOVE_LINE = 6;

/**
 * Field coordinates measured directly from the actual template PDF by
 * locating every run of underscore ("_") characters with pdfplumber and
 * taking the bounding box of each run — xStart/xEnd is the horizontal
 * span, lineBottom is the underline's true y position (pdfplumber
 * top-down coords). This replaces the earlier hand-estimated coordinates,
 * which were accurate for "date"/"id" but off by 6–10pt for every other
 * field — that mismatch, not gap size, was why those fields still looked
 * like they sat on/through the line no matter how much gap was added.
 */
const FIELDS = {
  date:      { xStart: 168.1, xEnd: 294.4, lineBottom: 121.9 },
  id:        { xStart: 432.3, xEnd: 533.4, lineBottom: 124.4 },
  toName:    { xStart:  32.8, xEnd: 251.0, lineBottom: 240.2 },
  dear:      { xStart:  64.9, xEnd: 167.9, lineBottom: 296.0 },
  position:  { xStart: 324.0, xEnd: 530.1, lineBottom: 324.0 },
  company:   { xStart:  93.5, xEnd: 251.1, lineBottom: 343.5 },
  role:      { xStart:  83.7, xEnd: 217.1, lineBottom: 418.9 },
  duration:  { xStart: 110.0, xEnd: 267.6, lineBottom: 438.4 },
  startDate: { xStart: 123.3, xEnd: 256.6, lineBottom: 477.4 },
};

/**
 * Draws text horizontally centered within a blank-line field, with the
 * baseline sitting `gap` points above the underline so text never touches
 * (or gets bisected by) the line. Clamps font size down automatically if
 * the text is too wide to fit.
 */
function drawCentered(page, font, text, field, size = 11, color = [0.05, 0.05, 0.12], gap = GAP_ABOVE_LINE) {
  const maxWidth = field.xEnd - field.xStart - 4; // 2pt padding each side
  let fontSize = size;

  // Auto-shrink if text overflows the blank
  while (font.widthOfTextAtSize(text, fontSize) > maxWidth && fontSize > 6) {
    fontSize -= 0.5;
  }

  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const centerX = (field.xStart + field.xEnd) / 2;
  const x = centerX - textWidth / 2;
  const y = PAGE_H - field.lineBottom + gap; // shift baseline up off the line

  page.drawText(text, {
    x,
    y,
    size: fontSize,
    font,
    color: rgb(...color),
  });
}

/**
 * Generate a filled offer-letter PDF buffer.
 *
 * @param {{
 *   name: string,         // applicant full name  → "To," line + "Dear" line
 *   position: string,     // internship title     → "position of ___"
 *   company: string,      // company name         → "Intern at ___"
 *   role: string,         // role/domain          → "Role: ___"
 *   duration: string,     // e.g. "2 Months"      → "Duration: ___"
 *   startDate: string,    // e.g. "01 Jun 2025"   → "Start Date: ___"
 *   date: string,         // issue date           → "Date: ___"
 *   id: string,           // offer letter ID      → "ID: ___"
 *   templatePath?: string // optional custom path
 * }} data
 *
 * @returns {Promise<Buffer>}
 */
export async function generateOfferLetter(data) {
  const {
    name,
    position,
    company,
    role,
    duration,
    startDate,
    date,
    id,
    templatePath = path.join(__dirname, "../assets/offer_letter_template.pdf"),
  } = data;

  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.getPages()[0];

  // ── Date & ID (top header row) ─────────────────────────────────────────────
  drawCentered(page, fontRegular, date,                FIELDS.date,      10);
  drawCentered(page, fontRegular, id,                  FIELDS.id,        10);

  // ── "To," name block ────────────────────────────────────────────────────────
  drawCentered(page, fontBold,    name,                FIELDS.toName,    11);

  // ── "Dear ____" – first name only ──────────────────────────────────────────
  drawCentered(page, fontBold,    name.split(" ")[0],  FIELDS.dear,      11);

  // ── Body fields ─────────────────────────────────────────────────────────────
  drawCentered(page, fontBold,    position,            FIELDS.position,  10);
  drawCentered(page, fontBold,    company,             FIELDS.company,   10);
  drawCentered(page, fontBold,    role,                FIELDS.role,      11);
  drawCentered(page, fontBold,    duration,            FIELDS.duration,  11);
  drawCentered(page, fontBold,    startDate,           FIELDS.startDate, 11);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
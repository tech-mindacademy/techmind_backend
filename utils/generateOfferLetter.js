import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Page constants ────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PAGE_H = 842.25; // points (pdf-lib uses bottom-up y)


/**
 * All blank-line fields measured from pdfplumber (top-down) then converted:
 *   pdf_y = PAGE_H - plumber_top
 *
 * x_start / x_end  → horizontal span of the underscores
 * y                → baseline for text (pdf-lib bottom-up)
 */
const FIELDS = {
  date:       { xStart: 168, xEnd: 333, y: PAGE_H - 108 - 1 },
  id:         { xStart: 450, xEnd: 527, y: PAGE_H - 111 - 1 },
  toName:     { xStart: 32,  xEnd: 245, y: PAGE_H - 229 - 1 },
  dear:       { xStart: 64,  xEnd: 162, y: PAGE_H - 292 - 1 },
  position:   { xStart: 324, xEnd: 524, y: PAGE_H - 320 - 1 },
  company:    { xStart: 93,  xEnd: 245, y: PAGE_H - 340 - 1 },
  role:       { xStart: 83,  xEnd: 211, y: PAGE_H - 411 - 1 },
  duration:   { xStart: 110, xEnd: 262, y: PAGE_H - 431 - 1 },
  startDate:  { xStart: 123, xEnd: 251, y: PAGE_H - 470 - 1 },
};

/**
 * Draws text centered over a blank line.
 * @param {import("pdf-lib").PDFPage} page
 * @param {import("pdf-lib").PDFFont} font
 * @param {string} text
 * @param {{ xStart, xEnd, y }} field
 * @param {number} size  font size in pt
 * @param {[number,number,number]} color  rgb 0-1 tuple
 */
function drawCentered(page, font, text, field, size = 11, color = [0.05, 0.05, 0.12]) {
  const textWidth = font.widthOfTextAtSize(text, size);
  const centerX = (field.xStart + field.xEnd) / 2;
  const x = centerX - textWidth / 2;
  page.drawText(text, {
    x,
    y: field.y,
    size,
    font,
    color: rgb(...color),
  });
}

/**
 * Generate a filled offer-letter PDF buffer.
 *
 * @param {{
 *   name: string,        // applicant full name  → "To," line + "Dear" line
 *   position: string,    // internship title      → "position of ___"
 *   company: string,     // company name          → "Intern at ___"
 *   role: string,        // role detail           → "Role: ___"
 *   duration: string,    // e.g. "2 Months"       → "Duration: ___"
 *   startDate: string,   // e.g. "01 June 2025"   → "Start Date: ___"
 *   date: string,        // issue date            → "Date: ___"
 *   id: string,          // offer letter ID       → "ID: ___"
 *   templatePath?: string // optional custom template path
 * }} data
 *
 * @returns {Promise<Buffer>} PDF bytes
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
    templatePath = path.join(
  __dirname,
  "../assets/offer_letter_template.pdf"
),
  } = data;

  // Load template
  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  // Use built-in Helvetica-Bold (no external font needed)
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.getPages()[0];

  // ── Draw each field ──────────────────────────────────────────────────────

  // Date (smaller, regular weight)
  drawCentered(page, fontRegular, date,       FIELDS.date,      10);

  // ID
  drawCentered(page, fontRegular, id,         FIELDS.id,        10);

  // "To," name line – applicant full name
  drawCentered(page, font,        name,       FIELDS.toName,    11);

  // "Dear ____" – first name only looks best
  const firstName = name.split(" ")[0];
  drawCentered(page, font,        firstName,  FIELDS.dear,      11);

  // "position of ____"
  drawCentered(page, font,        position,   FIELDS.position,  10.5);

  // "Intern at ____"
  drawCentered(page, font,        company,    FIELDS.company,   10.5);

  // Role
  drawCentered(page, font,        role,       FIELDS.role,      11);

  // Duration
  drawCentered(page, font,        duration,   FIELDS.duration,  11);

  // Start Date
  drawCentered(page, font,        startDate,  FIELDS.startDate, 11);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

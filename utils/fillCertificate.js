import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PDF coordinate system (pdf-lib): origin = BOTTOM-LEFT
// Page size: 842.25 × 595.5 pts (A4 landscape)
// rl() converts pdfplumber top-coords to pdf-lib y-coords
const PAGE_H = 595.5;
const rl = (plumberTop) => PAGE_H - plumberTop;

// How much clear space (in points) to leave between the text baseline
// and the underline itself.
const GAP_ABOVE_LINE = 6;

// Underline boundaries measured directly from the real template PDF
// (pdfplumber page.lines / page.rects — the actual drawn underline
// vectors, not estimates). x0/x1 = horizontal span, top = the
// underline's own vertical position in pdfplumber top-down coords.
// Note: this template has no "parent name / S/o/D/o" line — that field
// was a leftover from a different template and has been removed.
const LINES = {
  studentName : { x0: 210.7, x1: 445.4, top: 226.1 }, // blank after "This is to certify that"
  courseName  : { x0:  40.3, x1: 303.5, top: 261.4 }, // blank before "at Tech Mind Academy"
  fromDate    : { x0: 682.1, x1: 798.6, top: 261.3 }, // blank after "during the tenure of"
  toDate      : { x0:  68.4, x1: 184.9, top: 293.8 }, // blank after "to"
  refNo       : { x0: 698.7, x1: 792.9, top: 178.7 }, // blank after "Ref No."
};

const TEMPLATE_PATH = path.join(
  __dirname,
  "../assets/certificate_template.pdf"
);

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * Generates a filled certificate PDF from an enrollment document.
 *
 * @param {object} enrollment - Mongoose enrollment doc (populated with course)
 * @param {object} student    - User doc (req.user)
 * @returns {Promise<Uint8Array>}
 */
export async function fillCertificate(enrollment, student) {
  const course = enrollment.course;

  const fields = {
    studentName : student.name,
    courseName  : course.title.length > 55 ? course.title.slice(0, 52) + "…" : course.title,
    fromDate    : fmtDate(enrollment.createdAt),
    toDate      : fmtDate(enrollment.certificateIssuedAt),
    refNo       : enrollment._id.toString().slice(-12).toUpperCase(),
  };

  const templateBytes = await readFile(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page   = pdfDoc.getPages()[0];

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const INK     = rgb(0.05, 0.05, 0.05);

  /**
   * Draw text centred within the bounds of a named underline, with the
   * baseline sitting GAP_ABOVE_LINE points above the underline's own
   * y-position so text never touches (or is bisected by) the line.
   *
   * @param {string} field  - key in LINES
   * @param {string} text   - text to draw
   * @param {number} plumberTop - vertical position of the underline (pdfplumber top coord)
   * @param {object} opts
   */
  const drawCentred = (field, text, { font = regular, size = 15, color = INK, gap = GAP_ABOVE_LINE } = {}) => {
    const { x0, x1, top } = LINES[field];
    const maxWidth = x1 - x0 - 4; // 2pt padding each side
    let fontSize = size;

    // Auto-shrink if text overflows the blank
    while (font.widthOfTextAtSize(String(text), fontSize) > maxWidth && fontSize > 8) {
      fontSize -= 0.5;
    }

    const textWidth = font.widthOfTextAtSize(String(text), fontSize);
    const x = (x0 + x1) / 2 - textWidth / 2;
    const y = rl(top) + gap; // shift baseline up off the line
    page.drawText(String(text), { x, y, size: fontSize, font, color });
  };

  drawCentred("studentName", fields.studentName, { font: bold, size: 22 });
  drawCentred("courseName",  fields.courseName,  { size: 12 });
  drawCentred("fromDate",    fields.fromDate,    { size: 12 });
  drawCentred("toDate",      fields.toDate,      { size: 12 });
  drawCentred("refNo",       fields.refNo,       { size: 11 });

  return pdfDoc.save();
}
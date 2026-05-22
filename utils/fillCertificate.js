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

// Underline boundaries extracted directly from the PDF vector data.
// Each entry is [x0, x1] of the blank line the text should be centred on.
const LINES = {
  studentName : [228.20, 598.36], // long centre line under "PROUDLY PRESENTED TO"
  parentName  : [158.93, 422.10], // after "S/o/D/o"
  courseName  : [109.80, 476.30], // after "of"
  fromDate    : [529.45, 743.55], // after "from"
  toDate      : [110.66, 324.77], // after "to"
  refNo       : [725.19, 819.40], // after "Ref No."
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
   * Draw text centred within the bounds of a named underline.
   * @param {string} field  - key in LINES
   * @param {string} text   - text to draw
   * @param {number} plumberTop - vertical position (pdfplumber top coord)
   * @param {object} opts
   */
  const drawCentred = (field, text, plumberTop, { font = regular, size = 15, color = INK } = {}) => {
    const [x0, x1]   = LINES[field];
    const textWidth   = font.widthOfTextAtSize(text, size);
    const x           = (x0 + x1) / 2 - textWidth / 2;
    const y           = rl(plumberTop);
    page.drawText(String(text), { x, y, size, font, color });
  };

  // Student name — plumber top ≈ 242
  drawCentred("studentName", fields.studentName, 242, { font: bold, size: 26 });

  // Course name — plumber top ≈ 342
  drawCentred("courseName", fields.courseName, 338);

  // From date — plumber top ≈ 341
  drawCentred("fromDate", fields.fromDate, 338);

  // To date — plumber top ≈ 376
  drawCentred("toDate", fields.toDate, 368);

  // Ref No — plumber top ≈ 192
  drawCentred("refNo", fields.refNo, 188, { size: 11 });

  return pdfDoc.save();
}
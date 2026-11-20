/**
 * Builds the service letter PDF in the browser.
 *
 * The SHA-256 of the exact bytes returned here is what gets written to
 * Cardano. So: generate once, hash these bytes, give the employee THESE bytes.
 * Do not regenerate the file later. A new file can hash differently.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";
import { formatDateOnly } from "@/lib/letter-format";

export interface LetterContent {
  letterId: string;
  companyName: string;
  /** Used in the file properties only */
  employeeName: string;
  /** The finished letter text (placeholders already filled). New lines = new paragraphs. */
  body: string;
  signerName: string;
  signerTitle: string;
  /** yyyy-mm-dd */
  issueDate: string;
  /** Full link that the QR code opens, e.g. https://robin.app/verify/<letterId> */
  verifyUrl: string;
}

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 64;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = rgb(0.09, 0.1, 0.13);
const MUTED = rgb(0.4, 0.42, 0.47);
const ACCENT = rgb(0.31, 0.27, 0.9); // indigo
const RULE = rgb(0.82, 0.84, 0.88);

/** Standard PDF fonts only draw Western characters. Replace the rest with "?". */
function makeSafe(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return (text: string) =>
    Array.from(text.replace(/\t/g, " ").replace(/[\r\n]+/g, " "))
      .map((ch) => (supported.has(ch.codePointAt(0)!) ? ch : "?"))
      .join("");
}

/** Splits text into lines that fit maxWidth. Also breaks very long words (like URLs). */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";

  const push = () => {
    if (line) lines.push(line);
    line = "";
  };

  for (const word of text.split(" ")) {
    if (!word) continue;

    // Word longer than a whole line: cut it by characters
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      push();
      let chunk = "";
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
      continue;
    }

    const attempt = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(attempt, size) <= maxWidth) {
      line = attempt;
    } else {
      push();
      line = word;
    }
  }
  push();
  return lines;
}

export async function generateLetterPdf(c: LetterContent): Promise<Uint8Array> {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const safe = makeSafe(regular);

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const company = safe(c.companyName);

  // ---- Header -------------------------------------------------------------
  const headerLines = wrap(company.toUpperCase(), bold, 18, CONTENT_W);
  for (const l of headerLines) {
    page.drawText(l, { x: MARGIN, y: y - 18, size: 18, font: bold, color: INK });
    y -= 24;
  }
  y -= 4;
  page.drawRectangle({ x: MARGIN, y, width: 48, height: 3, color: ACCENT });
  y -= 14;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.6,
    color: RULE,
  });
  y -= 36;

  // ---- Title and date -------------------------------------------------------
  page.drawText("SERVICE LETTER", { x: MARGIN, y, size: 12, font: bold, color: ACCENT });
  const dateText = `Date: ${formatDateOnly(c.issueDate)}`;
  page.drawText(dateText, {
    x: PAGE_W - MARGIN - regular.widthOfTextAtSize(dateText, 10),
    y,
    size: 10,
    font: regular,
    color: MUTED,
  });
  y -= 40;

  page.drawText("To Whom It May Concern,", { x: MARGIN, y, size: 11, font: regular, color: INK });
  y -= 30;

  // ---- Body ---------------------------------------------------------------
  const paragraphs = c.body
    .split(/\r?\n/)
    .map((p) => safe(p.trim()))
    .filter(Boolean);

  const bodySize = 11;
  const lineHeight = 17;
  const paragraphGap = 10;

  // Make sure the text cannot run into the signature and the QR area
  const signatureBlock = 175;
  const footerTopY = MARGIN + 92 + 34;
  const available = y - (footerTopY + signatureBlock);
  let needed = 0;
  for (const text of paragraphs) {
    needed += wrap(text, regular, bodySize, CONTENT_W).length * lineHeight + paragraphGap;
  }
  if (needed > available) {
    throw new Error("The letter text is too long to fit on one page. Shorten the format.");
  }

  for (const text of paragraphs) {
    for (const l of wrap(text, regular, bodySize, CONTENT_W)) {
      page.drawText(l, { x: MARGIN, y, size: bodySize, font: regular, color: INK });
      y -= lineHeight;
    }
    y -= paragraphGap;
  }

  // ---- Signature ----------------------------------------------------------
  y -= 22;
  page.drawText("Yours faithfully,", { x: MARGIN, y, size: 11, font: regular, color: INK });
  y -= 58;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 170, y },
    thickness: 0.7,
    color: INK,
  });
  y -= 16;
  page.drawText(safe(c.signerName), { x: MARGIN, y, size: 11, font: bold, color: INK });
  y -= 15;
  page.drawText(safe(c.signerTitle), { x: MARGIN, y, size: 10, font: regular, color: MUTED });
  y -= 14;
  for (const l of wrap(company, regular, 10, CONTENT_W)) {
    page.drawText(l, { x: MARGIN, y, size: 10, font: regular, color: MUTED });
    y -= 13;
  }

  // ---- Footer: QR code and verification text ------------------------------
  const qrSize = 92;
  const footerTop = MARGIN + qrSize + 34;
  page.drawLine({
    start: { x: MARGIN, y: footerTop },
    end: { x: PAGE_W - MARGIN, y: footerTop },
    thickness: 0.6,
    color: RULE,
  });

  const qrDataUrl = await QRCode.toDataURL(c.verifyUrl, {
    margin: 1,
    width: 360,
    errorCorrectionLevel: "M",
  });
  const qrImage = await pdf.embedPng(qrDataUrl);
  page.drawImage(qrImage, { x: MARGIN, y: MARGIN, width: qrSize, height: qrSize });

  const textX = MARGIN + qrSize + 18;
  const textW = PAGE_W - MARGIN - textX;
  let ty = MARGIN + qrSize - 10;

  page.drawText("Verify this letter", { x: textX, y: ty, size: 11, font: bold, color: INK });
  ty -= 15;

  const note =
    "Scan the QR code or open the link below. The digital fingerprint (SHA-256) of this exact file is recorded on the Cardano blockchain, so any change to it will fail verification.";
  for (const l of wrap(note, regular, 8.5, textW)) {
    page.drawText(l, { x: textX, y: ty, size: 8.5, font: regular, color: MUTED });
    ty -= 11.5;
  }
  ty -= 3;
  for (const l of wrap(c.verifyUrl, regular, 8, textW)) {
    page.drawText(l, { x: textX, y: ty, size: 8, font: regular, color: ACCENT });
    ty -= 11;
  }
  ty -= 2;
  page.drawText(`Letter ID: ${c.letterId}`, {
    x: textX,
    y: ty,
    size: 7.5,
    font: regular,
    color: MUTED,
  });

  // ---- Fixed metadata so the file does not depend on the clock ------------
  const issued = new Date(`${c.issueDate}T00:00:00Z`);
  pdf.setTitle(`Service Letter - ${safe(c.employeeName)}`);
  pdf.setAuthor(company);
  pdf.setSubject("Service letter secured on Cardano by Robin");
  pdf.setCreator("Robin");
  pdf.setProducer("Robin");
  if (!Number.isNaN(issued.getTime())) {
    pdf.setCreationDate(issued);
    pdf.setModificationDate(issued);
  }

  return pdf.save({ useObjectStreams: false });
}
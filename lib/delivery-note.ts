import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";

export type DeliveryNoteItem = {
  productId: string;
  productName: string;
  quantity: number;
};

export type DeliveryNoteInput = {
  deliveryNoteNumber: string;
  deliveryDate: string;
  branchName: string;
  retailBrand: string;
  address: string;
  openingHours: string;
  items: DeliveryNoteItem[];
};

const A4: [number, number] = [595.28, 841.89];
const ink = rgb(0.08, 0.21, 0.29);
const muted = rgb(0.35, 0.46, 0.52);
const line = rgb(0.74, 0.86, 0.92);
const blue = rgb(0.66, 0.85, 0.95);
const paleBlue = rgb(0.93, 0.97, 0.99);

function drawText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size = 10, color = ink) {
  page.drawText(text, { x, y, size, font, color });
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  for (const character of text) {
    const candidate = `${current}${character}`;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function createDeliveryNotePdf(input: DeliveryNoteInput, fontBytes: ArrayBuffer | Uint8Array) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(fontBytes, { subset: true });
  const page = document.addPage(A4);
  const width = page.getWidth();
  const margin = 42;

  page.drawRectangle({ x: 0, y: 742, width, height: 100, color: paleBlue });
  page.drawRectangle({ x: 0, y: 742, width: 10, height: 100, color: blue });
  drawText(page, font, "南堂花茶", margin, 795, 22);
  drawText(page, font, "NANTONG TEA", margin, 775, 9, muted);
  drawText(page, font, "DELIVERY NOTE / 送貨單", width - margin - 205, 795, 17);
  drawText(page, font, `送貨單編號：${input.deliveryNoteNumber}`, width - margin - 205, 770, 9, muted);

  drawText(page, font, "送貨資料", margin, 712, 12);
  page.drawLine({ start: { x: margin, y: 704 }, end: { x: width - margin, y: 704 }, thickness: 1, color: line });

  const info = [
    ["預定送貨日期", input.deliveryDate],
    ["店舖", `${input.retailBrand} · ${input.branchName}`],
    ["地址", input.address],
    ["營業時間", input.openingHours],
  ];
  let infoY = 680;
  for (const [label, value] of info) {
    drawText(page, font, label, margin, infoY, 9, muted);
    const valueLines = wrapText(font, value, 10, width - margin * 2 - 112);
    valueLines.forEach((valueLine, index) => drawText(page, font, valueLine, margin + 112, infoY - index * 15, 10));
    infoY -= Math.max(28, valueLines.length * 15 + 10);
  }

  const tableTop = 555;
  const tableWidth = width - margin * 2;
  const columns = [margin, margin + 54, margin + 260, margin + 410, width - margin];
  page.drawRectangle({ x: margin, y: tableTop - 28, width: tableWidth, height: 28, color: blue });
  ["項目", "產品名稱", "產品 ID", "數量"].forEach((heading, index) => {
    const x = index === 3 ? columns[4] - 52 : columns[index] + 9;
    drawText(page, font, heading, x, tableTop - 19, 9);
  });

  let rowY = tableTop - 28;
  input.items.forEach((item, index) => {
    const nextY = rowY - 34;
    if (index % 2 === 0) {
      page.drawRectangle({ x: margin, y: nextY, width: tableWidth, height: 34, color: paleBlue });
    }
    drawText(page, font, String(index + 1), columns[0] + 18, nextY + 12, 10);
    drawText(page, font, item.productName, columns[1] + 9, nextY + 12, 10);
    drawText(page, font, item.productId, columns[2] + 9, nextY + 12, 10);
    drawText(page, font, String(item.quantity), columns[4] - 38, nextY + 12, 11);
    page.drawLine({ start: { x: margin, y: nextY }, end: { x: width - margin, y: nextY }, thickness: 0.6, color: line });
    rowY = nextY;
  });

  page.drawRectangle({ x: margin, y: rowY - 38, width: tableWidth, height: 38, color: rgb(0.87, 0.94, 0.98) });
  drawText(page, font, "總數量", columns[2] + 9, rowY - 24, 11);
  drawText(page, font, `${input.items.reduce((sum, item) => sum + item.quantity, 0)} 盒`, columns[4] - 58, rowY - 24, 12);

  const noteY = Math.min(rowY - 78, 255);
  drawText(page, font, "備註", margin, noteY, 11);
  const notes = [
    "本單為預定補貨，不顯示價格。",
    "到場後請按實際貨架餘量修正實際送貨數量，再由雙方簽收。",
  ];
  notes.forEach((note, index) => drawText(page, font, `• ${note}`, margin, noteY - 24 - index * 20, 9, muted));

  const signatureY = 100;
  drawText(page, font, "送貨方簽署", margin, signatureY + 38, 9, muted);
  page.drawLine({ start: { x: margin, y: signatureY }, end: { x: margin + 205, y: signatureY }, thickness: 0.8, color: muted });
  drawText(page, font, "店舖簽收", width - margin - 205, signatureY + 38, 9, muted);
  page.drawLine({ start: { x: width - margin - 205, y: signatureY }, end: { x: width - margin, y: signatureY }, thickness: 0.8, color: muted });
  drawText(page, font, "日期：", margin, 72, 9, muted);
  drawText(page, font, "日期：", width - margin - 205, 72, 9, muted);
  drawText(page, font, "南堂花茶 · Delivery Note", margin, 34, 8, muted);

  document.setTitle(`${input.deliveryNoteNumber} ${input.branchName} 送貨單`);
  document.setSubject("南堂花茶 DFI 分店送貨單");
  document.setCreator("南堂 DFI 補貨系統 V1.1");
  return document.save();
}

export function deliveryNoteFilename(input: Pick<DeliveryNoteInput, "deliveryNoteNumber" | "branchName">) {
  return `${input.deliveryNoteNumber}_${input.branchName}_送貨單.pdf`;
}

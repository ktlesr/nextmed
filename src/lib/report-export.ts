import "server-only";
import ExcelJS from "exceljs";
import { AlignmentType, Document, HeadingLevel, PageOrientation, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { cellText, type Cell, type ReportDoc } from "./report-data";

const INK = "0D1A3A", COBALT = "1A3FC0", LINE = "D3DAE4", SOFT = "E8EDF3";
const isStrong = (c: Cell) => typeof c !== "string" && !!c.strong;

/** Excel export — one sheet, sections stacked, in the report's language. */
export async function reportToXlsx(doc: ReportDoc, emptyLabel: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PDS4NextMed";
  const ws = wb.addWorksheet(doc.period.slice(0, 28), { views: [{ showGridLines: false }] });
  const maxCols = Math.max(4, ...doc.sections.map((s) => s.table?.head.length ?? 0));
  for (let i = 1; i <= maxCols; i++) ws.getColumn(i).width = 18;
  const add = (values: (string | number)[]) => ws.addRow(values);

  const title = add([doc.title]);
  title.font = { bold: true, size: 15, color: { argb: "FF" + INK } };
  add([doc.subtitle]).font = { color: { argb: "FF414E6B" } };
  add([]);
  for (const [k, v] of doc.meta) { const r = add([k, v]); r.getCell(1).font = { bold: true }; }
  add([]);
  for (const s of doc.stats) { const r = add([s.label, s.value, s.sub ?? ""]); r.getCell(1).font = { bold: true }; }

  for (const sec of doc.sections) {
    add([]);
    const h = add([[sec.code, sec.heading].filter(Boolean).join(" ")]);
    h.font = { bold: true, size: 12, color: { argb: "FF" + COBALT } };
    if (sec.note) add([sec.note]).font = { italic: true, color: { argb: "FF76819A" } };
    const tb = sec.table;
    if (!tb || tb.rows.length === 0) { add([sec.empty ?? emptyLabel]).font = { color: { argb: "FF76819A" } }; continue; }
    const head = add(tb.head.map((c) => c.label));
    head.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + INK } }; c.alignment = { vertical: "middle", wrapText: true }; });
    tb.head.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = Math.max(col.width ?? 10, c.wide ? 46 : c.mono ? 14 : 24); });
    const put = (cells: Cell[], foot = false) => {
      const r = add(cells.map(cellText));
      r.eachCell((c, i) => {
        c.alignment = { vertical: "top", wrapText: true, horizontal: tb.head[i - 1]?.align === "r" ? "right" : "left" };
        c.border = { bottom: { style: "thin", color: { argb: "FF" + LINE } } };
        if (foot) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + SOFT } };
        if (isStrong(cells[i - 1])) c.font = { bold: true };
      });
    };
    tb.rows.forEach((r) => put(r));
    tb.foot?.forEach((r) => put(r, true));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Word export — landscape A4. */
export async function reportToDocx(doc: ReportDoc, emptyLabel: string): Promise<Buffer> {
  const FONT = "Calibri";
  const run = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) => new TextRun({ text, font: FONT, size: o.size ?? 18, bold: o.bold, color: o.color, italics: o.italics });
  const para = (text: string, o: Parameters<typeof run>[1] & { right?: boolean } = {}) => text.split("\n").map((line) => new Paragraph({ alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [run(line, o)], spacing: { after: 30 } }));
  const cell = (text: string, o: { bold?: boolean; fill?: string; color?: string; right?: boolean; width?: number } = {}) =>
    new TableCell({ children: para(text || " ", { bold: o.bold, color: o.color, right: o.right, size: 16 }), shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined, margins: { top: 50, bottom: 50, left: 80, right: 80 }, width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined });
  const border = { style: "single" as const, size: 4, color: LINE };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [run(doc.title, { bold: true, size: 34, color: INK })], spacing: { after: 60 } }),
    new Paragraph({ children: [run(doc.subtitle, { color: "414E6B", size: 20 })], spacing: { after: 200 } }),
    new Table({ width: { size: 60, type: WidthType.PERCENTAGE }, borders, rows: doc.meta.map(([k, v]) => new TableRow({ children: [cell(k, { bold: true, fill: SOFT, width: 35 }), cell(v, { width: 65 })] })) }),
    new Paragraph({ children: [], spacing: { after: 160 } }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, rows: [
      new TableRow({ children: doc.stats.map((s) => cell(s.label, { bold: true, fill: SOFT })) }),
      new TableRow({ children: doc.stats.map((s) => cell(s.value + (s.sub ? `\n${s.sub}` : ""), { bold: true })) }),
    ] }),
  ];
  for (const sec of doc.sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run([sec.code, sec.heading].filter(Boolean).join(" "), { bold: true, size: 24, color: COBALT })], spacing: { before: 320, after: 80 } }));
    if (sec.note) children.push(new Paragraph({ children: [run(sec.note, { italics: true, color: "76819A", size: 16 })], spacing: { after: 80 } }));
    const tb = sec.table;
    if (!tb || tb.rows.length === 0) { children.push(new Paragraph({ children: [run(sec.empty ?? emptyLabel, { color: "76819A" })] })); continue; }
    const units = tb.head.map((c) => (c.wide ? 3 : c.mono ? 1 : 1.6));
    const total = units.reduce((a, b) => a + b, 0);
    const w = units.map((u) => Math.round((u / total) * 100));
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE }, borders,
      rows: [
        new TableRow({ tableHeader: true, children: tb.head.map((c, i) => cell(c.label, { bold: true, fill: INK, color: "FFFFFF", width: w[i], right: c.align === "r" })) }),
        ...tb.rows.map((r) => new TableRow({ children: r.map((c, i) => cell(cellText(c), { width: w[i], right: tb.head[i]?.align === "r", bold: isStrong(c) })) })),
        ...(tb.foot ?? []).map((r) => new TableRow({ children: r.map((c, i) => cell(cellText(c), { width: w[i], right: tb.head[i]?.align === "r", bold: isStrong(c), fill: SOFT })) })),
      ],
    }));
  }
  const d = new Document({
    creator: "PDS4NextMed", title: doc.title,
    sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, children }],
  });
  return Buffer.from(await Packer.toBuffer(d));
}

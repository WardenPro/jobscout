import { expect, it } from "vitest";
import { Document, Packer, Paragraph } from "docx";
import { extractText } from "@/lib/cv/text-extract";

it("importe un CV Word avec accents et paragraphes via Mammoth", async () => {
  const paragraphs = [
    "Camille Martin",
    "Expérience professionnelle",
    "Ingénieure systèmes — Genève",
    "Administration Windows Server et réseaux",
    "Formation : Bachelor en informatique",
    "Compétences : sécurité, sauvegardes, français et anglais",
  ];
  const buffer = await Packer.toBuffer(new Document({
    sections: [{ children: paragraphs.map(text => new Paragraph(text)) }],
  }));
  const result = await extractText(buffer, "cv-test.docx");
  expect(result.kind).toBe("docx");
  expect(result.strategy).toBe("mammoth");
  for (const text of paragraphs) expect(result.text).toContain(text);
  expect(result.text.indexOf(paragraphs[1])).toBeLessThan(result.text.indexOf(paragraphs[4]));
});

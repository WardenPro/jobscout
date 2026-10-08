import { expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fitCVToOnePage } from "@/lib/pdf/render";
import { renderCVDocx } from "@/lib/docx/render";
import type { GeneratedCV } from "@/lib/ai/generate-cv";

it("conserve une page lisible avec photo, coordonnées longues et trois expériences", async () => {
  const jpeg = await sharp({ create: { width: 480, height: 600, channels: 3, background: "#b9c9d8" } }).jpeg().toBuffer();
  const cv: GeneratedCV = {
    photo: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
    headline: "Ingénieur systèmes Microsoft",
    identity: { full_name: "Camille Martin", email: "camille.martin@example.org", phone: "+33 6 12 34 56 78", location: "Thonon-les-Bains (74), France — Permis G (frontalier)", linkedin_url: "https://linkedin.com/in/camille-martin", portfolio_url: "https://github.com/camille-martin" },
    summary: "Ingénieure systèmes et développeuse, avec une expérience en administration d'infrastructure, cloud AWS, conteneurisation et CI/CD. En charge de la définition de l'architecture cible du nouveau système d'information. Pratique de la sécurité, de la résilience et du monitoring d'une infrastructure de production. Titulaire d'un Bachelor en programmation informatique. Ce parcours en administration système, réseau et sécurité rejoint les missions du poste visé.",
    sections: {
      experiences: [
        { title: "Chargée de mission informatique (CDI)", company: "Fédération Exemple de Services Numériques", location: "Paris", start_date: "08/2025", end_date: null, bullet_points: ["Gestion de l'infrastructure de production et supervision des services", "Administration Cloudflare, Active Directory et gestion de serveurs Windows / Linux", "Déploiements, astreinte et gestion d'incidents sur l'infrastructure de production", "Définition de l'architecture cible du système d'information : sécurité, maintenance et résilience"] },
        { title: "Assistante Administratrice Système & Réseau (alternance)", company: "Fédération Exemple de Services Numériques", location: "Paris", start_date: "09/2024", end_date: "08/2025", bullet_points: ["Administration Active Directory et serveurs Windows / Linux", "Configuration réseau : routeurs, pare-feu et monitoring", "Rédaction de la PSSI pour le nouveau système d'information", "Mise en place de Vaultwarden et migration de bases de données MySQL"] },
        { title: "Développeuse Web (stage)", company: "Voyages Exemple", location: "Paris", start_date: "06/2023", end_date: "07/2023", bullet_points: ["Développement d'un trombinoscope employés en HTML, CSS et JavaScript", "Architecture MVC avec C# .NET pour la gestion de bases de données", "Intégration front-end et back-end"] },
      ],
      educations: [{ school: "École Exemple, Ferrières-en-Brie", degree: "Bachelor", field: "Programmation informatique", start_date: "2022", end_date: "2025", bullet_points: [] }],
      skills_flat: ["Active Directory", "Windows Server", "Linux", "Cloudflare", "Pare-feu Zyxel", "Monitoring", "Docker", "CI/CD", "AWS", "IAM", "Lambda", "S3", "Secrets Manager", "DynamoDB", "Réplication des bases de données", "MySQL", "OWASP", "reCAPTCHA", "Vaultwarden", "Python", "Bash", "Grafana", "JavaScript", "C#", ".NET"],
      languages: [{ name: "Français", level: "C2" }, { name: "Anglais", level: "C2" }], projects: [],
    },
  };
  const { pdf, cv: fitted } = await fitCVToOnePage(cv);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, disableFontFace: true, isEvalSupported: false });
  try {
    const document = await task.promise;
    expect(document.numPages).toBe(1);
    const content = await (await document.getPage(1)).getTextContent();
    const text = content.items.map(item => "str" in item ? item.str : "").join(" ");
    expect(text).toContain(cv.headline);
  } finally {
    await task.destroy();
  }
  expect(fitted.sections.experiences).toHaveLength(3);
  const docx = await renderCVDocx(fitted);
  if (process.env.JOBSCOUT_LAYOUT_QA_DIR) {
    fs.mkdirSync(process.env.JOBSCOUT_LAYOUT_QA_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.JOBSCOUT_LAYOUT_QA_DIR, "cv-layout.pdf"), pdf);
    fs.writeFileSync(path.join(process.env.JOBSCOUT_LAYOUT_QA_DIR, "cv-layout.docx"), docx);
  }
});

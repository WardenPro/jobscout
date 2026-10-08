import "server-only";
import * as React from "react";
import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import type { GeneratedCV } from "@/lib/ai/generate-cv";
import {
  typographyFor,
  formatLanguage,
  displayUrl,
  capitalizeFirst,
  eduYearRange,
  expDateRange,
  cleanJobTitle,
} from "@/lib/text/typography";
import { LABELS, letterDateLine, type DocLang } from "@/lib/text/lang";

// Pas de césure automatique : react-pdf coupe les mots avec des règles
// anglaises (« corre-spond », « ar-tisans »), inacceptable dans une lettre.
Font.registerHyphenationCallback((word) => [word]);

// =============================================================
// CV — modèle sobre une colonne, compatible ATS
// Tous les libellés fixes viennent de LABELS[language] : un CV pour une
// offre anglophone est entièrement en anglais (titres de sections,
// « Present », « Languages: »), avec la typographie anglaise.
// =============================================================

const cvStyles = StyleSheet.create({
  page: {
    paddingHorizontal: 48,
    paddingVertical: 34,
    fontFamily: "Times-Roman",
    fontSize: 10.5,
    lineHeight: 1.16,
    color: "#242424",
  },
  name: {
    fontSize: 20,
    fontFamily: "Times-Bold",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  headline: { fontSize: 12, marginBottom: 8 },
  contactLine: { fontSize: 9.5, color: "#444444", marginBottom: 2 },
  sectionTitle: {
    fontSize: 11.5,
    fontFamily: "Times-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.2,
    marginTop: 10,
    marginBottom: 5,
  },
  summary: { fontSize: 10.5, marginBottom: 2 },
  expBlock: { marginTop: 5 },
  expHeaderLine: { fontSize: 10.5, marginBottom: 2 },
  expTitleBold: { fontFamily: "Times-Bold" },
  expDates: { fontSize: 9.5, color: "#555555", marginBottom: 3 },
  bullet: { flexDirection: "row", marginBottom: 1.5, paddingLeft: 1 },
  bulletDot: { width: 10, fontSize: 10.5 },
  bulletText: { flex: 1, fontSize: 10.5 },
  eduBlock: { marginTop: 4 },
  eduSchool: { fontSize: 10.5, marginBottom: 2 },
  eduDegree: { fontSize: 10.5, color: "#444444", marginBottom: 2 },
  skillsFlow: { fontSize: 10.5, marginBottom: 3 },
  languagesLine: { fontSize: 10.5 },
});

type Ty = (s: string | null | undefined) => string;

function Bullets({ items, ty }: { items: string[]; ty: Ty }) {
  return (
    <>
      {items
        .filter((b) => b && b.trim())
        .map((b, j) => (
          <View key={j} style={cvStyles.bullet}>
            <Text style={cvStyles.bulletDot}>•</Text>
            <Text style={cvStyles.bulletText}>{ty(b)}</Text>
          </View>
        ))}
    </>
  );
}

export function CVDocument({ cv, language = "fr" }: { cv: GeneratedCV; language?: DocLang }) {
  const L = LABELS[language];
  const ty = typographyFor(language);
  const contact = [
    [cv.identity.phone, cv.identity.email].filter(Boolean).join("  ·  "),
    cv.identity.location,
    displayUrl(cv.identity.linkedin_url),
    displayUrl(cv.identity.portfolio_url),
  ].filter(Boolean) as string[];
  const projects = cv.sections.projects ?? [];

  return (
    <Document>
      <Page size="A4" style={cvStyles.page}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 5 }} wrap={false}>
          <View style={{ flex: 1, paddingRight: cv.photo ? 14 : 0 }}>
            <Text style={cvStyles.name}>{cv.identity.full_name}</Text>
            {cv.headline && <Text style={cvStyles.headline}>{cv.headline}</Text>}
            {contact.map((line, i) => <Text key={i} style={cvStyles.contactLine}>{line}</Text>)}
          </View>
          {cv.photo && <Image src={cv.photo} style={{ width: 66, height: 82.5, objectFit: "cover", borderRadius: 4 }} />}
        </View>

        {cv.summary && (
          <>
            <Text style={cvStyles.sectionTitle}>{L.profile}</Text>
            <Text style={cvStyles.summary}>{ty(cv.summary)}</Text>
          </>
        )}

        {cv.sections.experiences.length > 0 && (
          <>
            <Text style={cvStyles.sectionTitle}>{L.experience}</Text>
            {cv.sections.experiences.map((e, i) => (
              <View key={i} style={cvStyles.expBlock} wrap={false}>
                <Text style={cvStyles.expHeaderLine}>
                  <Text style={cvStyles.expTitleBold}>
                    {cleanJobTitle(e.title)}
                    {e.company ? ` — ${e.company}` : ""}
                  </Text>
                </Text>
                <Text style={cvStyles.expDates}>{[expDateRange(e.start_date, e.end_date, language), e.location].filter(Boolean).join(" · ")}</Text>
                <Bullets items={e.bullet_points ?? []} ty={ty} />
              </View>
            ))}
          </>
        )}

        {projects.length > 0 && (
          <>
            <Text style={cvStyles.sectionTitle}>{projects.length > 1 ? L.projects : L.project}</Text>
            {projects.map((p, i) => (
              <View key={i} style={cvStyles.expBlock} wrap={false}>
                <Text style={cvStyles.expHeaderLine}>
                  <Text style={cvStyles.expTitleBold}>
                    {p.name}
                    {p.role ? ` — ${p.role}` : ""}
                  </Text>
                </Text>
                <Text style={cvStyles.expDates}>{expDateRange(p.start_date, p.end_date, language)}</Text>
                <Bullets items={p.bullet_points ?? []} ty={ty} />
              </View>
            ))}
          </>
        )}

        {cv.sections.educations.length > 0 && (
          <>
            <Text style={cvStyles.sectionTitle}>{L.education}</Text>
            {cv.sections.educations.map((e, i) => (
              <View key={i} style={cvStyles.eduBlock} wrap={false}>
                <Text style={cvStyles.eduSchool}>
                  <Text style={cvStyles.expTitleBold}>{e.school}</Text>
                </Text>
                <Text style={cvStyles.expDates}>{eduYearRange(e.start_date, e.end_date, language)}</Text>
                {(e.degree || e.field) && (
                  <Text style={cvStyles.eduDegree}>{ty([e.degree, e.field].filter(Boolean).join(" — "))}</Text>
                )}
                <Bullets items={e.bullet_points ?? []} ty={ty} />
              </View>
            ))}
          </>
        )}

        {(cv.sections.skills_flat?.length || cv.sections.languages.length) ? (
          <>
            {cv.sections.skills_flat?.length > 0 && <Text style={cvStyles.sectionTitle}>{language === "en" ? "Skills" : "Compétences"}</Text>}
            {cv.sections.skills_flat?.length > 0 && (
              <Text style={cvStyles.skillsFlow}>
                {cv.sections.skills_flat.map((s) => capitalizeFirst(s)).join(", ")}
              </Text>
            )}
            {cv.sections.languages.length > 0 && (
              <>
              <Text style={cvStyles.sectionTitle}>{L.languages}</Text>
              <Text style={cvStyles.languagesLine}>
                {ty(
                  `${cv.sections.languages
                    .map((l) => formatLanguage(l.name, l.level))
                    .join(" · ")}`
                )}
              </Text>
              </>
            )}
          </>
        ) : null}
      </Page>
    </Document>
  );
}

// =============================================================
// Lettre de motivation — modèle de référence
// =============================================================

const lmStyles = StyleSheet.create({
  page: {
    paddingHorizontal: 56,
    paddingVertical: 50,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.32,
    color: "#000000",
  },
  senderName: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginBottom: 1 },
  senderLine: { fontSize: 10.5, marginBottom: 0.5 },
  blockGap: { height: 8 },
  smallGap: { height: 4 },
  dateLine: { fontSize: 10.5, marginBottom: 8 },
  recipient: { fontSize: 10.5, marginBottom: 8 },
  subject: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginBottom: 10 },
  salutation: { marginBottom: 8 },
  paragraph: { textAlign: "justify", marginBottom: 8 },
  signatureSpace: { height: 14 },
  signature: { fontFamily: "Helvetica-Bold" },
});

export function LMDocument({
  identity,
  recipient,
  object,
  body_paragraphs,
  language = "fr",
}: {
  identity: GeneratedCV["identity"];
  recipient: { company: string; location?: string | null };
  object: string;
  body_paragraphs: string[];
  language?: DocLang;
}) {
  const L = LABELS[language];
  const ty = typographyFor(language);
  const senderCity = identity.location?.split(",")[0]?.trim() || null;
  const dateLine = letterDateLine(senderCity, language);
  const company = (recipient.company ?? "").trim();

  return (
    <Document>
      <Page size="A4" style={lmStyles.page}>
        <Text style={lmStyles.senderName}>{identity.full_name}</Text>
        {identity.phone && <Text style={lmStyles.senderLine}>{identity.phone}</Text>}
        {identity.email && <Text style={lmStyles.senderLine}>{identity.email}</Text>}
        <View style={lmStyles.smallGap} />
        {identity.location && <Text style={lmStyles.senderLine}>{identity.location}</Text>}

        <View style={lmStyles.blockGap} />
        <Text style={lmStyles.dateLine}>{dateLine}</Text>

        {/* Destinataire uniquement si l'entreprise est connue : un pays seul n'a aucun sens */}
        {company ? (
          <Text style={lmStyles.recipient}>
            {company}
            {recipient.location ? `\n${recipient.location}` : ""}
          </Text>
        ) : null}

        <Text style={lmStyles.subject}>{ty(`${L.subject} : ${cleanJobTitle(object)}`)}</Text>
        <Text style={lmStyles.salutation}>{L.salutation}</Text>

        {body_paragraphs
          .filter((p) => p && p.trim())
          .map((p, i) => (
            <Text key={i} style={lmStyles.paragraph}>
              {ty(p)}
            </Text>
          ))}

        {L.closing ? <Text style={lmStyles.paragraph}>{L.closing}</Text> : null}
        {L.signoff ? <Text style={lmStyles.paragraph}>{L.signoff}</Text> : null}
        <View style={lmStyles.signatureSpace} />
        <Text style={lmStyles.signature}>{identity.full_name}</Text>
      </Page>
    </Document>
  );
}

// server/cert.ts — ENI SQL certification question generator

import Anthropic from "@anthropic-ai/sdk";
import type { CertPart, CertQuestion, CertQuestionType } from "../src/types.js";

const PART_DESCRIPTIONS: Record<CertPart, string> = {
  1: "Requêtes simples : SELECT, FROM, WHERE (AND/OR/NOT/IN/BETWEEN/LIKE/IS NULL), ORDER BY, LIMIT, GROUP BY, HAVING, fonctions d'agrégation (COUNT, SUM, AVG, MIN, MAX), DISTINCT.",
  2: "Requêtes complexes : INNER JOIN, LEFT JOIN, RIGHT JOIN, jointures multiples, sous-requêtes simples et corrélées (IN, NOT IN, EXISTS, NOT EXISTS), UNION, INTERSECT, EXCEPT.",
  3: "Mise à jour des données : INSERT INTO … VALUES, UPDATE … SET … WHERE, DELETE FROM … WHERE, TRUNCATE TABLE, CREATE TABLE, CREATE TEMPORARY TABLE … AS SELECT.",
  4: "Enregistrement de vues : CREATE VIEW … AS SELECT, vues avec jointures, vues avec agrégations et GROUP BY.",
};

const THEMES = [
  "employés / services / salaires",
  "produits / commandes / clients",
  "étudiants / cours / inscriptions",
  "livres / auteurs / bibliothèques",
  "médecins / patients / consultations",
  "films / acteurs / réalisateurs",
  "vols / passagers / aéroports",
  "projets / développeurs / équipes",
];

function buildSystemPrompt(part: CertPart, type: CertQuestionType): string {
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const typeLabel =
    type === "qcu"
      ? "QCU (une seule bonne réponse, boutons ronds)"
      : type === "qcm"
        ? "QCM (plusieurs bonnes réponses possibles, cases à cocher)"
        : "Cas pratique (l'utilisateur écrit une requête SQL)";

  return `Tu es un générateur de questions pour l'examen de certification ENI SQL.

PARTIE CONCERNÉE : Partie ${part} — ${PART_DESCRIPTIONS[part]}
TYPE DE QUESTION : ${typeLabel}
THÈME DES DONNÉES : ${theme}

Génère UNE SEULE question d'examen au format JSON strict, sans markdown, sans commentaires.
Le JSON doit respecter EXACTEMENT ce schéma selon le type :

Pour QCU ou QCM :
{
  "part": ${part},
  "type": "${type}",
  "context": "<paragraphe de contexte optionnel, ou chaîne vide>",
  "questionText": "<texte de la question>",
  "choices": [
    { "label": "A", "text": "<choix A — peut contenir du SQL sur plusieurs lignes>" },
    { "label": "B", "text": "<choix B>" },
    { "label": "C", "text": "<choix C>" },
    { "label": "D", "text": "<choix D>" }
  ],
  "correctAnswers": ["B"],
  "explanation": "<explication pédagogique de la bonne réponse>"
}

Pour un cas pratique :
{
  "part": ${part},
  "type": "practical",
  "context": "<contexte décrivant le scénario>",
  "questionText": "<consigne précise de ce que l'utilisateur doit écrire>",
  "schemaSQL": "<instructions CREATE TABLE et INSERT INTO pour 2-3 tables avec 5-10 lignes chacune, sans contraintes FOREIGN KEY>",
  "correctSQL": "<requête SQL correcte et complète>",
  "explanation": "<explication pédagogique de la solution>"
}

RÈGLES IMPORTANTES :
- Les données doivent être anonymes (noms fictifs français) et variées.
- Pour les QCU/QCM sur du code SQL : les choix doivent présenter des variantes réalistes et plausibles (erreurs courantes).
- Pour les cas pratiques : schemaSQL ne doit PAS contenir de FOREIGN KEY ni d'ALTER TABLE ; utilise uniquement CREATE TABLE + INSERT INTO.
- correctAnswers pour QCU : exactement un label. Pour QCM : deux ou trois labels.
- Retourne UNIQUEMENT le JSON, sans aucun texte autour.`;
}

export async function generateCertQuestion(
  apiKey: string,
  part: CertPart,
  type: CertQuestionType,
): Promise<CertQuestion> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: buildSystemPrompt(part, type),
    messages: [{ role: "user", content: "Génère la question." }],
  });

  const raw = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();

  // Strip potential markdown code fences if Claude wraps JSON despite instructions
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  const parsed = JSON.parse(jsonStr) as Omit<CertQuestion, "id">;
  return { ...parsed, id: crypto.randomUUID() } as CertQuestion;
}

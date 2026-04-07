// server/cert.ts — SQL certification question generator

import Anthropic from "@anthropic-ai/sdk";
import type { CertPart, CertQuestion, CertQuestionType } from "../src/types.js";

type Lang = 'en' | 'fr';

// ── French content ────────────────────────────────────────────────────────────

const PART_DESCRIPTIONS_FR: Record<CertPart, string> = {
  1: "Requêtes simples : SELECT, FROM, WHERE (AND/OR/NOT/IN/BETWEEN/LIKE/IS NULL), ORDER BY, LIMIT, GROUP BY, HAVING, fonctions d'agrégation (COUNT, SUM, AVG, MIN, MAX), DISTINCT, alias (AS), fonctions scalaires (UPPER, LOWER, LENGTH, CONCAT, ROUND, YEAR, MONTH…).",
  2: "Requêtes complexes : INNER JOIN, LEFT JOIN, RIGHT JOIN, jointures multiples (3+ tables), auto-jointure, sous-requêtes simples et corrélées (IN, NOT IN, EXISTS, NOT EXISTS, sous-requête scalaire), CTE (WITH … AS) simples et imbriquées, UNION, UNION ALL, INTERSECT, EXCEPT.",
  3: "Mise à jour des données : INSERT INTO … VALUES, INSERT INTO … SELECT, UPDATE … SET … WHERE, DELETE FROM … WHERE, TRUNCATE TABLE, CREATE TABLE avec contraintes (PRIMARY KEY, NOT NULL, UNIQUE, DEFAULT), CREATE TABLE … AS SELECT, CREATE TEMPORARY TABLE, ALTER TABLE (ADD/DROP/MODIFY COLUMN), DROP TABLE.",
  4: "Enregistrement de vues : CREATE VIEW … AS SELECT, CREATE OR REPLACE VIEW, vues avec jointures, vues avec agrégations et GROUP BY, vues avec sous-requêtes ou CTE, utilisation d'une vue dans une autre requête, DROP VIEW, notion de vue modifiable.",
};

const PART_CONCEPTS_FR: Record<CertPart, string[]> = {
  1: [
    "SELECT de base et projection de colonnes",
    "DISTINCT pour éliminer les doublons",
    "filtrage WHERE avec opérateurs de comparaison (=, <>, <, >, <=, >=)",
    "filtrage WHERE avec IN et NOT IN",
    "filtrage WHERE avec BETWEEN … AND",
    "filtrage WHERE avec LIKE et wildcards (%, _)",
    "filtrage WHERE avec IS NULL / IS NOT NULL",
    "combinaison de conditions avec AND, OR, NOT",
    "ORDER BY avec plusieurs colonnes et sens ASC/DESC",
    "LIMIT (ou TOP selon le SGBD)",
    "GROUP BY sur une ou plusieurs colonnes",
    "HAVING pour filtrer les groupes après agrégation",
    "COUNT(*) et COUNT(colonne)",
    "SUM et AVG sur une colonne numérique",
    "MIN et MAX",
    "alias de colonnes avec AS",
    "alias de tables et qualification des colonnes (table.colonne)",
    "expressions arithmétiques dans SELECT (+, -, *, /)",
    "fonctions sur chaînes : UPPER, LOWER, LENGTH, TRIM, CONCAT / ||",
    "fonctions numériques : ROUND, FLOOR, CEIL, ABS",
    "fonctions de date : YEAR, MONTH, DAY, DATE_DIFF, NOW / CURRENT_DATE",
    "CASE … WHEN … THEN … ELSE … END dans SELECT",
    "COALESCE pour remplacer les valeurs NULL",
  ],
  2: [
    "INNER JOIN entre deux tables",
    "LEFT JOIN et valeurs NULL dans la table de droite",
    "RIGHT JOIN",
    "FULL OUTER JOIN (ou équivalent UNION de LEFT et RIGHT JOIN)",
    "jointure sur trois tables ou plus (chaînage de JOINs)",
    "auto-jointure (self-join) sur la même table",
    "sous-requête dans WHERE avec IN",
    "sous-requête dans WHERE avec NOT IN",
    "sous-requête dans WHERE avec EXISTS",
    "sous-requête dans WHERE avec NOT EXISTS",
    "sous-requête corrélée (référence à la table externe)",
    "sous-requête scalaire utilisée dans SELECT ou comme valeur",
    "CTE simple (WITH nom AS (…) SELECT …)",
    "CTE utilisée dans une jointure",
    "CTEs multiples dans une même requête (WITH a AS (…), b AS (…))",
    "CTE récursive (WITH RECURSIVE … UNION ALL)",
    "UNION pour combiner deux résultats sans doublons",
    "UNION ALL pour conserver les doublons",
    "INTERSECT pour l'intersection de deux résultats",
    "EXCEPT (ou MINUS) pour la différence entre deux résultats",
  ],
  3: [
    "INSERT INTO … VALUES pour insérer une seule ligne",
    "INSERT INTO … VALUES pour insérer plusieurs lignes en une fois",
    "INSERT INTO … SELECT pour copier des données d'une autre table",
    "UPDATE … SET … WHERE pour modifier des lignes ciblées",
    "UPDATE modifiant plusieurs colonnes simultanément",
    "UPDATE avec une sous-requête dans SET ou WHERE",
    "DELETE FROM … WHERE pour supprimer des lignes ciblées",
    "DELETE avec une sous-requête dans WHERE",
    "TRUNCATE TABLE et différence avec DELETE sans WHERE",
    "CREATE TABLE avec PRIMARY KEY",
    "CREATE TABLE avec NOT NULL et DEFAULT",
    "CREATE TABLE avec UNIQUE et CHECK",
    "CREATE TABLE … AS SELECT pour créer une table à partir d'une requête",
    "CREATE TEMPORARY TABLE",
    "ALTER TABLE ADD COLUMN",
    "ALTER TABLE DROP COLUMN",
    "ALTER TABLE MODIFY / ALTER COLUMN pour changer le type",
    "DROP TABLE et IF EXISTS",
  ],
  4: [
    "CREATE VIEW simple basée sur un SELECT de base",
    "CREATE VIEW avec une jointure entre deux tables",
    "CREATE VIEW avec agrégation et GROUP BY",
    "CREATE VIEW avec filtre WHERE",
    "CREATE VIEW intégrant une sous-requête",
    "CREATE VIEW basée sur une CTE (WITH … AS)",
    "CREATE OR REPLACE VIEW pour remplacer une vue existante",
    "utilisation d'une vue dans une requête SELECT",
    "jointure entre une vue et une table",
    "DROP VIEW et DROP VIEW IF EXISTS",
    "notion de vue modifiable (vue sur une seule table sans GROUP BY ni DISTINCT)",
    "vue avec alias de colonnes",
  ],
};

const QCU_QCM_STYLES_FR = [
  "Quelle est la sortie (résultat) de cette requête SQL ?",
  "Laquelle de ces requêtes SQL est syntaxiquement correcte et produit le résultat attendu ?",
  "Laquelle de ces requêtes contient une erreur (syntaxe ou logique) ?",
  "Quelle requête SQL permet d'obtenir le résultat décrit ?",
  "Que fait exactement cette clause / cette partie de la requête ?",
  "Parmi ces requêtes, laquelle est équivalente à la requête donnée ?",
  "Dans quel ordre les clauses doivent-elles être écrites pour que la requête soit valide ?",
  "Quel est l'effet de l'ajout / de la suppression de cette clause sur le résultat ?",
];

const THEMES_FR = [
  "employés / services / salaires",
  "produits / commandes / clients",
  "étudiants / cours / inscriptions",
  "livres / auteurs / bibliothèques",
  "médecins / patients / consultations",
  "films / acteurs / réalisateurs",
  "vols / passagers / aéroports",
  "projets / développeurs / équipes",
  "restaurants / menus / réservations",
  "immobilier / appartements / propriétaires",
  "événements / participants / billets",
  "équipes sportives / matchs / scores",
  "banques / comptes bancaires / transactions",
  "fournisseurs / matériaux / chantiers",
  "animaux / refuges / adoptions",
];

// ── English content ───────────────────────────────────────────────────────────

const PART_DESCRIPTIONS_EN: Record<CertPart, string> = {
  1: "Simple queries: SELECT, FROM, WHERE (AND/OR/NOT/IN/BETWEEN/LIKE/IS NULL), ORDER BY, LIMIT, GROUP BY, HAVING, aggregate functions (COUNT, SUM, AVG, MIN, MAX), DISTINCT, aliases (AS), scalar functions (UPPER, LOWER, LENGTH, CONCAT, ROUND, YEAR, MONTH…).",
  2: "Complex queries: INNER JOIN, LEFT JOIN, RIGHT JOIN, multi-table joins (3+ tables), self-join, simple and correlated subqueries (IN, NOT IN, EXISTS, NOT EXISTS, scalar subquery), simple and nested CTEs (WITH … AS), UNION, UNION ALL, INTERSECT, EXCEPT.",
  3: "Data modification: INSERT INTO … VALUES, INSERT INTO … SELECT, UPDATE … SET … WHERE, DELETE FROM … WHERE, TRUNCATE TABLE, CREATE TABLE with constraints (PRIMARY KEY, NOT NULL, UNIQUE, DEFAULT), CREATE TABLE … AS SELECT, CREATE TEMPORARY TABLE, ALTER TABLE (ADD/DROP/MODIFY COLUMN), DROP TABLE.",
  4: "Views: CREATE VIEW … AS SELECT, CREATE OR REPLACE VIEW, views with joins, views with aggregations and GROUP BY, views with subqueries or CTEs, using a view inside another query, DROP VIEW, updatable views.",
};

const PART_CONCEPTS_EN: Record<CertPart, string[]> = {
  1: [
    "Basic SELECT and column projection",
    "DISTINCT to eliminate duplicates",
    "WHERE filtering with comparison operators (=, <>, <, >, <=, >=)",
    "WHERE filtering with IN and NOT IN",
    "WHERE filtering with BETWEEN … AND",
    "WHERE filtering with LIKE and wildcards (%, _)",
    "WHERE filtering with IS NULL / IS NOT NULL",
    "Combining conditions with AND, OR, NOT",
    "ORDER BY with multiple columns and ASC/DESC direction",
    "LIMIT (or TOP depending on the DBMS)",
    "GROUP BY on one or more columns",
    "HAVING to filter groups after aggregation",
    "COUNT(*) and COUNT(column)",
    "SUM and AVG on a numeric column",
    "MIN and MAX",
    "Column aliases with AS",
    "Table aliases and column qualification (table.column)",
    "Arithmetic expressions in SELECT (+, -, *, /)",
    "String functions: UPPER, LOWER, LENGTH, TRIM, CONCAT / ||",
    "Numeric functions: ROUND, FLOOR, CEIL, ABS",
    "Date functions: YEAR, MONTH, DAY, DATE_DIFF, NOW / CURRENT_DATE",
    "CASE … WHEN … THEN … ELSE … END in SELECT",
    "COALESCE to replace NULL values",
  ],
  2: [
    "INNER JOIN between two tables",
    "LEFT JOIN and NULL values in the right table",
    "RIGHT JOIN",
    "FULL OUTER JOIN (or UNION of LEFT and RIGHT JOIN equivalent)",
    "Joining three or more tables (chained JOINs)",
    "Self-join on the same table",
    "Subquery in WHERE with IN",
    "Subquery in WHERE with NOT IN",
    "Subquery in WHERE with EXISTS",
    "Subquery in WHERE with NOT EXISTS",
    "Correlated subquery (referencing the outer table)",
    "Scalar subquery used in SELECT or as a value",
    "Simple CTE (WITH name AS (…) SELECT …)",
    "CTE used in a join",
    "Multiple CTEs in one query (WITH a AS (…), b AS (…))",
    "Recursive CTE (WITH RECURSIVE … UNION ALL)",
    "UNION to combine two results without duplicates",
    "UNION ALL to keep duplicates",
    "INTERSECT for the intersection of two results",
    "EXCEPT (or MINUS) for the difference between two results",
  ],
  3: [
    "INSERT INTO … VALUES to insert a single row",
    "INSERT INTO … VALUES to insert multiple rows at once",
    "INSERT INTO … SELECT to copy data from another table",
    "UPDATE … SET … WHERE to modify targeted rows",
    "UPDATE modifying multiple columns at once",
    "UPDATE with a subquery in SET or WHERE",
    "DELETE FROM … WHERE to delete targeted rows",
    "DELETE with a subquery in WHERE",
    "TRUNCATE TABLE and difference from DELETE without WHERE",
    "CREATE TABLE with PRIMARY KEY",
    "CREATE TABLE with NOT NULL and DEFAULT",
    "CREATE TABLE with UNIQUE and CHECK",
    "CREATE TABLE … AS SELECT to create a table from a query",
    "CREATE TEMPORARY TABLE",
    "ALTER TABLE ADD COLUMN",
    "ALTER TABLE DROP COLUMN",
    "ALTER TABLE MODIFY / ALTER COLUMN to change the type",
    "DROP TABLE and IF EXISTS",
  ],
  4: [
    "Simple CREATE VIEW based on a basic SELECT",
    "CREATE VIEW with a join between two tables",
    "CREATE VIEW with aggregation and GROUP BY",
    "CREATE VIEW with a WHERE filter",
    "CREATE VIEW incorporating a subquery",
    "CREATE VIEW based on a CTE (WITH … AS)",
    "CREATE OR REPLACE VIEW to replace an existing view",
    "Using a view in a SELECT query",
    "Joining a view with a table",
    "DROP VIEW and DROP VIEW IF EXISTS",
    "Updatable view concept (view on a single table without GROUP BY or DISTINCT)",
    "View with column aliases",
  ],
};

const QCU_QCM_STYLES_EN = [
  "What is the output (result) of this SQL query?",
  "Which of these SQL queries is syntactically correct and produces the expected result?",
  "Which of these queries contains an error (syntax or logic)?",
  "Which SQL query allows you to obtain the described result?",
  "What exactly does this clause / this part of the query do?",
  "Among these queries, which one is equivalent to the given query?",
  "In what order must the clauses be written for the query to be valid?",
  "What is the effect of adding / removing this clause on the result?",
];

const THEMES_EN = [
  "employees / departments / salaries",
  "products / orders / customers",
  "students / courses / enrollments",
  "books / authors / libraries",
  "doctors / patients / consultations",
  "movies / actors / directors",
  "flights / passengers / airports",
  "projects / developers / teams",
  "restaurants / menus / reservations",
  "real estate / apartments / owners",
  "events / participants / tickets",
  "sports teams / matches / scores",
  "banks / bank accounts / transactions",
  "suppliers / materials / construction sites",
  "animals / shelters / adoptions",
];

// ── Exam plan ─────────────────────────────────────────────────────────────────

// Exam plan: 20 questions distributed across parts and types
// Mirrors the real ENI exam ratio (~75% QCU/QCM, ~25% practical)
const EXAM_PLAN: Array<{ part: CertPart; type: CertQuestionType }> = [
  { part: 1, type: "qcu" },
  { part: 1, type: "qcu" },
  { part: 1, type: "qcm" },
  { part: 1, type: "qcm" },
  { part: 1, type: "practical" },
  { part: 2, type: "qcu" },
  { part: 2, type: "qcu" },
  { part: 2, type: "qcm" },
  { part: 2, type: "qcm" },
  { part: 2, type: "practical" },
  { part: 3, type: "qcu" },
  { part: 3, type: "qcu" },
  { part: 3, type: "qcm" },
  { part: 3, type: "qcm" },
  { part: 3, type: "practical" },
  { part: 4, type: "qcu" },
  { part: 4, type: "qcu" },
  { part: 4, type: "qcm" },
  { part: 4, type: "practical" },
  { part: 4, type: "practical" },
];

// Cost estimate based on claude-haiku-4-5 pricing:
// Input: $0.80/MTok × 20q × ~900 tok ≈ $0.014
// Output: $4/MTok   × 20q × ~600 tok ≈ $0.048
// Total: ~$0.06 per exam generation
export const EXAM_COST_ESTIMATE = { usd: 0.06, eur: 0.055 };

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildSystemPrompt(part: CertPart, type: CertQuestionType, lang: Lang): string {
  if (lang === 'fr') {
    return buildSystemPromptFR(part, type);
  }
  return buildSystemPromptEN(part, type);
}

function buildSystemPromptFR(part: CertPart, type: CertQuestionType): string {
  const theme = pickRandom(THEMES_FR);
  const concept = pickRandom(PART_CONCEPTS_FR[part]);
  const typeLabel =
    type === "qcu"
      ? "QCU (une seule bonne réponse, boutons ronds)"
      : type === "qcm"
        ? "QCM (plusieurs bonnes réponses possibles, cases à cocher)"
        : "Cas pratique (l'utilisateur écrit une requête SQL)";

  const styleHint =
    type !== "practical"
      ? `\nSTYLE DE LA QUESTION : ${pickRandom(QCU_QCM_STYLES_FR)}`
      : "";

  return `Tu es un générateur de questions pour l'examen de certification ENI SQL.

PARTIE CONCERNÉE : Partie ${part} — ${PART_DESCRIPTIONS_FR[part]}
TYPE DE QUESTION : ${typeLabel}${styleHint}
THÈME DES DONNÉES : ${theme}
CONCEPT SQL CIBLÉ : ${concept}

La question DOIT porter spécifiquement sur le concept ciblé. N'utilise pas un concept différent même s'il est plus simple. Le thème des données sert uniquement de contexte narratif.

Génère UNE SEULE question d'examen au format JSON strict, sans markdown, sans commentaires.
Le JSON doit respecter EXACTEMENT ce schéma selon le type :

Pour QCU ou QCM :
{
  "part": ${part},
  "type": "${type}",
  "context": "<paragraphe de contexte optionnel décrivant le schéma ou le scénario, ou chaîne vide>",
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
- Pour les QCU/QCM sur du code SQL : les choix incorrects doivent représenter des erreurs courantes et plausibles (ne pas mettre des choix manifestement faux).
- Pour les cas pratiques : schemaSQL ne doit PAS contenir de FOREIGN KEY ni d'ALTER TABLE ; utilise uniquement CREATE TABLE + INSERT INTO.
- correctAnswers pour QCU : exactement un label. Pour QCM : deux ou trois labels.
- Retourne UNIQUEMENT le JSON, sans aucun texte autour.`;
}

function buildSystemPromptEN(part: CertPart, type: CertQuestionType): string {
  const theme = pickRandom(THEMES_EN);
  const concept = pickRandom(PART_CONCEPTS_EN[part]);
  const typeLabel =
    type === "qcu"
      ? "MCQ – single correct answer (radio buttons)"
      : type === "qcm"
        ? "MCQ – multiple correct answers possible (checkboxes)"
        : "Practical case (the user writes a SQL query)";

  const styleHint =
    type !== "practical"
      ? `\nQUESTION STYLE: ${pickRandom(QCU_QCM_STYLES_EN)}`
      : "";

  return `You are a question generator for the ENI SQL certification exam.

PART: Part ${part} — ${PART_DESCRIPTIONS_EN[part]}
QUESTION TYPE: ${typeLabel}${styleHint}
DATA THEME: ${theme}
TARGET SQL CONCEPT: ${concept}

The question MUST focus specifically on the targeted concept. Do not use a different concept even if it is simpler. The data theme serves only as narrative context.

Generate EXACTLY ONE exam question as strict JSON, without markdown, without comments.
The JSON must follow EXACTLY this schema depending on the type:

For MCQ (single or multiple):
{
  "part": ${part},
  "type": "${type}",
  "context": "<optional context paragraph describing the schema or scenario, or empty string>",
  "questionText": "<question text>",
  "choices": [
    { "label": "A", "text": "<choice A — may contain SQL on multiple lines>" },
    { "label": "B", "text": "<choice B>" },
    { "label": "C", "text": "<choice C>" },
    { "label": "D", "text": "<choice D>" }
  ],
  "correctAnswers": ["B"],
  "explanation": "<educational explanation of the correct answer>"
}

For a practical case:
{
  "part": ${part},
  "type": "practical",
  "context": "<context describing the scenario>",
  "questionText": "<precise instruction of what the user must write>",
  "schemaSQL": "<CREATE TABLE and INSERT INTO statements for 2-3 tables with 5-10 rows each, without FOREIGN KEY constraints>",
  "correctSQL": "<correct and complete SQL query>",
  "explanation": "<educational explanation of the solution>"
}

IMPORTANT RULES:
- Data must be anonymous (fictional names) and varied.
- For MCQ on SQL code: incorrect choices must represent common and plausible mistakes (do not include obviously wrong choices).
- For practical cases: schemaSQL must NOT contain FOREIGN KEY or ALTER TABLE; use only CREATE TABLE + INSERT INTO.
- correctAnswers for single MCQ: exactly one label. For multiple MCQ: two or three labels.
- Return ONLY the JSON, with no surrounding text.`;
}

export async function generateCertQuestion(
  apiKey: string,
  part: CertPart,
  type: CertQuestionType,
  lang: Lang = 'fr',
): Promise<CertQuestion> {
  const client = new Anthropic({ apiKey });

  const userMessage = lang === 'fr' ? "Génère la question." : "Generate the question.";

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: buildSystemPrompt(part, type, lang),
    messages: [{ role: "user", content: userMessage }],
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

async function generateCertQuestionWithRetry(
  apiKey: string,
  part: CertPart,
  type: CertQuestionType,
  lang: Lang,
  maxAttempts = 2,
): Promise<CertQuestion> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateCertQuestion(apiKey, part, type, lang);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function generateExam(apiKey: string, lang: Lang = 'fr'): Promise<CertQuestion[]> {
  // Questions follow the defined order: 5×P1, 5×P2, 5×P3, 5×P4
  // Generate in batches of 5 to stay within the 50 req/min rate limit
  const BATCH_SIZE = 5;
  const results: CertQuestion[] = [];

  for (let i = 0; i < EXAM_PLAN.length; i += BATCH_SIZE) {
    const batch = EXAM_PLAN.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(({ part, type }) =>
        generateCertQuestionWithRetry(apiKey, part, type, lang),
      ),
    );
    results.push(...batchResults);

    // Brief pause between batches to stay well under 50 req/min
    if (i + BATCH_SIZE < EXAM_PLAN.length) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  return results;
}

// server/cert.ts — ENI SQL certification question generator

import Anthropic from "@anthropic-ai/sdk";
import type { CertPart, CertQuestion, CertQuestionType } from "../src/types.js";

const PART_DESCRIPTIONS: Record<CertPart, string> = {
  1: "Requêtes simples : SELECT, FROM, WHERE (AND/OR/NOT/IN/BETWEEN/LIKE/IS NULL), ORDER BY, LIMIT, GROUP BY, HAVING, fonctions d'agrégation (COUNT, SUM, AVG, MIN, MAX), DISTINCT, alias (AS), fonctions scalaires (UPPER, LOWER, LENGTH, CONCAT, ROUND, YEAR, MONTH…).",
  2: "Requêtes complexes : INNER JOIN, LEFT JOIN, RIGHT JOIN, jointures multiples (3+ tables), auto-jointure, sous-requêtes simples et corrélées (IN, NOT IN, EXISTS, NOT EXISTS, sous-requête scalaire), CTE (WITH … AS) simples et imbriquées, UNION, UNION ALL, INTERSECT, EXCEPT.",
  3: "Mise à jour des données : INSERT INTO … VALUES, INSERT INTO … SELECT, UPDATE … SET … WHERE, DELETE FROM … WHERE, TRUNCATE TABLE, CREATE TABLE avec contraintes (PRIMARY KEY, NOT NULL, UNIQUE, DEFAULT), CREATE TABLE … AS SELECT, CREATE TEMPORARY TABLE, ALTER TABLE (ADD/DROP/MODIFY COLUMN), DROP TABLE.",
  4: "Enregistrement de vues : CREATE VIEW … AS SELECT, CREATE OR REPLACE VIEW, vues avec jointures, vues avec agrégations et GROUP BY, vues avec sous-requêtes ou CTE, utilisation d'une vue dans une autre requête, DROP VIEW, notion de vue modifiable.",
};

// Fine-grained SQL concepts per part — one is randomly picked to focus each question
const PART_CONCEPTS: Record<CertPart, string[]> = {
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
    "séquence de transactions : BEGIN, COMMIT, ROLLBACK",
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

// Question styles for QCU/QCM — adds variety beyond just "what is the output"
const QCU_QCM_STYLES = [
  "Quelle est la sortie (résultat) de cette requête SQL ?",
  "Laquelle de ces requêtes SQL est syntaxiquement correcte et produit le résultat attendu ?",
  "Laquelle de ces requêtes contient une erreur (syntaxe ou logique) ?",
  "Quelle requête SQL permet d'obtenir le résultat décrit ?",
  "Que fait exactement cette clause / cette partie de la requête ?",
  "Parmi ces requêtes, laquelle est équivalente à la requête donnée ?",
  "Dans quel ordre les clauses doivent-elles être écrites pour que la requête soit valide ?",
  "Quel est l'effet de l'ajout / de la suppression de cette clause sur le résultat ?",
];

const THEMES = [
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

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildSystemPrompt(part: CertPart, type: CertQuestionType): string {
  const theme = pickRandom(THEMES);
  const concept = pickRandom(PART_CONCEPTS[part]);
  const typeLabel =
    type === "qcu"
      ? "QCU (une seule bonne réponse, boutons ronds)"
      : type === "qcm"
        ? "QCM (plusieurs bonnes réponses possibles, cases à cocher)"
        : "Cas pratique (l'utilisateur écrit une requête SQL)";

  const styleHint =
    type !== "practical"
      ? `\nSTYLE DE LA QUESTION : ${pickRandom(QCU_QCM_STYLES)}`
      : "";

  return `Tu es un générateur de questions pour l'examen de certification ENI SQL.

PARTIE CONCERNÉE : Partie ${part} — ${PART_DESCRIPTIONS[part]}
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

#!/usr/bin/env node

/**
 * Production i18n coverage gate.
 *
 * This deliberately scans the current production source, rather than only
 * added diff lines. It is a lightweight source check (not a replacement for
 * a parser), aimed at catching human-readable English in JSX and common
 * user-facing props while ignoring tests, labs, fixtures, technical values,
 * comments, and data supplied by the API.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const productionRoot = "ui/src";
const excludedDirectory = /(?:^|\/)(?:__tests__|fixtures|fixture|test-fixtures|ux-labs?|labs?|storybook|stories)(?:\/|$)/i;
const excludedFile = /(?:^|\/)(?:[^/]*(?:\.(?:test|spec|fixture|fixtures)|(?:^|[-_.])fixtures?)(?:\.[^/]*)?)\.[jt]sx?$/i;
const excludedBasename = new Set(["locales.ts", "locale-validation.ts", "test.tsx", "spec.tsx"]);
const userFacingProps = /(?:label|title|description|message|action|placeholder|emptyMessage|aria-label|alt|subtitle|hint|heading|eyebrow|caption)/i;
const technicalLiteral = /^(?:asc|desc|top|recent|alphabetical|name|updated|created|targetDate|budget|pause|resume|left|joined|success|error|warning|info|none|Paperclip|GitHub|OpenAI|API|URL|JSON|HTTP|HTTPS|OAuth|UUID|PGlite|CSS|HTML|SVG|CLI|SDK|MCP)$/;

function isProductionFile(file) {
  return file.startsWith(`${productionRoot}/`) &&
    /\.(?:tsx?|jsx?)$/.test(file) &&
    !excludedDirectory.test(file) &&
    !excludedFile.test(file) &&
    !excludedBasename.has(path.basename(file));
}

function isVisibleLiteral(value) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!/[A-Za-z]/.test(normalized)) return false;
  if (technicalLiteral.test(normalized)) return false;
  if (/^(?:[a-z][\w-]*)(?:\.[a-z][\w-]*)+$/.test(normalized)) return false;
  if (/^(?:https?:\/\/|\/|#|--|[A-Z_][A-Z0-9_]*)/.test(normalized)) return false;
  return true;
}

function extractCandidates(source) {
  const candidates = [];
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match) => "\n".repeat((match.match(/\n/g) ?? []).length));
  const add = (value, offset) => {
    if (isVisibleLiteral(value)) candidates.push({ value, offset });
  };

  // JSX text is visible unless it is an expression or markup boundary.
  for (const match of withoutComments.matchAll(/(?:>|})\s*([^<>{}]*[A-Za-z][^<>{}]*)\s*(?:<|{)/g)) {
    add(match[1], match.index ?? 0);
  }

  // Inspect each user-facing prop independently. This preserves adjacent
  // literals in expressions such as title={t("key") + " (draft)"}.
  const propPattern = new RegExp(
    `\\b${userFacingProps.source}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([\\s\\S]*?)\\})`,
    "gi",
  );
  for (const match of withoutComments.matchAll(propPattern)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    const valueOffset = (match.index ?? 0) + match[0].indexOf(value);
    if (match[1] !== undefined || match[2] !== undefined) {
      add(value, valueOffset);
      continue;
    }
    const staticExpression = value.replace(/\bt\s*\([\s\S]*?\)\s*/gi, "");
    for (const literal of staticExpression.matchAll(/(["'`])((?:\\.|[\s\S])*?)\1/g)) {
      add(literal[2], valueOffset + (literal.index ?? 0) + 1);
    }
  }

  return candidates;
}

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
    if (entry.isDirectory()) {
      if (!excludedDirectory.test(relative + "/")) files.push(...walk(absolute));
    }
    else if (/\.(?:tsx?|jsx?)$/.test(entry.name) && isProductionFile(relative)) files.push(relative);
  }
  return files;
}

const violations = [];
for (const file of walk(path.join(root, productionRoot))) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const lines = source.split("\n");
  for (const candidate of extractCandidates(source)) {
    const line = source.slice(0, candidate.offset).split("\n").length;
    violations.push(`${file}:${line}: ${lines[line - 1].trim()}`);
  }
}

if (violations.length) {
  console.error("Production UI literals require an i18n key or an explicit allowlist entry:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("i18n production coverage check passed");

/**
 * .docx → structured vocab/grammar candidates.
 *
 * Block-based parser. The source document doesn't use Word styles, so we rely on:
 *   1. Blank lines as soft section separators (every topic block is delimited by ≥1 blank line).
 *   2. Headers detected by content (short, no "=", title-cased; e.g. "Adjectives", "Spanish Idioms").
 *   3. Per-block POS + topic inference for header-less blocks (e.g. an unlabeled
 *      block beginning with "Mother = madre / Father = padre / ..." infers POS=noun,
 *      topic=Family from a keyword dictionary).
 *
 * Algorithm:
 *   - Split input into blocks (split on blank line).
 *   - For each block:
 *       * If first non-empty line is a header → set current header, parse remaining lines as entries.
 *       * Else → infer topic + POS from the block's content; entries inherit those.
 *   - Idiom sections are detected by header keyword and parsed Spanish-first.
 */

import mammoth from "mammoth";
import type { Pos, Difficulty } from "@/types/database";

export interface ParsedVocab {
  lemma: string;            // Spanish word/phrase (canonical form)
  translation: string;      // English meaning
  pos: Pos;
  example_es?: string;
  example_en?: string;
  notes?: string;
  difficulty?: Difficulty;
  topic_slug: string;
  topic_name: string;
  is_irregular?: boolean;
}

export interface ParsedGrammar {
  title: string;
  category: string;
  explanation_md: string;
  examples: { es: string; en: string }[];
  topic_slug: string;
  topic_name: string;
}

export interface ParseResult {
  vocab: ParsedVocab[];
  grammar: ParsedGrammar[];
  topics: { slug: string; name: string }[];
  rawText: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Header → POS mapping
// ---------------------------------------------------------------------------
const HEADER_POS_MAP: Array<{ test: RegExp; pos: Pos }> = [
  { test: /\b(verbs?|conjugations?)\b/i,                    pos: "verb" },
  { test: /\bprepositions?\b/i,                             pos: "preposition" },
  { test: /\bconjunctions?\b/i,                             pos: "conjunction" },
  { test: /\badjectives?\b/i,                               pos: "adjective" },
  { test: /\badverbs?\b/i,                                  pos: "adverb" },
  { test: /\bpronouns?\b/i,                                 pos: "pronoun" },
  { test: /\barticles?\b/i,                                 pos: "article" },
  { test: /\bidioms?\b|\bexpressions?\b/i,                  pos: "phrase" },
  { test: /\bnumbers?\b/i,                                  pos: "number" },
  { test: /\binterjections?\b/i,                            pos: "interjection" },
  { test: /\bdescription\b|\bpersonality\b|\bcharacter\b/i, pos: "adjective" },
];

// Topic keyword dictionary (English heads) → Topic name
const TOPIC_KEYWORDS: Array<{ words: string[]; topic: string; pos?: Pos }> = [
  { words: ["mother","father","brother","sister","son","daughter","husband","wife","grandmother","grandfather","uncle","aunt","cousin","nephew","niece"], topic: "Family", pos: "noun" },
  { words: ["t-shirt","pants","dress","shirt","skirt","jacket","sweater","shorts","blouse","coat","jeans","suit","tie","scarf","hat","gloves","socks"], topic: "Clothing", pos: "noun" },
  { words: ["work","job","career","employment","occupation","profession","workplace","office","company","corporation"], topic: "Work", pos: "noun" },
  { words: ["dog","cat","bird","fish","elephant","lion","tiger","bear","giraffe","monkey","horse","cow","pig","rabbit"], topic: "Animals", pos: "noun" },
  { words: ["happy","sad","angry","excited","nervous","calm","surprised","afraid","worried","jealous","embarrassed"], topic: "Emotions", pos: "adjective" },
  { words: ["social media","facebook","twitter","instagram","linkedin","snapchat","tiktok","whatsapp"], topic: "Social Media", pos: "noun" },
  { words: ["entertainment","movie","film","television","series","show","drama","comedy","music","concert","theatre"], topic: "Entertainment", pos: "noun" },
  { words: ["geography","continent","country","state","region","city","town","village","mountain","river","ocean"], topic: "Geography", pos: "noun" },
  { words: ["red","blue","green","yellow","orange","purple","pink","brown","black","white","grey"], topic: "Colors", pos: "adjective" },
  { words: ["car","bus","train","bicycle","motorcycle","taxi","plane","ship","boat","truck","scooter"], topic: "Transport", pos: "noun" },
  { words: ["chair","table","sofa","bed","wardrobe","desk","dresser","bookshelf","ottoman","stool"], topic: "Furniture", pos: "noun" },
  { words: ["head","hair","face","eye","nose","mouth","ear","neck","shoulder","arm","leg","foot","hand","stomach"], topic: "Body", pos: "noun" },
  { words: ["sunny","cloudy","rainy","snowy","windy","stormy","foggy","hazy","overcast","humid"], topic: "Weather", pos: "adjective" },
  { words: ["time","hour","minute","second","day","week","month","year","yesterday","tomorrow","tonight"], topic: "Time", pos: "noun" },
  { words: ["teacher","doctor","engineer","nurse","lawyer","police officer","chef","scientist","architect","accountant","flight attendant"], topic: "Professions", pos: "noun" },
  { words: ["mathematics","science","english","arabic","history","geography","physics","chemistry","biology","computer science"], topic: "School Subjects", pos: "noun" },
  { words: ["tree","fence","pole","traffic lights","grass","sky","road","bench","sidewalk","streetlight"], topic: "Outdoor Objects", pos: "noun" },
  { words: ["illness","disease","sickness","symptoms","fever","cough","cold","flu","headache","allergy"], topic: "Health", pos: "noun" },
  { words: ["park","library","hospital","museum","school","stadium","restaurant","bank","mall"], topic: "Places", pos: "noun" },
  { words: ["football","basketball","tennis","baseball","soccer","golf","swimming","ice hockey","martial arts"], topic: "Sports", pos: "noun" },
  { words: ["dining table","coffee table","dressing table","shoe rack","wardrobe","chest of drawers"], topic: "Furniture", pos: "noun" },
  { words: ["air conditioner","coffee maker","microwave","refrigerator","washing machine","dishwasher","oven","blender","toaster"], topic: "Appliances", pos: "noun" },
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const cleanText = (s: string) => s.replace(/\s+/g, " ").trim();
const stripEnglishPrefix = (s: string) => s.replace(/^to\s+/i, "").trim();

const isLikelyHeader = (line: string) => {
  const t = cleanText(line);
  if (!t) return false;
  if (t.includes("=")) return false;
  if (t.length > 80) return false;
  const stripped = t.replace(/\s*\(.+\)\s*$/, "");
  if (!stripped) return false;
  if (/[.;:!?]$/.test(stripped)) return false;
  return true;
};

const detectPosFromHeader = (header: string): Pos | null => {
  for (const { test, pos } of HEADER_POS_MAP) if (test.test(header)) return pos;
  return null;
};

const isIdiomHeader = (header: string) =>
  /\bidioms?\b|\bexpressions?\b/i.test(header);

const splitEntry = (line: string): { left: string; right: string } | null => {
  const m = line.match(/^([^=]+?)\s*=\s*(.+)$/);
  if (!m) return null;
  return { left: cleanText(m[1]), right: cleanText(m[2]) };
};

// Score a block's English heads against the topic dictionary.
// Returns the best-matching {topic, pos} or null if no strong signal.
const inferBlockTopic = (englishHeads: string[]): { topic: string; pos: Pos } | null => {
  if (englishHeads.length < 2) return null;
  const lower = englishHeads.map((s) => s.toLowerCase());
  let bestTopic: string | null = null;
  let bestPos: Pos | null = null;
  let bestScore = 0;
  for (const { words, topic, pos } of TOPIC_KEYWORDS) {
    const score = lower.filter((w) => words.some((kw) => w === kw || w.startsWith(kw + " ") || w === kw + "s")).length;
    // require at least 2 matches AND ≥30% of the block to be confident
    if (score >= 2 && score / lower.length >= 0.25 && score > bestScore) {
      bestScore = score;
      bestTopic = topic;
      bestPos = pos ?? "noun";
    }
  }
  if (!bestTopic) return null;
  return { topic: bestTopic, pos: bestPos! };
};

// Adverb-y words usually end in -ly (English) or -mente (Spanish). Detect.
const looksAdverbial = (englishWord: string, spanishWord: string) =>
  /ly$/i.test(englishWord.trim()) || /mente$/i.test(spanishWord.trim());

const looksLikeVerb = (englishWord: string) => /^to\s+/i.test(englishWord.trim());

// ---------------------------------------------------------------------------
// Block-based parser
// ---------------------------------------------------------------------------
export async function parseDocxBuffer(buffer: ArrayBuffer): Promise<ParseResult> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return parseRawText(result.value);
}

export function parseRawText(rawText: string): ParseResult {
  const warnings: string[] = [];
  const vocab: ParsedVocab[] = [];
  const grammar: ParsedGrammar[] = [];
  const topicMap = new Map<string, { slug: string; name: string }>();

  // Normalize line endings, then split into blocks on ≥1 blank line.
  const allLines = rawText.split(/\r?\n/).map((l) => l.replace(/\u00a0/g, " ").trim());
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of allLines) {
    if (!line) {
      if (current.length) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);

  // Track an "ambient" header when a block consists of *only* a header line.
  // Following blocks inherit the ambient POS unless they have their own header
  // OR a topic inference overrides it.
  let ambientHeader: { name: string; pos: Pos; isIdioms: boolean } | null = null;

  for (const block of blocks) {
    // Case 1: lone header block ("Adjectives" on a line by itself).
    if (block.length === 1 && isLikelyHeader(block[0])) {
      const headerName = cleanText(block[0].replace(/\s*\(.+\)\s*$/, ""));
      const pos = detectPosFromHeader(block[0]) ?? "noun";
      ambientHeader = { name: headerName, pos, isIdioms: isIdiomHeader(block[0]) };
      const slug = slugify(headerName);
      topicMap.set(slug, { slug, name: headerName });
      continue;
    }

    // Case 2: block has a header line at the top followed by entries.
    let headerForBlock: { name: string; pos: Pos; isIdioms: boolean } | null = null;
    let entryLines = block;
    if (isLikelyHeader(block[0]) && block.length > 1) {
      const headerName = cleanText(block[0].replace(/\s*\(.+\)\s*$/, ""));
      const pos = detectPosFromHeader(block[0]) ?? "noun";
      headerForBlock = { name: headerName, pos, isIdioms: isIdiomHeader(block[0]) };
      ambientHeader = headerForBlock;
      const slug = slugify(headerName);
      topicMap.set(slug, { slug, name: headerName });
      entryLines = block.slice(1);
    }

    // Parse entry lines; collect English heads for topic inference.
    interface Pending {
      lemma: string;
      translation: string;
      english: string;
      spanish: string;
      contextNote?: string;
      alts: string[];
    }
    const pending: Pending[] = [];
    for (const line of entryLines) {
      const split = splitEntry(line);
      if (!split) continue;
      pending.push({
        lemma: "",
        translation: "",
        english: split.left,
        spanish: split.right,
        alts: [],
      });
    }
    if (pending.length === 0) continue;

    // Decide which header context applies to THIS block.
    let blockHeader = headerForBlock ?? ambientHeader;
    const englishHeads = pending.map((p) => p.english.toLowerCase());

    // If we don't have a header at all, OR the block's content doesn't match the
    // ambient POS at all, try topic inference.
    const inferred = inferBlockTopic(englishHeads);

    let useInferred = false;
    if (!blockHeader) {
      // No header — must use inference (or fall back to "Uncategorized").
      useInferred = !!inferred;
    } else if (inferred && inferred.topic !== blockHeader.name) {
      // We have a header, but inference suggests otherwise. Override only when
      // the inferred topic is a strong match AND the block's content looks
      // inconsistent with the ambient POS.
      const ambientPos = blockHeader.pos;
      let mismatchCount = 0;
      for (const p of pending) {
        if (ambientPos === "verb" && !looksLikeVerb(p.english)) mismatchCount++;
        else if (ambientPos === "adverb" && !looksAdverbial(p.english, p.spanish)) mismatchCount++;
      }
      const mismatchRatio = mismatchCount / pending.length;
      if (mismatchRatio > 0.6 || (ambientPos === "noun" && inferred.topic !== blockHeader.name && pending.length >= 4)) {
        useInferred = true;
      }
    }

    let sectionName: string;
    let sectionPos: Pos;
    let sectionIsIdioms = false;

    if (useInferred && inferred) {
      sectionName = inferred.topic;
      sectionPos = inferred.pos;
    } else if (blockHeader) {
      sectionName = blockHeader.name;
      sectionPos = blockHeader.pos;
      sectionIsIdioms = blockHeader.isIdioms;
    } else {
      sectionName = "Uncategorized";
      sectionPos = "noun";
    }

    const slug = slugify(sectionName);
    if (!topicMap.has(slug)) topicMap.set(slug, { slug, name: sectionName });

    for (const p of pending) {
      let lemma: string;
      let translation: string;

      if (sectionIsIdioms) {
        lemma = p.english; // Spanish phrase
        translation = p.spanish; // English meaning
      } else {
        const forms = p.spanish.split(/\s*\/\s*/).map(cleanText).filter(Boolean);
        lemma = forms[0];
        translation = stripEnglishPrefix(p.english);

        // Strip parenthetical context from canonical lemma → fold into translation.
        const m = lemma.match(/^([^()]+?)\s*(\(([^)]+)\))?\s*$/);
        if (m) {
          lemma = cleanText(m[1]);
          if (m[3]) translation += ` (${cleanText(m[3])})`;
        }

        // Add synonym entries for additional Spanish forms.
        for (let i = 1; i < forms.length; i++) {
          const altRaw = forms[i];
          const mAlt = altRaw.match(/^([^()]+?)\s*(\(([^)]+)\))?\s*$/);
          if (!mAlt) continue;
          const altLemma = cleanText(mAlt[1]);
          if (!altLemma || altLemma === lemma) continue;
          vocab.push({
            lemma: altLemma,
            translation,
            pos: sectionPos,
            topic_slug: slug,
            topic_name: sectionName,
            notes: mAlt[3]
              ? `Alt of "${lemma}" — ${cleanText(mAlt[3])}`
              : `Synonym of "${lemma}"`,
          });
        }
      }

      if (!lemma || !translation) {
        warnings.push(`Skipped malformed: "${p.english} = ${p.spanish}"`);
        continue;
      }

      vocab.push({
        lemma,
        translation,
        pos: sectionPos,
        topic_slug: slug,
        topic_name: sectionName,
      });
    }
  }

  // Deduplicate vocab on (lemma_lower, pos) — keep first occurrence.
  const seen = new Set<string>();
  const dedupedVocab = vocab.filter((v) => {
    const key = `${v.lemma.toLowerCase()}::${v.pos}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    vocab: dedupedVocab,
    grammar,
    topics: Array.from(topicMap.values()),
    rawText,
    warnings,
  };
}

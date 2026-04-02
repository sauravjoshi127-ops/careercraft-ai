'use strict';

// Common English stop words to filter from keyword extraction
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'shall','can','this','that','these','those','i','we','you','he','she',
  'it','they','me','us','him','her','them','my','our','your','his','its',
  'their','who','what','which','when','where','how','all','each','both',
  'few','more','most','other','some','such','no','not','only','same','so',
  'than','too','very','just','also','as','if','into','about','up','out',
  'any','through','during','before','after','above','below','between',
  'while','however','therefore','although','because','since','unless',
  'until','including','without','within','across','along','following',
  'behind','beyond','plus','except','down','off','near','per','via',
  'will','are','were','has','have','had','been','being','their','there',
  'then','than','when','would','could','should','your','much','many',
  'new','use','used','using','work','works','working','role','position',
  'job','team','company','looking','seeking','candidate','candidates',
  'apply','application','require','required','requirements','must','able',
  'ability','strong','good','great','excellent','well','highly','level',
  'years','year','experience','experienced','minimum','preferred','plus',
  'related','relevant','knowledge','skills','skill','understand','understanding'
]);

// Bigrams are weighted slightly lower than single keywords since they are
// more specific and may not appear verbatim in the letter.
const BIGRAM_WEIGHT = 0.8;

// ATS score constants: base ensures even a modest letter gets a sensible floor;
// the remaining range scales linearly with keyword coverage.
const ATS_BASE_SCORE = 40;
const ATS_SCALED_RANGE = 60;

// Ideal cover letter word-count window (too short = incomplete, too long = unfocused)
const MIN_OPTIMAL_WORD_COUNT = 150;
const MAX_OPTIMAL_WORD_COUNT = 700;

// Relevance score weights (must sum to 1.0)
const JOB_COVERAGE_WEIGHT = 0.45;
const HIGHLIGHTS_WEIGHT = 0.40;
const LENGTH_WEIGHT = 0.15;

/**
 * Tokenize text into cleaned, meaningful single words.
 * Uses a positive-match approach to avoid catastrophic backtracking.
 */
function tokenize(text) {
  // Match runs of alphanumeric chars and intra-word connectors (dot, hyphen)
  const tokens = text.toLowerCase().match(/[a-z0-9]+(?:[.-][a-z0-9]+)*/g) || [];
  return tokens.filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Extract the most important keywords from a job description.
 * Returns up to `count` keywords ordered by frequency.
 */
function extractKeywords(jobDescription, count = 20) {
  const tokens = tokenize(jobDescription);

  // Frequency of single words
  const freq = {};
  tokens.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

  // Capture common two-word tech phrases (e.g., "machine learning", "react native")
  const words = jobDescription.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    if (w1.length > 2 && w2.length > 2 && !STOP_WORDS.has(w1) && !STOP_WORDS.has(w2)) {
      const bigram = `${w1} ${w2}`;
      freq[bigram] = (freq[bigram] || 0) + BIGRAM_WEIGHT;
    }
  }

  return Object.entries(freq)
    .filter(([word]) => word.length > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word);
}

/**
 * Calculate ATS score: how many job-description keywords appear in the letter.
 * Returns score 0-100, plus lists of matched and missing keywords.
 */
function calculateAtsScore(letter, jobDescription) {
  const keywords = extractKeywords(jobDescription, 20);
  const letterLower = letter.toLowerCase();

  const matchedKeywords = [];
  const missingKeywords = [];

  keywords.forEach(kw => {
    if (letterLower.includes(kw)) {
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  });

  const matchRatio = keywords.length > 0 ? matchedKeywords.length / keywords.length : 0;
  const score = Math.min(100, Math.round(ATS_BASE_SCORE + matchRatio * ATS_SCALED_RANGE));

  return {
    score,
    matchedKeywords,
    missingKeywords,
    totalKeywords: keywords.length,
    matchCount: matchedKeywords.length
  };
}

/**
 * Calculate Relevance score: how well the letter covers the job requirements
 * and the candidate's own highlights.
 * Returns score 0-100 plus a details breakdown.
 */
function calculateRelevanceScore(letter, jobDescription, highlights) {
  const letterLower = letter.toLowerCase();
  const jobTokens = new Set(tokenize(jobDescription));
  const letterTokens = tokenize(letter);

  // 1. Job coverage: unique letter tokens that also appear in the JD
  const uniqueLetterTokens = new Set(letterTokens);
  let jobCoverageCount = 0;
  uniqueLetterTokens.forEach(t => { if (jobTokens.has(t)) jobCoverageCount++; });
  const jobCoverage = jobTokens.size > 0
    ? Math.min(1, jobCoverageCount / Math.min(jobTokens.size, uniqueLetterTokens.size || 1))
    : 0.5;

  // 2. Highlights coverage: how many highlight tokens appear in the letter
  let highlightCoverage = 0.7; // default when no highlights provided
  if (highlights && highlights.trim()) {
    const hlTokens = tokenize(highlights);
    if (hlTokens.length > 0) {
      const hlMatched = hlTokens.filter(t => letterLower.includes(t)).length;
      highlightCoverage = hlMatched / hlTokens.length;
    }
  }

  // 3. Letter length quality (150-700 words is the sweet spot for cover letters)
  const wordCount = letter.split(/\s+/).filter(Boolean).length;
  const lengthScore = wordCount >= MIN_OPTIMAL_WORD_COUNT && wordCount <= MAX_OPTIMAL_WORD_COUNT ? 1
    : wordCount < MIN_OPTIMAL_WORD_COUNT ? wordCount / MIN_OPTIMAL_WORD_COUNT
    : MAX_OPTIMAL_WORD_COUNT / wordCount;

  // Weighted average mapped to 50-100 range (a real letter always has at least some relevance)
  const rawScore = jobCoverage * JOB_COVERAGE_WEIGHT
    + highlightCoverage * HIGHLIGHTS_WEIGHT
    + lengthScore * LENGTH_WEIGHT;
  const score = Math.max(50, Math.min(100, Math.round(50 + rawScore * 50)));

  return {
    score,
    details: {
      jobCoverage: Math.round(jobCoverage * 100),
      highlightCoverage: Math.round(highlightCoverage * 100),
      wordCount,
      lengthScore: Math.round(lengthScore * 100)
    }
  };
}

module.exports = { extractKeywords, calculateAtsScore, calculateRelevanceScore };

import { addedLines, isInScope } from './diff-utils';
import { regexRule, type Rule } from './rule';

/** Length at which a base64-looking run of characters is considered a payload blob. */
const BASE64_BLOB_LENGTH = 120;
const BASE64_BLOB = new RegExp(`[A-Za-z0-9+/]{${BASE64_BLOB_LENGTH},}={0,2}`);
const HEX_ONLY = /^[0-9a-f]+={0,2}$/i;

export const OBFUSCATION_RULES: Rule[] = [
  regexRule({
    id: 'OBF-001',
    name: 'Base64 decoding',
    severity: 'warning',
    description: 'Decodes base64 at runtime. The decoded text can hide the commands that run.',
    pattern: /\bbase64\b[^\n]*\s(?:-d\b|--decode\b)|\bopenssl\b[^\n]*\b(?:enc|base64)\b[^\n]*\s-d\b/,
  }),
  regexRule({
    id: 'OBF-002',
    name: 'Eval of dynamic strings',
    severity: 'warning',
    description: 'Evaluates dynamically built strings. Static review cannot follow these strings.',
    // `eval "depends+=(…)"` is a packaging idiom for option-dependent arrays and
    // `--eval` flags belong to interpreters, so neither counts as dynamic eval.
    pattern: /(?<![-\w])eval\b(?!\s*"?\s*(?:make|check|opt)?depends\+?=)/,
  }),
  regexRule({
    id: 'OBF-003',
    name: 'Hex-encoded payload',
    severity: 'warning',
    description: 'Contains a long run of hex escapes, a common way to embed a payload.',
    pattern: /(?:\\x[0-9a-fA-F]{2}){4,}/,
  }),
  regexRule({
    id: 'OBF-004',
    name: 'Obfuscated command',
    severity: 'critical',
    description:
      "Uses IFS variable or ANSI-C escape tricks to disguise command names (e.g. su$'\\x64'o, cat ${IFS}/etc/shadow). Disguised command names are never benign; other rules additionally match the deobfuscated line.",
    pattern: /\$\{IFS|\$'\\x/,
    rawOnly: true,
  }),
  regexRule({
    id: 'CAUR-DOC-AS-SCRIPT',
    name: 'Documentation file executed as a script',
    severity: 'critical',
    description:
      'Executes or makes executable a file with a documentation extension (.md, .txt, ...). This is a known trick to smuggle scripts past review, since documentation files are exempt from several checks.',
    pattern:
      // Shell invoked on a doc file, e.g. `sh evil.md`.
      new RegExp(
        [
          /\b(?:ba|z|da|k)?sh\s+\S+\.(?:md|txt|rst|adoc|html)\b/.source,
          // `source` of a true doc format (.txt is a legit config-sourcing idiom).
          /(?<!\w+\s)source\s+['"]?[^'";\s]+\.(?:md|rst|adoc)\b/.source,
          // POSIX dot-source of a doc file, e.g. `. evil.txt`.
          /\.\s+(?!['"])[^'";\s]+\.(?:md|txt|rst)\b/.source,
          // Direct execution of a doc file, e.g. `./docs.md` at a command position,
          // or `exec ./install.md`.
          /(?:^|[;&|()])\s*\.\/[^'"\s]+\.(?:md|txt|rst|adoc|html)\b|\bexec\s+\.\/[^'"\s]+\.(?:md|txt|rst|adoc|html)\b/
            .source,
          // chmod with an explicit execute mode applied to a doc file.
          /\bchmod\s+[^\n]*\+x\b[^\n]*\.(?:md|txt|rst|adoc|html)\b/.source,
        ].join('|'),
      ),
    scopes: ['code'],
  }),
  {
    id: 'CAUR-BASE64-BLOB',
    name: 'Embedded base64 blob',
    severity: 'critical',
    description: `Contains an inline base64 blob of at least ${BASE64_BLOB_LENGTH} characters, typically an embedded binary payload.`,
    check(change) {
      if (!isInScope(change, ['code'])) return null;
      const hit = addedLines(change).find((line) => {
        const blob = line.text.match(BASE64_BLOB);
        return blob !== null && !HEX_ONLY.test(blob[0]);
      });
      return hit ? { line: hit.line, match: hit.text.trim() } : null;
    },
  },
  regexRule({
    id: 'UNI-001',
    name: 'Bidirectional text control character',
    severity: 'critical',
    description:
      'Contains Unicode bidirectional control characters (Trojan Source, CVE-2021-42574) that make reviewed code render differently from what the interpreter executes.',
    pattern: /[\u202A-\u202E\u2066-\u2069]/,
    scanComments: true,
  }),
  regexRule({
    id: 'UNI-002',
    name: 'Zero-width or invisible character',
    severity: 'critical',
    description:
      'Contains a zero-width or invisible Unicode character that can hide payload fragments from human review.',
    // ZWJ/ZWNJ (200C-200D) and bidi marks (200E-200F) are legitimate orthographic
    // characters in many scripts, so only truly invisible ones are flagged.
    pattern: /[\u200B\u2060\uFEFF]/,
    scanComments: true,
  }),
];

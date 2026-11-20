import { tokenizeDax, type DaxToken } from "../../dax/tokenize.js";

/**
 * `Tokenize()` for custom rules (custom rules spec, section 6.3): the tokens of a DAX expression
 * as Tabular Editor gives them to a rule, built over pbiplint's own DAX tokenizer. pbiplint's
 * tokenizer drops whitespace and comments; Tabular Editor keeps them as tokens, so they are made
 * here from the gaps between the tokens it reads.
 *
 * The type names are the ones Tabular Editor CLI 0.8.1.1 accepted in the pull request A probes
 * (`tests/rules/te-probes/semantics.json`): a rule that names one it refused fails there, and
 * fails here too. What the probes showed, and this follows:
 *
 * - Whitespace (`WHITESPACES`, one token per run) and comments (`SINGLE_LINE_COMMENT` for `//`
 *   and `--`, `DELIMITED_COMMENT` for a block) are tokens a rule can find.
 * - `Next` skips whitespace and comments: in `[Total Amount] / 2` the division's `Next` is the
 *   integer, not the space. The last token's `Next` is null.
 * - A string literal's `Text` is its content without the quotes. Every other token's `Text` is its
 *   source text (`[Total Amount]`, `'Order Lines'`).
 * - `[x]` is `COLUMN_OR_MEASURE`, a quoted table `TABLE`, an unquoted name `TABLE_OR_VARIABLE`,
 *   and keywords and function names have a type of their own (`VAR`, `RETURN`, `IN`, `SUM`,
 *   `DIVIDE`, `CALCULATE`, `BLANK`), matched without regard to case.
 *
 * Not captured, so pbiplint's choice: `==` is `EQ` like `=`; a character no DAX token starts with
 * has a type no rule can name.
 */
export interface TeDaxToken {
  /** The token's type name. */
  Type: string;
  /** Its text: a string literal's content, or else the source text. */
  Text: string;
  /** The next token that is neither whitespace nor a comment, or null. */
  Next: TeDaxToken | null;
}

/** Every keyword and function name the tokenizer gives a type of its own, upper-cased. */
const WORDS = [
  // Keywords of the query language and of expressions.
  "VAR",
  "RETURN",
  "IN",
  "DEFINE",
  "EVALUATE",
  "ORDER",
  "BY",
  "ASC",
  "DESC",
  "START",
  "AT",
  "MEASURE",
  "COLUMN",
  "NOT",
  "TRUE",
  "FALSE",
  "AND",
  "OR",
  // Functions, as Microsoft's DAX reference lists them (names with a dot are left to
  // TABLE_OR_VARIABLE, since a type name cannot hold one).
  "ABS",
  "ACCRINT",
  "ACCRINTM",
  "ACOS",
  "ACOSH",
  "ACOT",
  "ACOTH",
  "ADDCOLUMNS",
  "ADDMISSINGITEMS",
  "ALL",
  "ALLCROSSFILTERED",
  "ALLEXCEPT",
  "ALLNOBLANKROW",
  "ALLSELECTED",
  "AMORDEGRC",
  "AMORLINC",
  "APPROXIMATEDISTINCTCOUNT",
  "ASIN",
  "ASINH",
  "ATAN",
  "ATANH",
  "AVERAGE",
  "AVERAGEA",
  "AVERAGEX",
  "BITAND",
  "BITLSHIFT",
  "BITOR",
  "BITRSHIFT",
  "BITXOR",
  "BLANK",
  "CALCULATE",
  "CALCULATETABLE",
  "CALENDAR",
  "CALENDARAUTO",
  "CEILING",
  "CHISQ",
  "CLOSINGBALANCEMONTH",
  "CLOSINGBALANCEQUARTER",
  "CLOSINGBALANCEYEAR",
  "COALESCE",
  "COLUMNSTATISTICS",
  "COMBIN",
  "COMBINA",
  "COMBINEVALUES",
  "CONCATENATE",
  "CONCATENATEX",
  "CONFIDENCE",
  "CONTAINS",
  "CONTAINSROW",
  "CONTAINSSTRING",
  "CONTAINSSTRINGEXACT",
  "CONVERT",
  "COS",
  "COSH",
  "COT",
  "COTH",
  "COUNT",
  "COUNTA",
  "COUNTAX",
  "COUNTBLANK",
  "COUNTROWS",
  "COUNTX",
  "COUPDAYBS",
  "COUPDAYS",
  "COUPDAYSNC",
  "COUPNCD",
  "COUPNUM",
  "COUPPCD",
  "CROSSFILTER",
  "CROSSJOIN",
  "CUMIPMT",
  "CUMPRINC",
  "CURRENCY",
  "CURRENTGROUP",
  "CUSTOMDATA",
  "DATATABLE",
  "DATE",
  "DATEADD",
  "DATEDIFF",
  "DATESBETWEEN",
  "DATESINPERIOD",
  "DATESMTD",
  "DATESQTD",
  "DATESYTD",
  "DATEVALUE",
  "DAY",
  "DB",
  "DDB",
  "DEGREES",
  "DETAILROWS",
  "DISC",
  "DISTINCT",
  "DISTINCTCOUNT",
  "DISTINCTCOUNTNOBLANK",
  "DIVIDE",
  "DOLLARDE",
  "DOLLARFR",
  "DURATION",
  "EARLIER",
  "EARLIEST",
  "EDATE",
  "EFFECT",
  "ENDOFMONTH",
  "ENDOFQUARTER",
  "ENDOFYEAR",
  "EOMONTH",
  "ERROR",
  "EVALUATEANDLOG",
  "EVEN",
  "EXACT",
  "EXCEPT",
  "EXP",
  "EXPON",
  "EXTERNALMEASURE",
  "FACT",
  "FILTER",
  "FILTERS",
  "FIND",
  "FIRST",
  "FIRSTDATE",
  "FIRSTNONBLANK",
  "FIRSTNONBLANKVALUE",
  "FIXED",
  "FLOOR",
  "FORMAT",
  "FV",
  "GCD",
  "GENERATE",
  "GENERATEALL",
  "GENERATESERIES",
  "GEOMEAN",
  "GEOMEANX",
  "GROUPBY",
  "HASONEFILTER",
  "HASONEVALUE",
  "HOUR",
  "IF",
  "IFERROR",
  "IGNORE",
  "INDEX",
  "INFO",
  "INT",
  "INTERSECT",
  "INTRATE",
  "IPMT",
  "ISAFTER",
  "ISBLANK",
  "ISCROSSFILTERED",
  "ISEMPTY",
  "ISERROR",
  "ISEVEN",
  "ISFILTERED",
  "ISINSCOPE",
  "ISLOGICAL",
  "ISNONTEXT",
  "ISNUMBER",
  "ISO",
  "ISODD",
  "ISONORAFTER",
  "ISPMT",
  "ISSELECTEDMEASURE",
  "ISSUBTOTAL",
  "ISTEXT",
  "KEEPFILTERS",
  "LAST",
  "LASTDATE",
  "LASTNONBLANK",
  "LASTNONBLANKVALUE",
  "LCM",
  "LEFT",
  "LEN",
  "LINEST",
  "LINESTX",
  "LN",
  "LOG",
  "LOG10",
  "LOOKUP",
  "LOOKUPVALUE",
  "LOWER",
  "MATCHBY",
  "MAX",
  "MAXA",
  "MAXX",
  "MDURATION",
  "MEDIAN",
  "MEDIANX",
  "MID",
  "MIN",
  "MINA",
  "MINUTE",
  "MINX",
  "MOD",
  "MONTH",
  "MOVINGAVERAGE",
  "MROUND",
  "NATURALINNERJOIN",
  "NATURALLEFTOUTERJOIN",
  "NETWORKDAYS",
  "NEXT",
  "NEXTDAY",
  "NEXTMONTH",
  "NEXTQUARTER",
  "NEXTYEAR",
  "NOMINAL",
  "NONVISUAL",
  "NOW",
  "NPER",
  "OCT",
  "ODD",
  "ODDFPRICE",
  "ODDFYIELD",
  "ODDLPRICE",
  "ODDLYIELD",
  "OFFSET",
  "OPENINGBALANCEMONTH",
  "OPENINGBALANCEQUARTER",
  "OPENINGBALANCEYEAR",
  "ORDERBY",
  "PARALLELPERIOD",
  "PARTITIONBY",
  "PATH",
  "PATHCONTAINS",
  "PATHITEM",
  "PATHITEMREVERSE",
  "PATHLENGTH",
  "PDURATION",
  "PERMUT",
  "PI",
  "PMT",
  "POWER",
  "PPMT",
  "PREVIOUS",
  "PREVIOUSDAY",
  "PREVIOUSMONTH",
  "PREVIOUSQUARTER",
  "PREVIOUSYEAR",
  "PRICE",
  "PRICEDISC",
  "PRICEMAT",
  "PRODUCT",
  "PRODUCTX",
  "PV",
  "QUARTER",
  "QUOTIENT",
  "RADIANS",
  "RAND",
  "RANDBETWEEN",
  "RANGE",
  "RANK",
  "RANKX",
  "RATE",
  "RECEIVED",
  "RELATED",
  "RELATEDTABLE",
  "REMOVEFILTERS",
  "REPLACE",
  "REPT",
  "RIGHT",
  "ROLLUP",
  "ROLLUPADDISSUBTOTAL",
  "ROLLUPGROUP",
  "ROLLUPISSUBTOTAL",
  "ROUND",
  "ROUNDDOWN",
  "ROUNDUP",
  "ROW",
  "ROWNUMBER",
  "RRI",
  "RUNNINGSUM",
  "SAMEPERIODLASTYEAR",
  "SAMPLE",
  "SEARCH",
  "SECOND",
  "SELECTCOLUMNS",
  "SELECTEDMEASURE",
  "SELECTEDMEASUREFORMATSTRING",
  "SELECTEDMEASURENAME",
  "SELECTEDVALUE",
  "SIGN",
  "SIN",
  "SINH",
  "SLN",
  "SQRT",
  "SQRTPI",
  "STARTOFMONTH",
  "STARTOFQUARTER",
  "STARTOFYEAR",
  "SUBSTITUTE",
  "SUBSTITUTEWITHINDEX",
  "SUM",
  "SUMMARIZE",
  "SUMMARIZECOLUMNS",
  "SUMX",
  "SWITCH",
  "SYD",
  "TAN",
  "TANH",
  "TBILLEQ",
  "TBILLPRICE",
  "TBILLYIELD",
  "TIME",
  "TIMEVALUE",
  "TOCSV",
  "TODAY",
  "TOJSON",
  "TOPN",
  "TOPNSKIP",
  "TOTALMTD",
  "TOTALQTD",
  "TOTALYTD",
  "TREATAS",
  "TRIM",
  "TRUNC",
  "UNICHAR",
  "UNICODE",
  "UNION",
  "UPPER",
  "USERCULTURE",
  "USERELATIONSHIP",
  "USERNAME",
  "USEROBJECTID",
  "USERPRINCIPALNAME",
  "UTCNOW",
  "UTCTODAY",
  "VALUE",
  "VALUES",
  "VDB",
  "WEEKDAY",
  "WEEKNUM",
  "WINDOW",
  "XIRR",
  "XNPV",
  "YEAR",
  "YEARFRAC",
  "YIELD",
  "YIELDDISC",
  "YIELDMAT",
];

/**
 * Every type name a rule may compare `Type` with, each one's code its position here: the
 * captured literal, name, punctuation and operator types, then the keywords and functions.
 */
export const TOKEN_TYPES: readonly string[] = [
  "SINGLE_LINE_COMMENT",
  "DELIMITED_COMMENT",
  "WHITESPACES",
  "DATE_LITERAL",
  "INTEGER_LITERAL",
  "REAL_LITERAL",
  "STRING_LITERAL",
  "TABLE",
  "COLUMN_OR_MEASURE",
  "TABLE_OR_VARIABLE",
  "OPEN_CURLY",
  "CLOSE_CURLY",
  "OPEN_PARENS",
  "CLOSE_PARENS",
  "COMMA",
  "PLUS",
  "MINUS",
  "STAR",
  "DIV",
  "CARET",
  "AMP",
  "LT",
  "GT",
  "OP_AND",
  "OP_OR",
  "OP_NE",
  "OP_LE",
  "OP_GE",
  "LAMBDA",
  "COLON",
  "EQ",
  ...WORDS,
];

/** The type a character no DAX token starts with gets; no rule can name it. */
const UNRECOGNIZED = "UNRECOGNIZED";

const CODES = new Map(TOKEN_TYPES.map((name, i) => [name.toLowerCase(), i]));
const WORD_SET = new Set(WORDS);

/** A type name's code, matched without regard to case, or undefined for a name no token has. */
export function tokenTypeCode(name: string): number | undefined {
  return CODES.get(name.toLowerCase());
}

const OPERATOR_TYPES: Record<string, string> = {
  "+": "PLUS",
  "-": "MINUS",
  "*": "STAR",
  "/": "DIV",
  "^": "CARET",
  "&": "AMP",
  "<": "LT",
  ">": "GT",
  "<=": "OP_LE",
  ">=": "OP_GE",
  "<>": "OP_NE",
  "&&": "OP_AND",
  "||": "OP_OR",
  "=": "EQ",
  "==": "EQ",
};
const PUNCTUATION_TYPES: Record<string, string> = {
  "(": "OPEN_PARENS",
  ")": "CLOSE_PARENS",
  "{": "OPEN_CURLY",
  "}": "CLOSE_CURLY",
  ",": "COMMA",
  ":": "COLON",
};

interface Raw {
  type: string;
  text: string;
  /** Whitespace and comments, which `Next` passes over. */
  hidden: boolean;
}

function typeOf(t: DaxToken, source: string): string {
  switch (t.kind) {
    case "number":
      return /[.eE]/.test(source) ? "REAL_LITERAL" : "INTEGER_LITERAL";
    case "string":
      return "STRING_LITERAL";
    case "date":
      return "DATE_LITERAL";
    case "table":
      return "TABLE";
    case "column":
      return "COLUMN_OR_MEASURE";
    case "identifier": {
      const upper = t.text.toUpperCase();
      return WORD_SET.has(upper) ? upper : "TABLE_OR_VARIABLE";
    }
    case "operator":
      return OPERATOR_TYPES[t.text] ?? UNRECOGNIZED;
    case "punctuation":
      return PUNCTUATION_TYPES[t.text] ?? UNRECOGNIZED;
  }
}

/** The whitespace and comment tokens in a stretch of text pbiplint's tokenizer passed over. */
function gapTokens(gap: string, out: Raw[]): void {
  let i = 0;
  while (i < gap.length) {
    let end: number;
    let type: string;
    if (/\s/.test(gap[i]!)) {
      end = i + 1;
      while (end < gap.length && /\s/.test(gap[end]!)) end++;
      type = "WHITESPACES";
    } else if (gap.startsWith("/*", i)) {
      const close = gap.indexOf("*/", i + 2);
      end = close === -1 ? gap.length : close + 2;
      type = "DELIMITED_COMMENT";
    } else if (gap.startsWith("//", i) || gap.startsWith("--", i)) {
      const nl = gap.indexOf("\n", i);
      end = nl === -1 ? gap.length : nl;
      type = "SINGLE_LINE_COMMENT";
    } else {
      // Not reached: the tokenizer passes over only whitespace and comments.
      end = i + 1;
      type = UNRECOGNIZED;
    }
    out.push({ type, text: gap.slice(i, end), hidden: true });
    i = end;
  }
}

/** The tokens of a DAX expression as Tabular Editor's `Tokenize()` gives them, in order. */
export function teTokens(expression: string): TeDaxToken[] {
  const read = tokenizeDax(expression);
  const raw: Raw[] = [];
  let at = 0;
  for (let k = 0; k < read.length; k++) {
    const t = read[k]!;
    gapTokens(expression.slice(at, t.start), raw);
    const next = read[k + 1];
    if (t.text === "=" && t.kind === "operator" && next?.text === ">" && next.start === t.end) {
      raw.push({ type: "LAMBDA", text: "=>", hidden: false });
      at = next.end;
      k++;
      continue;
    }
    const source = expression.slice(t.start, t.end);
    raw.push({
      type: typeOf(t, source),
      text: t.kind === "string" ? t.text : source,
      hidden: false,
    });
    at = t.end;
  }
  gapTokens(expression.slice(at), raw);

  const tokens: TeDaxToken[] = raw.map((r) => ({ Type: r.type, Text: r.text, Next: null }));
  let following: TeDaxToken | null = null;
  for (let k = raw.length - 1; k >= 0; k--) {
    tokens[k]!.Next = following;
    if (!raw[k]!.hidden) following = tokens[k]!;
  }
  return tokens;
}

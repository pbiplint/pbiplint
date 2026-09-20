---
id: NUMERIC_COLUMN_SUMMARIZE_BY
name: "Do not summarize numeric columns"
category: Formatting
severity: error
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Do not summarize numeric columns

## What it checks

Visible whole number, decimal, or double columns whose default summarization is anything other than None.

Each finding names the column, as `'Date'[Year]`. The summarization the rule found is not in the line, and most findings are columns with no `summarizeBy` property at all, which counts as Default.

## Example

```tmdl fires
table Date
	column Year
		dataType: int64
		sourceColumn: Year
```

```tmdl fixed
table Date
	column Year
		dataType: int64
		summarizeBy: none
		sourceColumn: Year
```

## Why it matters

With a default summarization, dragging the column onto a visual produces an implicit sum, and it is easy to sum something that should never be summed: a year, a unit price, a percentage, a key. The implicit measure also bypasses the format string and the logic of the real measures, so two visuals of the same thing disagree. With summarization off, the column lands on a visual as a category and the author reaches for a measure.

## How to fix it

In Power BI Desktop, select the column in the Data pane and set Summarization to Don't summarize under Column tools. In the TMDL file the property is `summarizeBy: none` under the column. Where the column really is a number reports need totals of, add an explicit measure for it, because the point of the change is that the aggregation becomes something the model defines rather than something a visual guesses.

## When to ignore it

An additive column with no measure behind it is the case to weigh. On a small planning or budget table that a handful of people build their own matrices from, the implicit sum is the feature, and taking it away without writing the measures first makes the model harder to use, not safer. Check which reports drag the column in before you change it. A year, a key, a price, or a rate is never that case: summing any of them produces a number with no meaning, and those are the findings to act on first.

## Quirks

- A column with no `summarizeBy` property is treated as Default, which is not None, so it is reported. That is where most findings come from.
- The property value is compared without regard to letter case, so `summarizeBy: None` passes as well as `summarizeBy: none`.
- Hidden columns, and columns in hidden tables, are skipped.
- Only whole number, decimal, and double columns are in scope, so a DateTime or text column with a summarization set is never reported here.

## Related rules

- `HIDE_FACT_TABLE_COLUMNS` reports a visible numeric column that a measure already aggregates. Hiding that column clears its finding and this one together, because this rule skips hidden columns.
- `FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS` reports the same visible whole-number column when its name marks it as a flag, and converting the column to text clears both.
- `AVOID_FLOATING_POINT_DATA_TYPES` reports every double column, so a visible double with the default summarization is reported by both rules.

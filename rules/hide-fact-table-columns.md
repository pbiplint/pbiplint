---
id: HIDE_FACT_TABLE_COLUMNS
name: "Hide fact table columns"
category: Formatting
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Hide fact table columns

## What it checks

Visible numeric columns that a measure aggregates directly with a fully qualified reference, such as `SUM('Sales'[Amount])`. COUNT, COUNTBLANK, SUM, AVERAGE, MIN, MAX, DISTINCTCOUNT, VALUES, DISTINCT, and the A-suffixed COUNTA, AVERAGEA, MAXA, and MINA count as aggregations.

Each finding names the column, as `'Sales'[Amount]`. The measure that aggregates it is not in the line, so search the model for the column reference to find it.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		summarizeBy: none
		sourceColumn: Amount

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Amount

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

## Why it matters

Once a measure exists for a column, the column itself is the wrong thing to drag onto a visual: it produces an implicit sum that may not match the measure, ignores whatever logic the measure adds, and sits in the field list right next to the measure under a similar name. Hiding the column leaves one correct choice.

## How to fix it

In Power BI Desktop, open the model view, select the column, and turn on Is hidden in the Properties pane, or right-click the column in the Data pane of report view and choose Hide. In the TMDL file, add `isHidden` under the column. The column is still loaded, still refreshed, and still available to every measure and relationship; it only leaves the field list.

## When to ignore it

A numeric column readers use as an attribute rather than as a number is the case to keep visible: a Year on a date table, a Unit Price a report author slices by, a Rating people put on an axis. That a measure also aggregates the column somewhere does not make it the wrong field to pick. The rule does not test whether the table is a fact table either, so a dimension attribute that one measure happens to sum is reported on the same terms as a fact column. What to check before hiding is whether a report already binds a visual to the column, because hiding it does not break that visual but does remove the field from the list for whoever edits it next.

## Quirks

- Only fully qualified references count, and the quote marks around the table name are optional, so `SUM(Sales[Amount])` matches as well as `SUM('Sales'[Amount])`. A bare `SUM([Amount])` inside a measure on the same table does not.
- Nothing may come between the column reference and the aggregation's closing parenthesis, so `SUM('Sales'[Amount] * 2)` is not matched. Spaces after the function name and inside the parentheses are allowed, and the function name matches in any letter case.
- The measure may live on any table in the model, not only on the column's own table.
- The expression is read as raw text, so an aggregation written inside a string literal or a comment counts.
- Only numeric columns are in scope, so `COUNTA('Sales'[Region])` over a text column is not reported.
- A visible column in a hidden table is still reported: the rule tests the column's own visibility, not the table's.

## Related rules

- `NUMERIC_COLUMN_SUMMARIZE_BY` reports the same visible numeric column whenever its summarization is not none, and hiding the column clears that finding too, because that rule skips hidden columns.
- `ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS` reads hidden columns, so hiding a column on this rule's advice can bring it into that rule's reach and produce a new finding there.
- `UNNECESSARY_COLUMNS` also reads hidden columns, but a column reported here is referenced by the measure that aggregates it, so hiding it does not make it unnecessary.

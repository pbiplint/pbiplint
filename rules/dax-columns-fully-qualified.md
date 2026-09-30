---
id: DAX_COLUMNS_FULLY_QUALIFIED
name: "Column references should be fully qualified"
category: DAX Expressions
severity: error
scope: [Measure, TablePermission, CalculationItem]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Column references should be fully qualified

## What it checks

Measures and row-level security filters that refer to a column by its bare name, `[Column]`, instead of `'Table'[Column]`.

Each finding names the object that holds the expression: a measure as `[Total Sales]`, and a row-level security filter by the table it is written on, `Sales`, with the role in the detail, `role Region`.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Total Sales' = SUM([Amount])
		formatString: #,0
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

## Why it matters

In DAX a bare `[Name]` is the convention for a measure. A column written the same way reads as a measure to everyone who maintains the model, and the two behave differently in a row context, so the expression is misread before it is ever debugged. The bare form also breaks when the column moves to another table, or when a measure with the same name is added and the engine binds to that instead.

## How to fix it

Put the table name in front of every column reference:

```
Total Sales = SUM ( 'Sales'[Amount] )
```

In Power BI Desktop, select the measure in the Data pane and edit it in the formula bar, which completes the qualified form as soon as you start typing the table name. A row-level security filter is edited under Modeling, Manage roles. In the TMDL file, edit the expression after `measure 'Total Sales' =`, or the filter after `tablePermission Sales =` inside the role. A finding that only the measure's KPI raises is fixed in the TMDL file, after `targetExpression =`, `statusExpression =`, or `trendExpression =` in the measure's `kpi` block, an edit Power BI Desktop keeps.

## When to ignore it

There is no case for the bare form. The rule is worth reading as a warning rather than a style note: the reference that fires it resolved to a column because no measure of that name exists today, and the day someone adds one, the expression silently starts reading the measure instead. Qualifying it is what stops that.

## Quirks

- Calculation items are in the rule's scope but never fire, because Tabular Editor does not resolve bare column references inside calculation items and pbiplint matches that.
- A bare name that matches any measure in the model is treated as a measure reference, so a column that shares its name with a measure is never flagged.
- A bare name that matches no measure is looked for on the expression's own table first, then on every other table in the order pbiplint reads the model's files, so a finding can be raised by a column that lives on a table the expression never mentions.
- A bare name for a column the same DAX creates with ADDCOLUMNS, SELECTCOLUMNS, SUMMARIZE, SUMMARIZECOLUMNS, ROW, or DATATABLE is that column, not a model column, so it is not reported, even when a model column has the same name: `[Share]` in `MAXX ( ADDCOLUMNS ( VALUES ( 'Sales'[Region] ), "Share", [Total] ), [Share] )`. Inside a call that creates the name, such as `SELECTCOLUMNS ( 'Sales', "Region", [Region] )`, the name is read as any other bare name is, since a call cannot read a column it is creating.
- DAX is read token by token, so a bare `[Column]` inside a string literal or a comment is not reported, nor is the name after the dot in extended column syntax such as `'Date'[Date].[Year]`.
- A measure's dynamic format string and its KPI's target, status, and trend expressions are read together with its expression, so a bare column reference written in any of them reports the measure that carries it, once however many of them hold one. Tabular Editor reports a reference in a KPI's expression on the KPI, named like `[Total Sales].KPI`, so a measure whose own expression and KPI both hold one gets two findings there and one here: pbiplint has no KPI object, so it names the measure.
- Calculated columns and calculated tables are out of scope, so a bare column reference in either is not reported.
- While a model file has a parse issue that can take a declaration out of the model, such as a line indented with spaces, or pbiplint could not open a model file or folder at all, the rule reports nothing, because a bare name reads as a column only when the model has no measure of that name, and a measure of that name could be in what pbiplint missed; pbiplint does not guess what a file it could not read says. The skipped line gives the reason, `a model file could not be fully read`, and the file's own `PARSE_ISSUE` finding names it, or a notice does for a file or folder pbiplint could not open.

## Related rules

- `DAX_MEASURES_UNQUALIFIED` is the opposite convention on the other kind of reference: a column must carry its table name, a measure must not, and the two rules never report the same reference.
- `MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES` reports a measure whose whole expression is a bare `[Name]` that resolves to a measure. Where the same bare name resolves to a column instead, that rule stays quiet and this one fires.

## Links

- [Michael Kovalsky's top ten modeling best practices](https://www.elegantbi.com/post/top10bestpractices)

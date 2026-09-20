---
id: DAX_COLUMNS_FULLY_QUALIFIED
name: "Column references should be fully qualified"
category: DAX Expressions
severity: error
scope: [Measure, TablePermission, CalculationItem]
status: ported
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

In Power BI Desktop, select the measure in the Data pane and edit it in the formula bar, which completes the qualified form as soon as you start typing the table name. A row-level security filter is edited under Modeling, Manage roles. In the TMDL file, edit the expression after `measure 'Total Sales' =`, or the filter after `tablePermission Sales =` inside the role.

## When to ignore it

There is no case for the bare form. The rule is worth reading as a warning rather than a style note: the reference that fires it resolved to a column because no measure of that name exists today, and the day someone adds one, the expression silently starts reading the measure instead. Qualifying it is what stops that.

## Quirks

- Calculation items are in the rule's scope but never fire, because Tabular Editor does not resolve bare column references inside calculation items and pbiplint matches that.
- A bare name that matches any measure in the model is treated as a measure reference, so a column that shares its name with a measure is never flagged.
- A bare name that matches no measure is looked for on the expression's own table first, then on every other table in model order, so a finding can be raised by a column that lives on a table the expression never mentions.
- References are found by pattern matching, so a bare `[Column]` inside a string literal or a comment counts.
- A measure's dynamic format string is read together with its expression, so a bare column reference written inside `formatStringDefinition` reports the measure that carries it.
- Calculated columns and calculated tables are out of scope, so a bare column reference in either is not reported.

## Related rules

- `DAX_MEASURES_UNQUALIFIED` is the opposite convention on the other kind of reference: a column must carry its table name, a measure must not, and the two rules never report the same reference.
- `MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES` reports a measure whose whole expression is a bare `[Name]` that resolves to a measure. Where the same bare name resolves to a column instead, that rule stays quiet and this one fires.

## Links

- [Michael Kovalsky's top ten modeling best practices](https://www.elegantbi.com/post/top10bestpractices)

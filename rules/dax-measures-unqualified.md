---
id: DAX_MEASURES_UNQUALIFIED
name: "Measure references should be unqualified"
category: DAX Expressions
severity: error
scope: [Measure, CalculatedColumn, CalculatedTable, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Measure references should be unqualified

## What it checks

Measures, calculated columns, calculated tables, and calculation items that refer to a measure with a table prefix, `'Table'[Measure]`.

Each finding names the object that holds the expression, not the measure it refers to: a measure as `[Average Price]`, a calculated column as `'Sales'[Margin]`, a calculated table as `'Top Products'`, a calculation item by its name with its calculation group in the detail.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column Quantity
		dataType: int64
		sourceColumn: Quantity
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
	measure 'Average Price' = DIVIDE('Sales'[Total Sales], SUM(Sales[Quantity]))
		formatString: #,0.00
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column Quantity
		dataType: int64
		sourceColumn: Quantity
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
	measure 'Average Price' = DIVIDE([Total Sales], SUM(Sales[Quantity]))
		formatString: #,0.00
```

## Why it matters

A measure belongs to the model, not to the table it sits in; the table is only its home in the field list. Writing `'Sales'[Total Sales]` makes it look like a column, which changes what the next reader expects it to do, and it breaks the moment someone moves the measure to a measure table, which is a routine tidy-up.

## How to fix it

Delete the table name from the reference and leave the brackets:

```
Average Price = DIVIDE ( [Total Sales], SUM ( Sales[Quantity] ) )
```

In Power BI Desktop, select the measure in the Data pane and edit it in the formula bar; the same goes for a calculated column, a calculated table, and a calculation item, each selected in the model view or the Data pane. In the TMDL file, edit the expression after `measure 'Average Price' =`, after `column Name =` for a calculated column, after `source =` in a calculated table's partition, or after `calculationItem Name =` in the calculation group.

## When to ignore it

There is no case for the table prefix on a measure. If a finding surprises you, check whether the table really does hold a measure of that name: pbiplint resolves `'Table'[Name]` to a column first and only calls it a measure when the table has no column of that name, so a finding here means the reference bound to a measure.

## Quirks

- References are found by pattern matching, so a qualified measure reference inside a string literal or a comment counts.
- A measure's dynamic format string is read together with its expression, so `'Sales'[Total Sales]` written inside `formatStringDefinition` reports the measure that carries it.
- The reference has to resolve. `'Sales'[Total Sales]` written where the model has no table called Sales, or where Sales has no measure of that name, is not reported by this rule at all.
- Row-level security filters are out of scope, so a qualified measure reference inside a role's table filter is never reported.
- The table name may be written bare or in single quotes; both forms are matched.

## Related rules

- `DAX_COLUMNS_FULLY_QUALIFIED` is the opposite convention on the other kind of reference: a column must carry its table name, a measure must not, and the two rules never report the same reference.
- `MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES` reports a measure whose whole expression is a bare `[Other Measure]`. Write the same alias with a table prefix and that rule stops matching, while this one starts.

## Links

- [Michael Kovalsky's top ten modeling best practices](https://www.elegantbi.com/post/top10bestpractices)

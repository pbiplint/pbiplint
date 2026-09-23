---
id: AVOID_DUPLICATE_MEASURES
name: "No two measures should have the same definition"
category: DAX Expressions
severity: warning
scope: [Measure]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# No two measures should have the same definition

## What it checks

Two or more measures whose DAX is identical once spaces, tabs, and line breaks are removed. Every copy is reported.

Each finding names one measure, as `[Total Sales]`. The line does not say which other measure it matches, so search the model for the same expression to find the rest of the set.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
	measure 'Sales Amount' = SUM( Sales[Amount] )
		formatString: #,0
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
```

## Why it matters

Two names for one calculation split the reader's trust: nobody can tell which is the real one, reports end up using both, and the next change gets made to one copy only. When both appear in the same visual the engine also evaluates them separately, so the duplicate costs query time as well as confusion.

## How to fix it

Decide which name stays, repoint the visuals that use the other one, and delete it. In Power BI Desktop, right-click the measure in the Data pane and choose Delete from model. In the TMDL file, remove its `measure` block from the table.

Where published reports still bind to the second name, the interim step is to make it a plain reference to the survivor:

```
Sales Amount = [Total Sales]
```

That leaves one definition, so this rule stops reporting the pair, and it moves the finding to `MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES` until the reports are moved and the alias goes.

## When to ignore it

Two measures that are identical only by accident of timing are worth keeping apart: Freight Cost and Handling Cost both reading the same column because the split in the source has not landed yet will diverge the week it does, and merging them now only means writing one of them again. Check whether the two names mean different things to the business before you delete either. Where they mean the same thing, there is nothing to weigh.

## Quirks

- The comparison is exact apart from whitespace: spaces, tabs, carriage returns, and line breaks are removed from both expressions before they are compared. An expression laid out over several lines matches the same expression written on one.
- The comparison is case sensitive, so `SUM(Sales[Amount])` and `sum(Sales[Amount])` are not duplicates here even though DAX treats them as the same expression.
- A comment on either copy makes them differ, so the same calculation with a note on one of them is not reported.
- Only the measure expression is read. Two measures with the same expression are a duplicate pair whatever their format strings say, and a difference in a dynamic format string does not separate them either.
- Measures only. Two calculated columns or two calculation items with the same expression are not compared.

## Related rules

- `MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES` is where the pair lands if you keep the second name as an alias instead of deleting it.
- `UNNECESSARY_MEASURES` reports a hidden measure that no expression references, so a duplicate left hidden and unused is reported by both rules and deleting it clears both.

---
id: MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES
name: "Measures should not be direct references of other measures"
category: DAX Expressions
severity: warning
scope: [Measure]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Measures should not be direct references of other measures

## What it checks

Measures whose whole expression is a reference to another measure, such as `[Total Sales]`.

Each finding names the alias, not the measure it points at, as `[Revenue]`.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
	measure Revenue = [Total Sales]
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

An alias measure is a second name for the same number. Reports pick one or the other, the two drift apart the first time someone edits the alias instead of the original, and anyone reading the model has to follow the reference to learn what it means.

## How to fix it

Repoint the visuals that use the alias at the original, then delete it. In Power BI Desktop, right-click the alias in the Data pane and choose Delete from model. In the TMDL file, remove its `measure` block from the table.

Where the alias exists only because its name is the better one, do the rename the other way around: rename the original and delete the alias. Select the original in the Data pane, press F2, and type the new name, and Desktop repoints the visuals that use it. In the TMDL file the name is on the declaration line, so `measure 'Total Sales' =` becomes `measure Revenue =`, and a hand edit there does not update the report, so open the report and check its visuals afterwards.

## When to ignore it

A rename in progress is the case that holds up: the alias keeps published reports working until each one is repointed, and it goes the day the last one moves. Give it an end date rather than leaving it. The argument that the alias puts the number in a second place in the field list does not hold, because the original's home table and display folder are both properties you can set on it, which is the same result without a second definition.

## Quirks

- Only the exact form matches: the whole expression has to be `[Name]` and nothing else. A table prefix, a comment, a space inside the brackets, or any function around it takes the measure out of this rule. Whitespace around the expression does not: the parser trims it, so an alias written on the line below the `=` is still reported.
- The match is case sensitive, so `[total sales]` is not reported even though DAX resolves it to the same measure.
- The name in brackets has to be a measure in the model. An expression that is one bare reference to a column is not reported here, and neither is one that names nothing.
- Measures only. A calculated column whose expression is a single measure reference is not reported.

## Related rules

- `AVOID_DUPLICATE_MEASURES` is where the same pair sits before the alias is written: two measures with identical expressions. Replacing one of them with a reference to the other moves the finding from there to here.
- `DAX_MEASURES_UNQUALIFIED` reports the same alias written as `'Sales'[Total Sales]`. That form escapes this rule, because the expression is no longer exactly `[Name]`, and lands there instead.
- `UNNECESSARY_MEASURES` reports a hidden measure that no expression references, so an alias left hidden and unused is reported by both rules and deleting it clears both.

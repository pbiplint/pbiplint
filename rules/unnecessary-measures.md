---
id: UNNECESSARY_MEASURES
name: "Remove unnecessary measures"
category: Maintenance
severity: warning
scope: [Measure]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Remove unnecessary measures

## What it checks

Hidden measures, or measures on hidden tables, that no DAX expression references.

Each finding names the measure as DAX writes it, `[Total Sales Legacy]`, without the table it sits on.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0

	measure 'Total Sales Legacy' = SUMX('Sales', 'Sales'[Amount])
		isHidden
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

A hidden measure that no other measure uses can only be reached by a report that already had it, so it is either dead or a hidden dependency that breaks the day someone deletes it as dead. Either way it belongs in the open or in the bin.

## How to fix it

In Power BI Desktop, right-click the measure in the Data pane and choose Delete from model, or, if reports still use it, clear Is hidden in the Properties pane so the dependency is visible to the next person. In the TMDL file, remove the `measure` block from its table, or remove `isHidden` from under it. Search the project for the measure's name before you delete it: pbiplint has already read every expression in the model, so what a search adds is the report files, which it does not read.

## When to ignore it

Report usage is the case to check first. A hidden measure that a visual or a report-level filter binds to directly is in use, and pbiplint reads the model, not the report, so open the reports before you delete one. A measure you have written for a calculation item or a measure you have not finished is a fair thing to leave for as long as that lasts. A hidden measure nobody can name a caller for is what the rule is for.

## Quirks

- References from calculation items and from other hidden measures count as usage.
- Report usage is not visible to this rule. A hidden measure used only by a visual is still flagged.
- A row-level security filter counts as a DAX expression, so a measure named in one is used.
- A bare `[Measure]` reference resolves by name across the whole model, ignoring letter case, so it counts wherever the measure lives. References are found by pattern, not by parsing, so a measure named inside a string or a comment counts as used too.

## Related rules

- `UNNECESSARY_COLUMNS` makes the same test on hidden columns, and reads relationships, hierarchies, and security rules as well as expressions.
- `MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES` reports a measure whose whole expression is a reference to another measure. That reference counts as usage here, so deleting the alias can bring the measure it named into this rule.
- `PROVIDE_FORMAT_STRING_FOR_MEASURES` reads only visible measures, which this rule never reports, so unhiding a measure to keep it moves it into that rule's scope, provided its table is visible too.

---
id: EVALUATEANDLOG_SHOULD_NOT_BE_USED_IN_PRODUCTION_MODELS
name: "The EVALUATEANDLOG function should not be used in production models"
category: DAX Expressions
severity: info
scope: [Measure]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# The EVALUATEANDLOG function should not be used in production models

## What it checks

Measures that call EVALUATEANDLOG.

Each finding names the measure, as `[Average Price]`. The line does not say where in the expression the call is, so read the whole expression: the call is often wrapped around one inner step rather than the whole measure.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column Quantity
		dataType: int64
		sourceColumn: Quantity
	measure 'Average Price' = DIVIDE(EVALUATEANDLOG(SUM(Sales[Amount])), SUM(Sales[Quantity]))
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
	measure 'Average Price' = DIVIDE(SUM(Sales[Amount]), SUM(Sales[Quantity]))
		formatString: #,0.00
```

## Why it matters

EVALUATEANDLOG is a debugging aid: in Power BI Desktop it emits a trace event with its argument on every evaluation so you can watch intermediate values. The service ignores it. Leaving it in a published model ships debug scaffolding that every reader has to look past, and anyone who opens the file in Desktop gets trace output they did not ask for.

## How to fix it

Delete the wrapper and keep what was inside it. EVALUATEANDLOG returns its first argument unchanged, so removing it cannot change the result:

```
Average Price = DIVIDE ( SUM ( Sales[Amount] ), SUM ( Sales[Quantity] ) )
```

In Power BI Desktop, select the measure in the Data pane and edit it in the formula bar. In the TMDL file, edit the expression after `measure 'Average Price' =`. Where the call has a second argument it is only the label the trace event carries, so it goes with the wrapper.

## When to ignore it

While you are actually debugging the measure, the call is the point, and the finding is telling you what you already know. The rule is worth leaving on so the call cannot reach a published model by accident: ignore the finding for the length of the investigation, not for the life of the measure. A model that is never published, such as a scratch file used to work out a pattern, is the one case where the finding has nothing behind it.

## Quirks

- The test is for the text `EVALUATEANDLOG(`, in any letter case and with any spacing before the parenthesis, anywhere in the expression. A mention inside a string literal or a comment counts.
- Measures only. A calculated column or a calculation item that calls the function is not reported, even though it reaches a published model the same way.
- Only the measure's own expression is read. A call inside a dynamic format string is not reported.

## Links

- [Introducing the DAX EVALUATEANDLOG function](https://pbidax.wordpress.com/2022/08/16/introduce-the-dax-evaluateandlog-function/)

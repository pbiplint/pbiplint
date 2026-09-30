---
id: UDF_NOT_CALLED
name: "User-defined function nothing calls"
category: Maintenance
severity: info
scope: [Function]
status: builtin
layer: model
video:
sources:
---

# User-defined function nothing calls

## What it checks

User-defined functions that no measure, calculated column, calculated table, calculation item, row-level security filter, format string expression, KPI, or other function in the model calls. The functions of a DAX Lib package, which share one `DAXLIB_PackageId` annotation, count as one: the package is reported once, on its first function, when nothing outside it calls any of them.

Each finding names the function as the model does, as `Local.AddVat`, and points at its `function` line in `definition/functions.tmdl`. A package's finding says which package it is and how many functions it holds, as `package DaxPatterns.AbcClassification: none of its 2 functions is called`.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Sales With Tax' = Local.AddTax(SUM('Sales'[Amount]))
		formatString: #,0

/// Adds 10 percent sales tax to an amount.
function 'Local.AddTax' = (amount: NUMERIC) => amount * 1.1

/// Adds 20 percent VAT to an amount.
function 'Local.AddVat' = (amount: NUMERIC) => amount * 1.2
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Sales With Tax' = Local.AddTax(SUM('Sales'[Amount]))
		formatString: #,0

/// Adds 10 percent sales tax to an amount.
function 'Local.AddTax' = (amount: NUMERIC) => amount * 1.1
```

## Why it matters

A function nothing calls is dead code that looks alive. It sits under Functions in Model explorer beside the ones in use, and anyone writing DAX in the model can find it and call it, with nothing to say whether it still does what its name promises or was left behind by a rewrite.

It also keeps other dead code alive. A hidden measure or column that a function names counts as used, whether or not anything calls the function, so `UNNECESSARY_MEASURES` and `UNNECESSARY_COLUMNS` pass over everything the dead function names. Deleting the function brings those to light.

A DAX Lib package installs all of its functions at once, so a model that calls one of them carries the rest unused as a matter of course. The rule reports a package only when none of it is called: the whole library was installed and never used.

## How to fix it

Delete the function, after checking the callers pbiplint cannot see, listed under When to ignore it.

In Power BI Desktop's Model view, select Model at the top of the Data pane to open [Model explorer](https://learn.microsoft.com/power-bi/transform-model/model-explorer#find-model-explorer), right-click the function under Functions, and choose Delete from model ([Using Model explorer](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#using-model-explorer)). In TMDL, remove the function's block from `definition/functions.tmdl`: its `///` description lines, its `function` line, and the lines indented under it. For a package, delete each function that carries its `DAXLIB_PackageId` annotation.

## When to ignore it

When something outside the model's own DAX calls the function:

- A DAX query, such as a test harness that runs a model's test functions from outside it.
- A report's own measures, which this rule does not read, including a live-connected report's, which can call the functions of the model it connects to ([Considerations and limitations](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#considerations-and-limitations)).
- A visual calculation, which pbiplint does not read.

Or when the function is kept on purpose, such as one written ahead of the measures that will call it.

## Quirks

- A call is the function's whole name, dots included, in any letter case, followed by an opening parenthesis, so `MySales.Tax(` is not a call to `Sales.Tax`. A call written inside a string or a comment is not a call.
- The rule looks one step. A function that only an uncalled function calls is not reported until that caller is gone, and then the next run reports it.
- A package is known by the `DAXLIB_PackageId` annotation that Power BI Desktop keeps when it installs a package from DAX Lib. Functions installed without that annotation, such as through semantic-link-labs, which writes its own ([`_functions.py`](https://github.com/microsoft/semantic-link-labs/blob/main/src/sempy_labs/daxlib/_functions.py)), are each checked as the model's own.
- While a model file has a parse issue that can take a declaration out of the model, such as a line indented with spaces, or pbiplint could not open a model file or folder at all, the rule reports nothing, because the DAX that calls the function could be in what pbiplint missed, and pbiplint does not guess what a file it could not read says. The skipped line gives the reason, `a model file could not be fully read`, and the file's own `PARSE_ISSUE` finding names it, or a notice does for a file or folder pbiplint could not open.

## Related rules

- `UNNECESSARY_MEASURES` counts a measure that a function names as used, even when nothing calls the function, so a hidden measure that only this rule's function uses is reported there once the function is deleted.
- `UNNECESSARY_COLUMNS` does the same for a hidden column.
- `NOT_REACHED_FROM_REPORT`, when the report is in the input, follows calls from the report through functions, so it reports the columns and measures only an uncalled function uses, though not the function itself.
- `UDF_USE_COMPOUND_NAMES` and `UDF_WITHOUT_DESCRIPTION` report on functions too; a function this rule reports is cheaper to delete than to rename or describe.

## Links

- [Use DAX user-defined functions, managing them in Model explorer](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#using-model-explorer)
- [Use DAX user-defined functions, considerations and limitations](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#considerations-and-limitations)

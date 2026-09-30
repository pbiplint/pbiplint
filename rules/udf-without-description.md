---
id: UDF_WITHOUT_DESCRIPTION
name: "User-defined function with no description"
category: Maintenance
severity: info
scope: [Function]
status: builtin
layer: model
video:
sources:
---

# User-defined function with no description

## What it checks

User-defined functions with no description, or one of only spaces, other than functions installed from a DAX Lib package. Tabular Editor 3 has a built-in rule with the same test, which also reports package functions.

Each finding names the function as the model does, as `Local.AddTax`, and points at its `function` line in `definition/functions.tmdl`.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Sales With Tax' = Local.AddTax(SUM('Sales'[Amount]))
		formatString: #,0

function 'Local.AddTax' = (amount: NUMERIC) => amount * 1.1
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

A function is written once and called from many places, often by someone other than its author, and its description is what they see of it while they write the call. Microsoft's guidance is to document a function with `///` lines, and it notes that single-line (`//`) or multi-line (`/* */`) comments "will not appear in IntelliSense function descriptions" ([General form](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#general-form)). Without a description, a caller learns what the function returns, and what its parameters expect, only by opening its DAX.

## How to fix it

Write a sentence or two on what the function returns and what each parameter expects.

In Power BI Desktop, open the function in DAX query view: in Model view, select Model at the top of the Data pane to open Model explorer, right-click the function under Functions, and choose Quick queries, then Define and evaluate ([Using Model explorer](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#using-model-explorer)). Write `///` lines directly above its `FUNCTION` line and select Update model with changes ([Saving to the model](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#saving-to-the-model)); the `///` syntax serves "both measure and function descriptions" ([Add measure descriptions](https://learn.microsoft.com/power-bi/transform-model/dax-query-view#add-measure-descriptions)). In TMDL, add the `///` lines directly above the function's `function` line in `definition/functions.tmdl`, with no blank line between the last of them and the declaration.

Microsoft says parameter descriptions are not supported ([Considerations and limitations](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#considerations-and-limitations)), so say what the parameters expect in the description itself; `@param` and `@returns` tags are optional.

## When to ignore it

A function whose name and parameters already say everything, such as `Local.Double(amount)`, gains little from a sentence repeating them. A function nothing calls is better deleted than described.

## Quirks

- Functions with a `DAXLIB_PackageId` annotation, which Power BI Desktop keeps when it installs a package from DAX Lib, are skipped, since a published package version cannot be edited, only replaced by a new version ([Submitting a library to DAX Lib](https://docs.daxlib.org/contribute/fork-daxlib#submitting-library-to-dax-lib)). Tabular Editor's rule reports them. Functions installed without that annotation, such as through semantic-link-labs, which writes its own ([`_functions.py`](https://github.com/microsoft/semantic-link-labs/blob/main/src/sempy_labs/daxlib/_functions.py)), are checked as the model's own.
- A description of only spaces or tabs counts as none.
- Whether a function is hidden makes no difference, as in Tabular Editor's rule, whose name speaks of visible functions but which reports a hidden one too.

## Related rules

- `OBJECTS_WITH_NO_DESCRIPTION` asks the same of visible tables, columns, measures, and calculation groups.
- `PARSE_ISSUE` reports a `///` description with a blank line between it and its declaration. The function is then read as having none, so the same edit produces a finding from both rules.
- `UDF_NOT_CALLED` reports a function nothing calls, which is better deleted than described.

## Links

- [Use DAX user-defined functions, the general form and its documentation comments](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#general-form)
- [DAX query view, adding descriptions with triple-slash comments](https://learn.microsoft.com/power-bi/transform-model/dax-query-view#add-measure-descriptions)
- [TMDL overview, descriptions](https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview#descriptions)

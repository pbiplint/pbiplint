---
id: UDF_USE_COMPOUND_NAMES
name: "User-defined function with a one-word name"
category: Error Prevention
severity: info
scope: [Function]
status: builtin
layer: model
video:
sources:
---

# User-defined function with a one-word name

## What it checks

User-defined functions whose name holds neither a dot nor an underscore, such as `AddTax`. Tabular Editor 3 has a built-in rule with the same test.

Each finding names the function as the model does and points at its `function` line in `definition/functions.tmdl`. Functions installed from a DAX Lib package are checked too; their names start with the package's name, so they pass.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Sales With Tax' = AddTax(SUM('Sales'[Amount]))
		formatString: #,0

/// Adds 10 percent sales tax to an amount.
function AddTax = (amount: NUMERIC) => amount * 1.1
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

Most of DAX's built-in functions have one-word names, and new ones arrive with Power BI releases. Microsoft's naming rules say a function's name "Must not conflict with built-in DAX functions" ([Define and manage user-defined functions](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#define-and-manage-user-defined-functions)), but a one-word name that is free today can be taken by a built-in tomorrow. Microsoft does not say what happens to the model's function then. Tabular Editor's guidance says that "the built-in function takes precedence and your UDF will stop working" ([Use compound names for user-defined functions](https://docs.tabulareditor.com/en/kb/bpa-udf-use-compound-names.html#why-this-matters)), so every call to it would reach the built-in instead.

A dot or an underscore marks the name as the model's own. SQLBI's naming conventions recommend a `Local.` prefix for a model's own functions "to avoid conflicts with future DAX function names" ([Function names](https://docs.sqlbi.com/dax-style/dax-naming-conventions#function-names)), and a library's functions start with the library's name.

## How to fix it

Rename the function to a compound name, such as `Local.AddTax` for a function of the model's own, or a prefix for your organization or library.

In Power BI Desktop's Model view, select Model at the top of the Data pane to open [Model explorer](https://learn.microsoft.com/power-bi/transform-model/model-explorer#find-model-explorer), right-click the function under Functions, choose Rename, and enter the new name; Desktop updates the measures and functions that call it.

In TMDL, change the name on the function's line in `definition/functions.tmdl`, in single quotes when it holds a dot (`function 'Local.AddTax' =`), and at every call in the files under `definition/`, where it is written without quotes (`Local.AddTax(`). Searching those files for the old name followed by an opening parenthesis finds the calls.

## When to ignore it

When the name is fixed by something outside the model: a live-connected report's own measures, or a DAX query kept elsewhere, calls the function by that name, and renaming it would break them where nothing in the model shows it. Otherwise the finding is not noise, though the risk it guards against lies in future releases rather than in the model today.

## Quirks

- The test is Tabular Editor's: a dot or an underscore anywhere in the name passes, so `_toggleButton` passes, and so does `add_tax`.
- A dot is no guarantee against a clash. Microsoft's own built-ins include dotted names, such as [`INFO.USERDEFINEDFUNCTIONS`](https://learn.microsoft.com/dax/info-userdefinedfunctions-function-dax).
- A function from a DAX Lib package is checked as any other, since its name is what callers write.

## Related rules

- `UDF_NOT_CALLED` reports a function nothing calls, which is cheaper to delete than to rename.
- `UDF_WITHOUT_DESCRIPTION` reports a function with no description, a good moment to add one while the function is open.

## Links

- [Use DAX user-defined functions, the naming rules for functions and parameters](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#define-and-manage-user-defined-functions)
- [Tabular Editor's rule, Use compound names for user-defined functions](https://docs.tabulareditor.com/en/kb/bpa-udf-use-compound-names.html)
- [SQLBI's DAX naming conventions for function names](https://docs.sqlbi.com/dax-style/dax-naming-conventions#function-names)

---
id: SPLIT_DATE_AND_TIME
name: "Split date and time"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: needsLiveModel
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Split date and time

## What it checks

DateTime columns holding values that are not at midnight. Whether any row carries a time is a statistic of the loaded data, not of the model files, so pbiplint lists this rule but does not run it: it needs statistics that only a live model carries.

## Why it matters

A timestamp column has nearly as many distinct values as rows, so it does not compress and it cannot relate to a date table. Split into a date and a time, each column has a few thousand distinct values, compresses well, relates to a date table and a time table, and supports the questions people actually ask, which are by day and by hour rather than by second.

## How to fix it

Find the columns first. In Power BI Desktop's DAX query view, run a query such as `EVALUATE ROW("with a time", COUNTROWS(FILTER('Sales', HOUR('Sales'[Order Timestamp]) + MINUTE('Sales'[Order Timestamp]) + SECOND('Sales'[Order Timestamp]) > 0)))` against each DateTime column you suspect. Then split the ones that come back. The fix lives where the column is loaded, not in a model property: in Transform data, select the column, use Add Column, Date, Date Only and Add Column, Time, Time Only, then remove the original column, or return the two columns from the view the query reads so the split folds into the refresh. Where nobody asks a question by hour, there is no need for a second column at all: select the column and use Transform, Date, Date Only, which drops the time part in place and collapses the cardinality in one step. Finish by relating the date column to the date table, and the time column to a time table of one row per minute or per hour if the reports need it.

## Quirks

- The source rule reads a `DateTimeWithHourMinSec` annotation that a Tabular Editor script writes onto the model after loading VertiPaq statistics. A project's files never carry that annotation, which is why pbiplint lists the rule rather than running it.
- The threshold is a count above zero, so a single row whose value is not at midnight reports a column of a million dates that are.
- All three column kinds are in scope, so a calculated column that builds a timestamp is read the same way as a loaded one.

## Related rules

- `REDUCE_USAGE_OF_LONG-LENGTH_COLUMNS_WITH_HIGH_CARDINALITY` is the other column-level statistics rule, and pbiplint lists it without running it for the same reason.
- `DATECOLUMN_FORMATSTRING` reports a DateTime column whose name contains date and whose format string is not `mm/dd/yyyy`, which pbiplint can check from the files alone. A timestamp column called Order Date is formatted to show its time, so it is reported there as well, and splitting the column and giving the date part `mm/dd/yyyy` clears that finding.

## Links

- [Separate date and time in PowerPivot (and BISM tabular)](https://www.sqlbi.com/articles/separate-date-and-time-in-powerpivot-and-bism-tabular/)

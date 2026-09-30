---
id: HARDCODED_YEAR_IN_FILTER
name: "Hardcoded year in a filter"
category: Report Design
severity: info
scope: [Visual, Page, Report]
status: builtin
layer: report
video:
sources:
---

# Hardcoded year in a filter

## What it checks

Filters in the Filters pane, on a visual, a page, or all pages, that hold a year column to fixed years: years picked in Basic filtering, a year set with Advanced filtering's is, years kept up to one with is less than or is less than or equal to, and a range between two years.

A year column is a column, or a level of a hierarchy, whose name says it holds a year, in several languages: Year, Fiscal Year, Año, Ano, Jahr, Année, and more, the same words `HARDCODED_PERIOD_IN_DAX` reads in DAX. A year is a whole number or text of four digits, from 1950 to 2049.

Each finding names what the filter is on: a visual as `"Sales LY" on "Overview"`, or as `card (3d9c80) on "Overview"` when it has no title; a page's filter as `Page filter on "Overview"`; and a filter on all pages as `Report filter`. Its detail says what the filter keeps, and on which column, as `fixed year 2025 on 'Date'[Year]`, `fixed years 2024 and 2025 on 'Date'[Year]`, `years up to 2025 on 'Date'[Year]`, or `years 2018 to 2025 on 'Date'[Year]`. The finding sits on the line of report.json, the page.json, or the visual.json where the year is written: the first year kept, or the upper bound.

## Example

```pbir fires page.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
  "name": "3cea48e58036b1654474",
  "displayName": "Overview",
  "displayOption": "FitToPage",
  "height": 720,
  "width": 1280,
  "filterConfig": {
    "filters": [
      {
        "name": "21d1dc168996da6409ea",
        "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Date" } }, "Property": "Year" } },
        "type": "Categorical",
        "filter": {
          "Version": 2,
          "From": [{ "Name": "d", "Entity": "Date", "Type": 0 }],
          "Where": [
            {
              "Condition": {
                "In": {
                  "Expressions": [
                    { "Column": { "Expression": { "SourceRef": { "Source": "d" } }, "Property": "Year" } }
                  ],
                  "Values": [[{ "Literal": { "Value": "2025L" } }]]
                }
              }
            }
          ]
        },
        "howCreated": "User"
      }
    ]
  }
}
```

```pbir fixed page.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
  "name": "3cea48e58036b1654474",
  "displayName": "Overview",
  "displayOption": "FitToPage",
  "height": 720,
  "width": 1280,
  "filterConfig": {
    "filters": [
      {
        "name": "f7a189206cee6051586c",
        "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Date" } }, "Property": "Date" } },
        "type": "RelativeDate",
        "filter": {
          "Version": 2,
          "From": [{ "Name": "d", "Entity": "Date", "Type": 0 }],
          "Where": [
            {
              "Condition": {
                "Comparison": {
                  "ComparisonKind": 0,
                  "Left": { "Column": { "Expression": { "SourceRef": { "Source": "d" } }, "Property": "Date" } },
                  "Right": { "DateSpan": { "Expression": { "Now": {} }, "TimeUnit": 3 } }
                }
              }
            }
          ]
        },
        "howCreated": "User"
      }
    ]
  }
}
```

The Overview page was saved with 2025 picked for 'Date'[Year] under Filters on this page, so the finding reads `Page filter on "Overview"` with `fixed year 2025 on 'Date'[Year]`. The fix filters 'Date'[Date] instead, with a relative date filter that keeps the dates in this year. Nothing in it names a year, so on January 1 the page moves to the new one by itself.

## Why it matters

A filter set in the Filters pane is saved with the report, and Microsoft says such filters "become the default filter state for all your report readers" ([Reset to default values](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-add-filter#reset-to-default-values)). A year picked there is right for the year it was saved in and quietly wrong after it. A page filtered to 2026 still shows 2026 all through 2027, under the same titles, and nothing on it says the year has passed.

A filter that keeps years up to one, or years picked one by one, goes wrong more quietly still. When a new year's data arrives the filter leaves it out, and the visuals look complete without it. A hidden filter is the hardest to catch: in Microsoft's words, "If you hide the filter, they can't even see it" ([Lock or hide filters](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-filter#lock-or-hide-filters)).

## How to fix it

Filter the date, not the year, with a filter that moves with the calendar. In Power BI Desktop:

1. Drag the date column, such as 'Date'[Date], from the Data pane into the section of the Filters pane that holds the year filter: Filters on this visual, Filters on this page, or Filters on all pages ([Add a filter to a visual](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-add-filter#add-a-filter-to-a-visual)).
2. On the date column's filter card, select Relative date from the Filter type drop-down ([Create the relative date range filter](https://learn.microsoft.com/power-bi/visuals/desktop-slicer-filter-date-range#create-the-relative-date-range-filter)).
3. Under Show items when the value, choose is in this, then year.
4. Remove the year filter. A filter you added can be deleted from the pane; a year that is one of the visual's own fields cannot be deleted, since the visual refers to it, so clear it instead ([Types of filters](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-filter-types#compare-filter-types)).

A relative date filter needs a column whose data type is a date, and it cannot use the auto date/time hierarchy, so for a filter on a date column's Year level, filter that date column itself ([Considerations and limitations](https://learn.microsoft.com/power-bi/visuals/desktop-slicer-filter-date-range#considerations-and-limitations)).

When the filter keeps every year up to the latest one, as a range, an upper bound, or years picked one by one, it usually means every year from the first on. On its card, choose Advanced filtering, set the first condition to is greater than or equal to the first year, leave the second empty, and select Apply filter ([Add a filter to a visual](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-add-filter#add-a-filter-to-a-visual)), so each new year is kept as it arrives.

When the page should follow the latest year in the data rather than the calendar, as when data for a year lands weeks after it starts, or when the model has no date column, mark the year in the model instead. Right-click the date table in the Data pane, select New column, and enter the column's DAX in the formula bar ([Using calculated columns](https://learn.microsoft.com/power-bi/transform-model/desktop-calculated-columns#lets-look-at-an-example)):

```
Is Latest Year = 'Date'[Year] = YEAR ( MAX ( Sales[Order Date] ) )
```

Then drag Is Latest Year into the Filters pane in place of the year filter and keep True. For the calendar's current year, write `YEAR ( TODAY () )` in place of the MAX. Either way the flag moves at the first refresh of the new year, since, as Microsoft puts it for calculated columns, "Column values are recalculated as necessary, like when the underlying data is refreshed and values have changed" ([Using calculated columns](https://learn.microsoft.com/power-bi/transform-model/desktop-calculated-columns)).

In the report's files, the filter is an entry in `filterConfig` in report.json for all pages, the page.json for a page, or the visual.json for a visual: replace the year's entry with one on the date column, as the example does.

## When to ignore it

A fixed year is sometimes the point: a page or a visual about one year, such as a review of 2024; a baseline year others are compared with; a cohort; a series that has ended, such as figures that stopped being published; or sample data that never changes.

Often the better move is a name that says so. A page whose name, or a visual whose title, carries one of the years its filter keeps, such as `Sales 2024` or `Review FY24`, reads as deliberate to every reader, and the rule leaves that filter alone.

## Quirks

- A filter that leaves years out, with is not or with Select all and years cleared, or only starts from a year, with is greater than or is greater than or equal to, is not reported, since each new year still shows.
- Years are counted whole, so `is less than 2026` reads as `years up to 2025`, and a range from `is greater than 2017` reads as starting in 2018.
- An upper bound joined by And to anything but a lower bound, such as is not blank, and conditions joined by Or are not read.
- A filter kept to one day, such as a date column set to December 31, 2025, is not read, and neither is a year written as a label, such as FY2025 or 2024/25, or stored as a decimal number.
- Filters that drilling sets are left alone: a drillthrough page's field keeps the last value passed to it, and a visual saved drilled down keeps the value drilled into, and the author picked neither.
- A filter hidden from readers or locked is reported like any other, since it still filters.
- Only the Filters pane is read. A year saved as a slicer's selection is `SLICER_SELECTION_SAVED`'s to report, and bookmarks are not read.
- A name that pairs a year with a month or a quarter, such as YearMonth, is not a year column, and neither is a count of years, such as Years of Service.
- In the Power BI service, Microsoft says "slicer and filter relative options are always based on the time in UTC" ([Considerations and limitations](https://learn.microsoft.com/power-bi/visuals/desktop-slicer-filter-date-range#considerations-and-limitations)), so a relative date filter moves to the new year at midnight UTC, not at local midnight.

## Related rules

- `HARDCODED_PERIOD_IN_DAX` reports the same problem in DAX: a year or a date fixed in a measure, a calculated column, or a date table.
- `SLICER_SELECTION_SAVED` reports a slicer saved with a selection, a year picked in one among them.

## Links

- [Create a relative date slicer or filter in Power BI, the relative date filter](https://learn.microsoft.com/power-bi/visuals/desktop-slicer-filter-date-range#create-the-relative-date-range-filter)
- [The same page's considerations and limitations, on date columns, auto date/time, and UTC](https://learn.microsoft.com/power-bi/visuals/desktop-slicer-filter-date-range#considerations-and-limitations)
- [Add a filter to a report in Power BI, where saved filters become readers' defaults](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-add-filter#reset-to-default-values)
- [Format filters in Power BI reports, on locked and hidden filters](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-filter#lock-or-hide-filters)
- [Types of filters in Power BI reports, on which filters can be deleted or cleared](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-filter-types#compare-filter-types)
- [Using calculated columns in Power BI Desktop](https://learn.microsoft.com/power-bi/transform-model/desktop-calculated-columns#lets-look-at-an-example)
- [TODAY function (DAX), and when its value updates](https://learn.microsoft.com/dax/today-function-dax#remarks)

---
id: REDUCE_USAGE_OF_LONG-LENGTH_COLUMNS_WITH_HIGH_CARDINALITY
name: "Reduce usage of long-length columns with high cardinality"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: needsLiveModel
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Reduce usage of long-length columns with high cardinality

## What it checks

Text columns where more than 500,000 rows hold values longer than 100 characters. That count is a statistic of the loaded data, not of the model files, so pbiplint lists this rule but does not run it: it needs statistics that only a live model carries.

## Why it matters

The engine stores each distinct text value once in a dictionary and encodes the rows against it. Long unique strings, such as comments, descriptions, or URLs with query strings, defeat that: the dictionary grows as large as the data, memory and refresh time follow, and every visual that touches the column pays to decode it. Such a column is usually never shown in a visual anyway.

## How to fix it

Find the columns first. In Power BI Desktop's DAX query view, run a query such as `EVALUATE ROW("long rows", COUNTROWS(FILTER('Sales', LEN('Sales'[Comment]) > 100)), "distinct", DISTINCTCOUNT('Sales'[Comment]))` against each text column you suspect. Then deal with the ones that come back large. The cheapest answer is not to load the column: choose Transform data, select the query, and use Choose Columns or Remove Columns, or drop it from the select list of the view the query reads. Where a report does show the text, shorten it where it is loaded, with Extract, First Characters under the Transform tab, or keep the full text in a separate detail table that a drillthrough page reads, so the wide column is never scanned by a summary visual. Where the text is a code or a URL with a repeating prefix, splitting the prefix into its own column gives the dictionary something to compress. DAX Studio's VertiPaq Analyzer reports every column's size and cardinality at once if you would rather start from a list than a query per column, and if you already use Tabular Editor, the walkthrough under Links loads the same statistics into its Best Practice Analyzer, which can then run this rule directly.

## Quirks

- The source rule reads a `LongLengthRowCount` annotation that a Tabular Editor script writes onto the model after loading VertiPaq statistics. A project's files never carry that annotation, which is why pbiplint lists the rule rather than running it.
- Despite the name, cardinality is not in the condition. Only the number of rows holding a value longer than 100 characters is tested, so a column whose million rows all hold the same long string, which compresses perfectly, meets it.
- The threshold is a flat count of rows, not a share of the table. A million-row column whose values are all 99 characters long is never reported, and a 400,000-row table of kilobyte strings is not reported either.

## Related rules

- `LARGE_TABLES_SHOULD_BE_PARTITIONED` is the other rule about what a large table costs, and pbiplint lists it without running it for the same reason: the numbers it needs are statistics of the loaded data.
- `SPLIT_DATE_AND_TIME` is the other column-level statistics rule, and it is about the same problem from the other end: a column whose values are nearly all distinct.
- `UNNECESSARY_COLUMNS` reports a hidden column that nothing references, which pbiplint can check without any statistics. Where the long text column is hidden and unused, that rule names it and removing it from the query clears both.

## Links

- [Loading VertiPaq statistics into Tabular Editor's Best Practice Analyzer](https://www.elegantbi.com/post/vertipaqintabulareditor)

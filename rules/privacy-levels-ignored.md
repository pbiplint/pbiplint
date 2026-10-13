---
id: PRIVACY_LEVELS_IGNORED
name: "Privacy levels ignored for this file"
category: Error Prevention
severity: warning
scope: [Model]
status: builtin
layer: powerquery
video:
sources:
---

# Privacy levels ignored for this file

## What it checks

A model whose Power Query options ignore privacy levels: the `fastCombine` flag in the `dataAccessOptions` block of `model.tmdl`, which Power BI Desktop writes when Ignore the Privacy Levels and potentially improve performance is chosen for the file.

The finding is on the model, at the `fastCombine` line, with the detail `Ignore the Privacy Levels is on for this file; the service does not honor it`.

## Example

```tmdl fires
model Model
	culture: en-US
	dataAccessOptions
		fastCombine
		legacyRedirects
		returnErrorValuesAsNull
```

```tmdl fixed
model Model
	culture: en-US
	dataAccessOptions
		legacyRedirects
		returnErrorValuesAsNull
```

## Why it matters

The option changes how Power BI Desktop refreshes and nothing else. Microsoft is direct about it: "**Ignore the Privacy Levels and potentially improve performance** doesn't work for semantic models. Reports created in Power BI Desktop with this setting and published to the Power BI service don't adhere to the setting." ([Privacy levels, Set the privacy level options](https://learn.microsoft.com/power-query/privacy-levels#set-the-privacy-level-options)). A query that combines two sources can then refresh in Desktop and fail in the service with a firewall error, after it has been published and scheduled. The option also hides a risk while it works: "Enabling Fast Combine by selecting **Ignore the Privacy levels and potentially improve performance** could expose sensitive or confidential data to an unauthorized person." ([the same section](https://learn.microsoft.com/power-query/privacy-levels#set-the-privacy-level-options)). A query that sends values from a private source to a public one, such as a web lookup filtered by customer names, does so without a question.

## How to fix it

In Power BI Desktop, choose File, Options and settings, Options, then Privacy under Current file, and choose Combine data according to your Privacy Level settings for each source ([Set the privacy level options in Power BI Desktop](https://learn.microsoft.com/power-query/privacy-levels#set-the-privacy-level-options-in-power-bi-desktop)). Then refresh in Desktop. A query that only worked because privacy levels were ignored now shows the firewall error the service would have shown, while it is still easy to fix: set each source's privacy level under Data source settings, or restructure the queries, for example by moving a step that calls one source with values from another query into that query, as Microsoft's [Behind the scenes of the Data Privacy Firewall](https://learn.microsoft.com/power-query/data-privacy-firewall#example-passing-data-from-one-data-source-to-another) explains. In `model.tmdl`, the option is the `fastCombine` line under `dataAccessOptions`; deleting that line is the same change.

## When to ignore it

A model that is never published refreshes only in Desktop, where the option does what it says, and the warning then guards only against the data exposure above. If every source the model reads has the same owner and the same privacy level, that exposure does not arise, and a model kept on one machine can leave the option on. Anything published should have it off, since the service ignores it anyway.

## Quirks

- `legacyRedirects` and `returnErrorValuesAsNull`, which Power BI Desktop writes in the same block by default, are not reported.
- This rule reads no M. It is on the Power Query layer because Ignore the Privacy Levels is a Power Query option, so a reader who filters the rules to Power Query finds it there.

## Links

- [Privacy levels in Power Query](https://learn.microsoft.com/power-query/privacy-levels)
- [Behind the scenes of the Data Privacy Firewall](https://learn.microsoft.com/power-query/data-privacy-firewall)

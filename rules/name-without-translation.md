---
id: NAME_WITHOUT_TRANSLATION
name: "Visible name with no translation"
category: Naming Conventions
severity: info
scope: [Table, Column, CalculatedColumn, CalculatedTable, CalculatedTableColumn, CalculationGroupTable, Measure, Hierarchy, Level]
status: builtin
layer: model
video:
sources:
---

# Visible name with no translation

## What it checks

Visible tables, columns, measures, and hierarchies, and the levels of visible hierarchies, that a translated culture other than the model's own gives no caption.

Each finding names the object and, in its detail, the cultures it has no caption in, such as `no caption in fr-FR`. A culture is read when its file under `definition/cultures/` has a `translations` block; the model's own culture, named on the `culture:` line in `model.tmdl`, is not read.

## Example

```tmdl fires
model Model
	culture: en-US

table Sales
	measure Revenue = 1
		formatString: #,0

cultureInfo fr-FR
	translations
		model Model
			table Sales
				caption: Ventes
```

```tmdl fixed
model Model
	culture: en-US

table Sales
	measure Revenue = 1
		formatString: #,0

cultureInfo fr-FR
	translations
		model Model
			table Sales
				caption: Ventes
				measure Revenue
					caption: Chiffre d'affaires
```

## Why it matters

A caption is the name a reader sees for an object when a report is shown in that culture's language: Microsoft describes a translated caption as an alternative name that appears "when the report is rendered in a different language" ([Power BI support for metadata translation](https://learn.microsoft.com/power-bi/guidance/multiple-language-translation#power-bi-support-for-metadata-translation)). A model that carries translations for a language is meant to be read in it, so every visible name its culture leaves out is one its readers do not see in their language, beside the ones they do.

## How to fix it

Give the object a `caption` in the culture's `translations` block. Power BI Desktop has no editor for translations, and Microsoft gives its TMDL view as the route for metadata that lacks a graphical interface, "such as translations" ([Common use cases for TMDL view](https://learn.microsoft.com/power-bi/transform-model/desktop-tmdl-view#common-use-cases-for-tmdl-view)). In TMDL view, type `createOrReplace` on the first line of an empty tab, paste the whole `cultureInfo` block from `definition/cultures/<culture>.tmdl` beneath it, and indent the pasted lines one level, so the block sits under the command. Then give each object with no caption an entry in its place, with a `caption:` line one level beneath the entry, as the fixed example adds `measure Revenue` under `table Sales`: a table's entry goes under the `model` entry, a column's, measure's, or hierarchy's under its table's entry, and a level's under its hierarchy's entry. Where the block already has the object's entry, as it has a table's once any of the table's objects is captioned, add only the `caption:` line. Select Apply. Script the whole block: `createOrReplace` "Creates or replaces the specified semantic model objects and all the descendants" ([CreateOrReplace command](https://learn.microsoft.com/analysis-services/tmdl/tmdl-scripts#createorreplace-command)), so a script of part of it drops the captions it leaves out. Or edit the culture's file while Desktop is closed. For many objects at once, Microsoft's Translations Builder, an optional tool, can fill in captions, machine translations included ([Create multiple-language reports with Translations Builder](https://learn.microsoft.com/power-bi/guidance/translation-builder)).

## When to ignore it

When the culture's names are not meant for readers yet, such as a translation still in progress, or a culture kept for another purpose that happens to carry a `translations` block. Otherwise a visible object with no caption is one a reader in that language sees untranslated. A key or helper column no reader needs is better hidden than translated, which clears its finding too.

## Quirks

- A calculation group table is read like any other table, so a visible one with no caption is reported. The source rules do not read calculation group tables.
- An object counts as visible only when it and its table are not hidden, as pbiplint reads visibility elsewhere, so a hidden table, and a measure in one, are not reported. The source rules report both.
- A culture with no `translations` block is not read, so the culture file Power BI Desktop writes for the model's own language, which holds linguistic metadata only, never produces a finding. Tabular Editor's rules read every culture other than the model's own.
- The model's own culture is left out, as Microsoft advises: "You don't need to supply metadata translations for the default language of the semantic model" ([Organize project for metadata translation](https://learn.microsoft.com/power-bi/guidance/multiple-language-locale#organize-project-for-metadata-translation)). The community rules this rule follows leave it out too; Tabular Editor 3's built-in translation rules read it, so they report nearly every visible object in a model Desktop saved. With no `culture:` line in `model.tmdl`, every culture with a `translations` block is read.
- A caption equal to the object's name counts, as it does in Tabular Editor's rules, so a name that reads the same in both languages still needs its caption line. A caption of only spaces does not count.
- Descriptions and display folders are not read: Microsoft says they need translating only for report authors who work in the Power BI service ([Power BI support for metadata translation](https://learn.microsoft.com/power-bi/guidance/multiple-language-translation#power-bi-support-for-metadata-translation)). The model's name and perspective names are not read either; they are not among the object types Microsoft lists as translatable ([Metadata translation](https://learn.microsoft.com/power-bi/guidance/multiple-language-translation#metadata-translation)).
- While a model file has a parse issue that can take a declaration out of the model, such as a line indented with spaces, or pbiplint could not open a model file or folder at all, the rule reports nothing, because a caption, or the line that hides an object, could be in what pbiplint missed, and pbiplint does not guess what a file it could not read says. The skipped line gives the reason, `a model file could not be fully read`, and the file's own `PARSE_ISSUE` finding names it, or a notice does for a file or folder pbiplint could not open.

## Related rules

- `OBJECTS_WITH_NO_DESCRIPTION` reports visible objects with no description, the other text a reader sees about an object; this rule leaves descriptions out.
- `NOT_REACHED_FROM_REPORT` lists the columns and measures a report never reaches, which a reader of that report never sees in any language.

## Links

- [Plan translation for multiple-language reports in Power BI](https://learn.microsoft.com/power-bi/guidance/multiple-language-translation)
- [Tabular Editor's community rules, `BPARules-PowerBI.json`, at the commit this rule follows](https://github.com/TabularEditor/BestPracticeRules/blob/98e71e15fbd2a53d2e63d2b6bc3e99545461d501/BPARules-PowerBI.json)

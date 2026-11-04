---
id: LOW_TEXT_CONTRAST
name: "Text with too little contrast"
category: Accessibility
severity: warning
scope: [Visual, Report]
status: builtin
layer: report
video:
sources:
---

# Text with too little contrast

## What it checks

Report text whose colour is too close to what sits behind it, measured with the contrast ratio and thresholds of WCAG 2.2's Success Criterion 1.4.3: at least 4.5:1, or 3:1 for large text, which is at least 18 point, or 14 point and bold.

The text it measures: visual titles and subtitles, data labels, axis labels and titles, legends, the values and labels of cards, multi-row cards, and KPIs, table and matrix headers, values, and totals, slicer headers and items, button slicers, text box runs, and the text on buttons and shapes. Each colour is worked out the way Power BI Desktop paints it: a colour set on the visual, a theme colour it names (resolved through the report's custom theme and then its base theme, read from the project's `StaticResources` folder), and the theme's default where nothing is set. What sits behind the text is worked out the same way, layer by layer: the element's own background where it has one, the visual's background, the background of each group around it, the page, and the wallpaper, blended where they are partly transparent. Each state the file sets, such as hover or selected, and each field given its own colour, is measured too.

The defaults pbiplint uses where nothing sets a colour are the ones checks in Power BI Desktop have confirmed. Text takes a theme text class: a text box the `label` class, a visual title `largeTitle` (or `title` when no theme sets it), a subtitle and a legend `lightLabel`, a classic card's value `callout` and its category label `largeLightLabel`, a slicer's header and axis titles `title`, and axis labels `smallLightLabel` (or the theme's `foregroundNeutralSecondary` when no theme sets it). Table headers and values, slicer items, a new card's value, and a button slicer's text take the theme's `foreground`; a new card's label and data labels its `foregroundNeutralSecondary`. A background that is turned on with no colour is white; table cells, a new card, and a button slicer's buttons take the theme's `background`. Text whose default has not been confirmed that way, such as a button's or a shape's text with no colour set, is not measured, and neither is text whose visibility the files do not settle, apart from the three Power BI Desktop was seen to show when nothing turns them on: a classic card's category label, a chart's axis labels, and a slicer's header. A subtitle with no text, and a title with no text on a visual with no fields to name it by, is not drawn and not measured. Hidden pages and tooltip pages are measured, since readers reach them through drillthrough, navigation, and tooltips; a hidden visual, a visual in a hidden group, and text that is turned off are not.

Each finding names the visual and its detail names the text, both colours, the ratio, the threshold, where each colour came from, and a colour that passes, as in `Title: #A19F9D on #FFFFFF is 2.63:1, and 12 pt text needs 4.5:1. #787675 would be 4.51:1`. The suggested colour keeps the text's hue and changes only its lightness. When both colours come from the theme files, the finding is reported once, on the theme setting that gives the text its colour, and counts the visuals where it falls short. Text less than 1.1:1 from its background is the same colour as what is behind it, and its finding says so.

A report with no findings has not passed WCAG: this rule measures only the text whose colours the files settle, and the Quirks below say what it cannot see.

## Example

A text box whose text is a light grey on white.

```pbir fires visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "5b2c9e1a7d4f3086e1a2",
  "position": { "x": 40, "y": 40, "z": 1000, "height": 80, "width": 400, "tabOrder": 1000 },
  "visual": {
    "visualType": "textbox",
    "objects": {
      "general": [
        {
          "properties": {
            "paragraphs": [
              { "textRuns": [{ "value": "Figures exclude returns.", "textStyle": { "fontSize": "12pt", "color": "#A19F9D" } }] }
            ]
          }
        }
      ]
    },
    "visualContainerObjects": {
      "background": [
        {
          "properties": {
            "show": { "expr": { "Literal": { "Value": "true" } } },
            "color": { "solid": { "color": { "expr": { "Literal": { "Value": "'#FFFFFF'" } } } } },
            "transparency": { "expr": { "Literal": { "Value": "0D" } } }
          }
        }
      ]
    }
  }
}
```

```pbir fixed visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "5b2c9e1a7d4f3086e1a2",
  "position": { "x": 40, "y": 40, "z": 1000, "height": 80, "width": 400, "tabOrder": 1000 },
  "visual": {
    "visualType": "textbox",
    "objects": {
      "general": [
        {
          "properties": {
            "paragraphs": [
              { "textRuns": [{ "value": "Figures exclude returns.", "textStyle": { "fontSize": "12pt", "color": "#767676" } }] }
            ]
          }
        }
      ]
    },
    "visualContainerObjects": {
      "background": [
        {
          "properties": {
            "show": { "expr": { "Literal": { "Value": "true" } } },
            "color": { "solid": { "color": { "expr": { "Literal": { "Value": "'#FFFFFF'" } } } } },
            "transparency": { "expr": { "Literal": { "Value": "0D" } } }
          }
        }
      ]
    }
  }
}
```

## Why it matters

Text that is too close in colour to its background is hard to read for anyone with low vision, for people reading on a dim screen or in sunlight, and for many readers with a colour vision deficiency. WCAG explains its 4.5:1 for ordinary text this way: "The 4.5:1 ratio is used in this success criterion to account for the loss in contrast that results from moderately low visual acuity, congenital or acquired color deficiencies, or the loss of contrast sensitivity that typically accompanies aging" ([Understanding Success Criterion 1.4.3, Rationale for the Ratios Chosen](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html#rationale-for-the-ratios-chosen)). Microsoft's own accessibility checklist for Power BI reports asks for the same ratio between titles, axis labels, data labels, and their background. Teams that must meet an accessibility requirement, such as Section 508 for United States federal work, are asked about contrast.

## How to fix it

Change the text colour to one that passes, such as the suggested colour in the finding, which keeps the text's hue. In Power BI Desktop, select the visual, open the Format pane, find the text (Title, Data labels, X-axis, Values, and so on), and set its colour; for a text box, select the text and set its font colour. If the colour comes from the theme, change it once for every visual: on the Design ribbon, select Customize theme ([Visual defaults in Power BI reports, Customize current theme from the Theme pane](https://learn.microsoft.com/power-bi/create-reports/power-bi-reports-visual-defaults#customize-current-theme-from-the-theme-pane)), or edit the custom theme's JSON file, where the finding points. A base theme is Microsoft's own file and is not yours to edit, so override the colour in a custom theme instead. You can also edit the colour property in `visual.json` directly, at the line the finding names, and Power BI Desktop keeps the change.

Changing the background instead works too, but a background usually serves the whole visual or page, so check the other text on it afterwards.

Text that is the same colour as its background is usually there to be hidden. Hide the visual, or turn the text off, instead: a screen reader still reads hidden text, and a hidden button still takes the Tab key.

To make a contrast finding fail a build, as a team working to Section 508 may want, raise the rule to an error in `pbiplint.config.json`:

```json
{ "rules": { "LOW_TEXT_CONTRAST": "error" } }
```

## When to ignore it

WCAG's Success Criterion 1.4.3 sets no contrast requirement for text that is pure decoration, such as a watermark, for text that is part of a logo or brand name, or for text nobody can see. If the finding is on text like that, it can be ignored. Text a reader is meant to read is not decoration because it is small or secondary: a footnote or a faint axis label still counts. A disabled button's text needs no contrast either, and pbiplint already leaves that state out.

## Quirks

- **What it cannot see is skipped, and counted:** a colour that depends on the data (conditional formatting, a field value, or a rule); an image behind the text, on the visual, the page, or the wallpaper; a visual whose own layers are not opaque and whose box overlaps another visual below it, since what shows through is not in the files; a data label drawn on the data (inside a bar, a column, or a slice) unless it has an opaque background of its own; a theme file the report names that is not in the project or is larger than 5 MB; and a default colour no Desktop check has confirmed.
- **Size:** sizes are compared as written, at Actual size. A ratio from 3:1 up to 4.5:1 on text of unknown size is skipped; one under 3:1 is reported whatever the size.
- **Semibold is not bold.** Text from 14 to under 18 point needs 4.5:1 unless it is bold, and a Semibold font is read as not bold.
- **How colours were confirmed:** in Power BI Desktop, a theme colour's first two positions are white and black whatever the theme, a theme colour's shade is a straight blend toward white or black, and transparency is held as a whole byte. On a page set like the Fluent2 theme's, with `#FAFAFA` at transparency 14 over a `#E6E6E6` wallpaper, Desktop paints one unit lighter than pbiplint works out, which moves a ratio by about 0.01.
- **What is shown when nothing says:** under a Fluent 2 base theme, titles and subtitles are measured and axis titles are not, whether or not the theme's file is in the project, as Microsoft documents them: "Titles and subtitles are on by default; axis titles are off by default" ([Visual defaults in Power BI reports, Uniform visual styling](https://learn.microsoft.com/power-bi/create-reports/power-bi-reports-visual-defaults#uniform-visual-styling)). Under another base theme, text whose visibility nothing sets is counted as not known, apart from the three Power BI Desktop was seen to show.
- **Tooltips and the visual header** are not measured; non-text contrast (chart marks, icons, and controls) is not part of this rule.

## Related rules

- `ENSURE_THEME_COLOURS` asks for theme colours over hand-set ones, so a contrast fix made in the theme reaches every visual at once.
- `ENSURE_ALTTEXT` and `TAB_ORDER_FOLLOWS_LAYOUT` check the report's other accessibility basics.

## Links

- [WCAG 2.2, Success Criterion 1.4.3, Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum)
- [Understanding Success Criterion 1.4.3, Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [WCAG 2.2, the definitions of relative luminance and contrast ratio](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)
- [Design Power BI reports for accessibility, the report accessibility checklist](https://learn.microsoft.com/power-bi/create-reports/desktop-accessibility-creating-reports#all-visuals)
- [Use report themes in Power BI](https://learn.microsoft.com/power-bi/create-reports/desktop-report-themes)
- [Create a custom report theme in Power BI](https://learn.microsoft.com/power-bi/create-reports/report-themes-create-custom)

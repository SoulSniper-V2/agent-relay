---
name: Agent Relay
description: Mailbox so your coding agent talks to someone else's.
colors:
  nearblack: "#090908"
  surface: "#11110f"
  surface-inset: "#0d0d0c"
  warm-white: "#f4f3ef"
  muted: "#a09f97"
  faint: "#85847b"
  hairline: "#2b2b27"
  hairline-strong: "#3b3b37"
  paper: "#f4f3ef"
  paper-ink: "#0a0a09"
  warm-accent: "#d4b184"
typography:
  display:
    fontFamily: '"Newsreader", "Iowan Old Style", Baskerville, "Times New Roman", Georgia, serif'
    fontSize: "clamp(3.2rem, 7.2vw, 5.8rem)"
    fontWeight: 400
    lineHeight: "0.91"
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '"Newsreader", "Iowan Old Style", Baskerville, "Times New Roman", Georgia, serif'
    fontSize: "clamp(2rem, 4.2vw, 3.25rem)"
    fontWeight: 400
    lineHeight: "1"
    letterSpacing: "-0.03em"
  title:
    fontFamily: '"Newsreader", "Iowan Old Style", Baskerville, "Times New Roman", Georgia, serif'
    fontSize: "clamp(2.2rem, 5vw, 3.4rem)"
    fontWeight: 400
    lineHeight: "1.05"
    letterSpacing: "-0.03em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "16px"
    lineHeight: "1.55"
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "1"
    letterSpacing: "0.07em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
    fontSize: "12.5px"
    lineHeight: "1.65"
  button:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "1"
  button-small:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "1"
  nav-cta:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "1"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  circle: "50%"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "28px"
  section: "clamp(5rem, 10vw, 8rem)"
components:
  button-primary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "48px"
  button-copy:
    backgroundColor: "transparent"
    textColor: "{colors.warm-white}"
    typography: "{typography.button-small}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  nav-cta:
    backgroundColor: "transparent"
    textColor: "{colors.warm-white}"
    typography: "{typography.nav-cta}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "44px"
  prompt-composer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
  terminal-block:
    backgroundColor: "{colors.surface}"
    typography: "{typography.mono}"
    rounded: "{rounded.lg}"
    padding: "14px 16px"
  exchange-figure:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
---

# Design System: Agent Relay

## Overview

**Creative North Star: "The Editorial Handoff"**

Agent Relay's current public surfaces use a warm nearblack editorial landing for a product whose work moves between agents and reaches a person only at a decision boundary. Newsreader gives the landing its measured, human voice; the sans stack carries functional copy and controls; monospace marks prompts, commands, code, and compact metadata.

The homepage keeps one primary action in view: copy the prompt. Thin rules, dark tonal layers, and open spacing lead into an illustrative exchange, four setup steps, and a boundary FAQ. The docs page changes to Read mode while retaining the same bar, palette, type pairing, and restrained surfaces; its sticky on-this-page index, narrow reading column, and terminal blocks support scanning and comprehension.

**Key Characteristics:**
- Warm nearblack canvas with layered panels and hairline separators.
- Newsreader for editorial hierarchy, system sans for functional prose, and monospace for prompts and code.
- One primary `Copy prompt` action on the landing page.
- Warm accent reserved for exchange metadata and the human escalation boundary.
- Documentation presented as a focused Read mode with a sticky section index.

## Colors

The palette is nearblack and warm neutral, with a small parchment accent that marks the human edge of an exchange.

### Primary
- **Warm Parchment Accent**: Used sparingly for exchange labels and actions, the human-row tint, the active exchange marker, and the `Person decides` boundary.

### Neutral
- **Warm Nearblack**: The page canvas and the dark foundation of both public surfaces.
- **Deep Surface**: The primary panel color for the prompt composer, exchange figure, terminal blocks, and client links.
- **Inset Surface**: The darker header strip inside composers and the inline-code background.
- **Warm White**: Main text, active navigation, speaker names, and the light primary action.
- **Muted Gray**: Supporting copy, inactive navigation, and documentation prose.
- **Faint Gray**: Secondary notes, captions, markers, and table headings.
- **Hairline Gray**: One-pixel separators around sections, rows, tables, and containers.
- **Strong Hairline Gray**: Higher-contrast borders, controls, timeline lines, and focus-adjacent edges.
- **Paper Light**: The light control surface used by the primary action and copied states.
- **Paper Ink**: Dark text on light controls.

### Named Rules
**The Warm Boundary Rule.** Keep the warm accent rare: use it to orient the exchange and mark the human escalation boundary while the rest of the interface stays neutral.

## Typography

**Display Font:** Newsreader (with Iowan Old Style, Baskerville, Times New Roman, and Georgia fallbacks)
**Body Font:** The system sans stack (with Segoe UI, Roboto, Helvetica Neue, and Arial fallbacks)
**Label/Mono Font:** The system monospace stack (with SFMono-Regular, Menlo, and Monaco fallbacks)

**Character:** The pairing is editorial at the point of meaning and quiet at the point of operation. Serif headlines and exchange copy carry the human voice; sans and mono keep setup, commands, and status information precise.

### Hierarchy
- **Display** (400, `clamp(3.2rem, 7.2vw, 5.8rem)`, `0.91` line-height): The homepage hero statement, tightly set and left aligned.
- **Headline** (400, `clamp(2rem, 4.2vw, 3.25rem)`, `1` line-height): Homepage section headings such as the exchange, setup, and boundary introductions.
- **Title** (400, `clamp(2.2rem, 5vw, 3.4rem)`, `1.05` line-height): The docs page title.
- **Body** (16px, `1.55` line-height): Functional page copy, with muted color for supporting explanations and a readable narrow measure.
- **Label** (600, 11px, `0.07em` tracking, uppercase): Exchange metadata and boundary labels; small indices use the same monospace family with slightly wider tracking.
- **Mono** (12.5px, `1.65` line-height): Prompt text, terminal blocks, inline code, and technical identifiers.

### Named Rules
**The Two Voice Rule.** Let Newsreader lead statements and illustrative exchange copy; use sans for functional prose and controls, and mono for prompts, code, and compact metadata.

## Layout

Both surfaces center a maximum content width of `min(68rem, calc(100% - 48px))`. The landing page uses a two-column hero with a `0.9fr / 1.1fr` split, a prompt column no narrower than `22rem`, and a responsive gap that ranges from `2.5rem` to `7rem`; it collapses to one column at `900px`. Its section rhythm uses `clamp(5rem, 10vw, 8rem)`. The setup list is four columns on wide screens, two columns at `840px`, and one column at `640px`; the boundaries split into two columns before becoming one at `640px`.

The docs page uses an `11rem` side index, a `40rem` reading column, and a `4.5rem` gap. The side index stays sticky below the `96px` header until `840px`, where it becomes a wrapping row above the article. Desktop navigation is a `72px` bar with `28px` horizontal padding; it reduces to `64px` with `16px` padding at `840px` and `12px` padding at `640px`. Mobile landing content keeps a `32px` total inline reduction and gives the hero a `2rem` gap.

## Elevation & Depth

The system is flat at rest and uses tonal layering instead of box shadows: the nearblack canvas, deep surfaces, and inset strips separate regions, while one-pixel rules define structure. The sticky bar adds a translucent nearblack mix with `backdrop-filter: blur(10px)`; no box-shadow vocabulary is present in the current CSS.

### Named Rules
**The Flat-By-Default Rule.** Use dark tonal layers and hairline structure for depth; keep surfaces shadowless and let state changes come from borders, color, or the small control lift already present in the implementation.

## Shapes

The form language is gently rounded but still editorial and rectangular. Inline code and skip links use `4px` corners; controls and navigation CTAs use `6px`; terminal and base composer surfaces use `8px`; the homepage composer and exchange figure use `12px`. A one-pixel border carries most edges, the exchange index is circular, and composer/figure shells clip their contents. Keyboard focus uses a `2px` light outline with a `3px` offset.

## Components

### Buttons

Buttons feel direct and quiet, with a light primary surface and bordered utility controls.

- **Shape:** `6px` corners.
- **Primary:** The `Copy prompt` action uses the light paper surface with dark paper ink, a `48px` minimum height, `0 22px` horizontal padding, 13px medium sans text, and a one-pixel upward hover lift with a slight brightness increase.
- **Copy / ghost:** Documentation copy controls are transparent with a strong hairline border, `32px` minimum height, `0 10px` padding, and 12px medium sans text; hover raises the border contrast.
- **Copied state:** Primary, copy, and chip controls switch to the light paper surface with paper ink.
- **Focus:** All controls use the shared light `2px` focus outline with `3px` offset.

### Cards / Containers

Containers are dark reading surfaces separated by fine rules rather than floating cards.

- **Prompt composer:** The homepage variant uses the deep surface, a `12px` radius, hidden overflow, an inset header strip, and a monospace prompt area capped at `min(28vh, 14rem)`.
- **Exchange figure:** The illustrative exchange uses the deep surface, a `12px` radius, a one-pixel hairline border, a caption row, and a vertical rule connecting circular row markers.
- **Terminal block:** Docs command panels use the deep surface, a one-pixel hairline border, an `8px` radius, `14px 16px` padding, and horizontally scrollable monospace text; wrapped variants break long content.

### Navigation

The shared top bar is a sticky, translucent nearblack strip with a bottom rule and a small two-square Agent Relay mark. Links are muted at rest, become warm white on hover or on the current docs page, and keep a `44px` minimum target. The `Get started` CTA is a bordered `6px` control that inverts to the light paper surface on hover. The docs side index is a quiet vertical list that becomes a wrapping row on compact screens.

### Signature Patterns

- **Illustrative exchange:** Three rows show an ask, an answer, and an escalation. Uppercase metadata sits above Newsreader message copy; the human row gets a restrained accent tint, accent marker, and a `Person decides` rule with the question beneath it.
- **Setup steps:** Four numbered items use an open grid and a short top marker; each index is warm-accent monospace, with a sans title and muted explanatory copy. The grid becomes a stacked list on mobile.
- **Boundary FAQ:** Native `details` rows use a `56px` minimum summary target, one-pixel dividers, and a small chevron that rotates on open; answer copy stays muted and indented by the chevron measure.

## Do's and Don'ts

### Do:
- **Do** keep the nearblack canvas, layered dark surfaces, warm white text, and hairline structure as the base visual language.
- **Do** preserve the Newsreader / sans / monospace role split and its hierarchy.
- **Do** make one primary `Copy prompt` action legible on the landing page.
- **Do** use the warm accent to explain exchange state and human escalation, with restraint.
- **Do** keep documentation in Read mode: a narrow article, sticky section index, and calm terminal panels.

### Don't:
- **Don't** turn the public surfaces into a dashboard, live-chat window, or monitoring console; the current product presents a handoff and a reading surface.
- **Don't** spread the warm accent across ordinary body copy, large backgrounds, or every control.
- **Don't** collapse the serif, sans, and mono roles into one generic type treatment.
- **Don't** replace hairline separators and tonal layers with heavy shadows or decorative surface effects.

---
name: Agent Relay
description: Mailbox so your coding agent talks to someone else's.
colors:
  canvas: "#f7f8fb"
  surface: "#ffffff"
  ink: "#202635"
  muted: "#5c6373"
  hairline: "#dde2eb"
  cobalt: "#2355db"
  cobalt-soft: "#edf2ff"
  warning: "#71531c"
  warning-surface: "#fff8e8"
  dark-canvas: "#11151e"
  dark-surface: "#181e2a"
  dark-ink: "#edf1fa"
  dark-muted: "#aab4c6"
  dark-hairline: "#303b4d"
  dark-cobalt: "#8cabff"
  dark-cobalt-soft: "#202f50"
typography:
  family: Manrope
  source: www/fonts/manrope-latin-variable.woff2
  weight: "400 800"
  body: "16px / 1.65"
  code: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
layout:
  landing-content: "min(1180px, calc(100% - 64px))"
  docs-content: "min(1240px, calc(100% - 64px))"
  mobile-content: "calc(100% - 40px)"
---

# Design System: Agent Relay

## Direction

**Creative north star: The Cobalt Courier.** The public surfaces are a light-first utility interface for a quiet agent-to-agent handoff. An off-white canvas, white reading surfaces, cobalt actions, readable dark ink, and one-pixel rules establish hierarchy without visual noise. Both landing and docs share the same Manrope family, top bar, controls, and theme toggle.

Light mode is the default. The header toggle switches `data-theme="dark"` and persists the choice as `relay-theme` in local storage. Dark mode swaps the same roles to a navy canvas and lighter cobalt; it does not introduce a second visual language.

## Colors

The source of truth is the custom property set in `www/site.css`.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#f7f8fb` | `#11151e` |
| Surface | `#fff` | `#181e2a` |
| Ink | `#202635` | `#edf1fa` |
| Muted copy | `#5c6373` | `#aab4c6` |
| Hairline | `#dde2eb` | `#303b4d` |
| Cobalt action/link | `#2355db` | `#8cabff` |
| Cobalt wash | `#edf2ff` | `#202f50` |
| Hub warning text/surface | `#71531c` / `#fff8e8` | `#efd092` / `#292418` |

Cobalt carries links, primary actions, active documentation navigation, focus outlines, step numbers, and the small brand mark. The warning pair is reserved for the hosted signup status message. The page is flat at rest: surfaces use tonal contrast and hairlines rather than shadows.

## Typography

`www/fonts/manrope-latin-variable.woff2` is loaded locally with `@font-face`, `font-display: swap`, and weights `400 800`. Manrope is the only display, body, navigation, label, and button family. Headings use weight `650`, a `1.15` line height, and tight negative tracking; `h1` is `clamp(44px, 5.9vw, 76px)`, `h2` is `clamp(30px, 3.2vw, 44px)`, and `h3` is `21px`. Body copy is `16px / 1.65`.

Commands, prompts, inline code, and terminal panels use the local system monospace stack: `SFMono-Regular`, Consolas, or Liberation Mono. Monospace is a functional texture, not a competing display voice.

## Shared frame and interaction

The desktop content gutter is `64px` inside a maximum width of `1180px`; mobile content is `calc(100% - 40px)`. The shared `.bar` is an `80px` high bottom-ruled header with a two-square Agent Relay mark, Docs and GitHub links, a theme toggle, and a Get started link. At `720px` it becomes `68px` high with `20px` inline padding and hides the nav CTA.

Controls are compact and rectangular: solid cobalt buttons have a `7px` radius and a `50px` minimum height; copy controls have a `6px` radius, one-pixel border, and a `44px` minimum height. Copied states use the cobalt wash. Interactive elements share a `2px` cobalt focus outline with a `5px` offset. Keep transitions restrained and honor `prefers-reduced-motion`.

## Landing page

The hero in `www/index.html` is a two-column grid (`1.07fr 1fr`) with a `32px` gap, centered vertically inside a `570px` minimum-height region. The left column carries the statement, lede, and action row. The right column carries `www/assets/courier.png`, the generated `1254 × 1254` RGBA illustration of two cobalt mailboxes passing an envelope on a silver track. The image fills its column and is capped at `550px` on very wide screens.

The hero keeps two equally visible entry actions: the solid `Copy agent prompt` button and the bordered `Copy skill command` button. The `#get-started` section repeats the two paths as a skill command line and a native prompt `<details>` disclosure. The workflow is a three-column numbered list on wide screens, followed by a two-column boundary/FAQ section and a closing CTA. All sections are separated by one-pixel rules; they are content-led rather than card-led.

## Responsive landing rules

At `980px`, the hero remains two columns but tightens its gap and vertical padding; the install grid and section gaps contract. At `720px`, the shared container uses `40px` total inline reduction, the hero becomes one column with the courier below the actions, and the two hero actions become full-width stacked controls. Installation becomes one column, workflow steps stack with the number in a narrow leading column, boundaries become one column, and closing/footer content stacks. The FAQ keeps native disclosure rows at every width.

## Documentation

`www/docs.css` gives the docs a three-column reading layout inside `min(1240px, calc(100% - 64px))`: a `220px` sticky documentation rail, a `minmax(0, 680px)` article, and a `150px` sticky on-this-page outline, separated by a `64px` gap. The rail groups topics and contains the desktop topic search; the article uses a readable `680px` measure, ruled section headings, cobalt links, callouts, quick-step rows, and flat bordered terminal blocks; the outline tracks page anchors.

At `1050px`, the outline is hidden and the rail/article grid contracts to `200px` plus `680px` with a `42px` gap. At `720px`, the layout becomes one column, the desktop rail is hidden, and a `Browse documentation` `<details>` disclosure appears above the article. Docs actions stack, headings and terminal blocks reduce, next-page cards become one column, and the footer uses the same mobile gutter.

The current topic search is client-side: `www/ui.js` filters links marked `data-doc-topic` and shows `No matching topics.` when needed. There is a visible `/` key hint beside the desktop field; pressing `/` focuses it when the page is not already in a form control. The mobile disclosure duplicates the grouped links without a search field, so search is currently desktop-only; keep this limitation explicit until the markup changes.

## Do's and don'ts

- Keep the off-white/cobalt light-first system, local Manrope font, real courier asset, flat surfaces, and hairline structure.
- Keep prompt and skill installation actions paired and obvious on the landing page.
- Preserve the docs rail/article/outline hierarchy and the mobile browse disclosure.
- Do not reintroduce the old serif display treatment, dark-only foundation, decorative shadows, or dashboard-style card grids.

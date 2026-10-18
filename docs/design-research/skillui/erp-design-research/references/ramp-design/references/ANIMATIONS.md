# Animation Reference

> Cinematic motion design extracted from live DOM. Follow these specs exactly to recreate the experience.

## Motion Technology Stack

| Library | Type | Notes |
|---------|------|-------|
| Canvas (9 elements) | WebGL/3D | WebGL context detected — likely Three.js or custom shader |

## Scroll Journey

The page is **14,554px** tall. Each frame below shows what the user sees at that scroll depth.

> **Use these screenshots to understand WHAT animates, WHEN it animates, and HOW it moves.**

### 0% — Top / Hero
Scroll position: 0px

![Scroll 0%](../screens/scroll/scroll-000.png)

### 17% — Opening Section
Scroll position: 2,321px

![Scroll 17%](../screens/scroll/scroll-017.png)

### 33% — First Feature Section
Scroll position: 4,506px

![Scroll 33%](../screens/scroll/scroll-033.png)

### 50% — Mid-Page
Scroll position: 6,827px

![Scroll 50%](../screens/scroll/scroll-050.png)

### 67% — Lower Content
Scroll position: 9,148px

![Scroll 67%](../screens/scroll/scroll-067.png)

### 83% — Near Footer
Scroll position: 11,333px

![Scroll 83%](../screens/scroll/scroll-083.png)

### 100% — Bottom / Footer
Scroll position: 13,652px

![Scroll 100%](../screens/scroll/scroll-100.png)

## Video Elements

| # | Role | Autoplay | Loop | Muted | Size | First Frame |
|---|------|----------|------|-------|------|-------------|
| 1 | content | ✓ | ✓ | ✓ | — | — |
| 2 | background | ✓ | ✓ | ✓ | 1310×584 | [view](../screens/scroll/video-2-frame.png) |
| 3 | content | ✓ | ✓ | ✓ | 753×753 | — |

- **Source:** `https://assets.ramp.com/nextjs/videos/homepage-hero-mobile-423.webm`
**Video 2 first frame:**

![Video 2 Frame](../screens/scroll/video-2-frame.png)

- **Source:** `https://assets.ramp.com/nextjs/videos/homepage-hero-423.webm`
- **Source:** `https://assets.ramp.com/nextjs/videos/homepage-perplexity-thumbnail.mp4`

## Scroll Animation Patterns

| Pattern | Library | Element Count | Duration | Delay | Easing |
|---------|---------|---------------|----------|-------|--------|
| parallax / sticky scroll | CSS | 1 | — | — | — |

### CSS Implementation

## CSS Keyframes (45 extracted)

### `@keyframes constructionClouds-module__3i1Joq__cloudBob`

Duration: `auto` · Easing: `ease-in-out` · Delay: `0s` · Iteration: `infinite` · Fill: `none`

Used by: `.constructionClouds-module__3i1Joq__cloudBob1, .constructionClouds-module__3i1Jo`, `.constructionClouds-module__3i1Joq__moneyBob1, .constructionClouds-module__3i1Jo`

```css
@keyframes constructionClouds-module__3i1Joq__cloudBob {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-12px);
  }
}
```

> Transform/motion animation

### `@keyframes arrow-slide`

Duration: `0.5s` · Easing: `ease-in-out` · Delay: `0s` · Iteration: `1` · Fill: `forwards`

Used by: `.animate-arrow-slide`

```css
@keyframes arrow-slide {
  0% {
    opacity: 1;
    transform: translate(0px);
  }
  20% {
    opacity: 0;
    transform: translate(8px);
  }
  40% {
    opacity: 0;
    transform: translate(-8px);
  }
  60% {
    opacity: 0;
    transform: translate(-8px);
  }
  100% {
    opacity: 1;
    transform: translate(0px);
  }
}
```

> Fade + motion enter animation

### `@keyframes accordion-down`

Duration: `0.2s` · Easing: `ease-out` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.animate-accordion-down`

```css
@keyframes accordion-down {
  0% {
    height: 0px;
  }
  100% {
    height: var(--radix-accordion-content-height,var(--bits-accordion-content-height,var(--reka-accordion-content-height,var(--kb-accordion-content-height,var(--ngp-accordion-content-height,auto)))));
  }
}
```

> Dimension expand/collapse

### `@keyframes accordion-up`

Duration: `0.2s` · Easing: `ease-out` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.animate-accordion-up`

```css
@keyframes accordion-up {
  0% {
    height: var(--radix-accordion-content-height,var(--bits-accordion-content-height,var(--reka-accordion-content-height,var(--kb-accordion-content-height,var(--ngp-accordion-content-height,auto)))));
  }
  100% {
    height: 0px;
  }
}
```

> Dimension expand/collapse

### `@keyframes slideDownAndFade`

Duration: `0.4s` · Easing: `cubic-bezier(0.16, 1, 0.3, 1)` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.animate-slideDownAndFade`

```css
@keyframes slideDownAndFade {
  0% {
    opacity: 0;
    transform: translateY(-2px);
  }
  100% {
    opacity: 1;
    transform: translateY(0px);
  }
}
```

> Fade + motion enter animation

### `@keyframes slideLeftAndFade`

Duration: `0.4s` · Easing: `cubic-bezier(0.16, 1, 0.3, 1)` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.animate-slideLeftAndFade`

```css
@keyframes slideLeftAndFade {
  0% {
    opacity: 0;
    transform: translate(2px);
  }
  100% {
    opacity: 1;
    transform: translate(0px);
  }
}
```

> Fade + motion enter animation

### `@keyframes slideUpAndFade`

Duration: `0.4s` · Easing: `cubic-bezier(0.16, 1, 0.3, 1)` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.animate-slideUpAndFade`

```css
@keyframes slideUpAndFade {
  0% {
    opacity: 0;
    transform: translateY(2px);
  }
  100% {
    opacity: 1;
    transform: translateY(0px);
  }
}
```

> Fade + motion enter animation

### `@keyframes slideRightAndFade`

Duration: `0.4s` · Easing: `cubic-bezier(0.16, 1, 0.3, 1)` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.animate-slideRightAndFade`

```css
@keyframes slideRightAndFade {
  0% {
    opacity: 0;
    transform: translate(-2px);
  }
  100% {
    opacity: 1;
    transform: translate(0px);
  }
}
```

> Fade + motion enter animation

### `@keyframes spin`

Duration: `1s` · Easing: `linear` · Delay: `0s` · Iteration: `infinite` · Fill: `none`

Used by: `.fides-spinner`

```css
@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}
```

> Transform/motion animation

### `@keyframes nav-out`

Duration: `0.15s` · Easing: `ease-in-out` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.nav-sheet[data-state="closed"]`

```css
@keyframes nav-out {
  0% {
    transform: translateY(0px);
  }
  100% {
    transform: translateY(calc(-100% - 56px));
  }
}
```

> Transform/motion animation

### `@keyframes nav-in`

Duration: `0.3s` · Easing: `cubic-bezier(0, 0.55, 0.45, 1)` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.nav-sheet[data-state="open"]`

```css
@keyframes nav-in {
  0% {
    transform: translateY(calc(-100% - 56px));
  }
  100% {
    transform: translateY(0px);
  }
}
```

> Transform/motion animation

### `@keyframes PopupLightbox-module__sYoECq__overlayShow`

Duration: `0.3s` · Easing: `cubic-bezier(0.4, 0, 0.2, 1)` · Delay: `0s` · Iteration: `1` · Fill: `forwards`

Used by: `.PopupLightbox-module__sYoECq__lightbox-overlay`

```css
@keyframes PopupLightbox-module__sYoECq__overlayShow {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 0.25;
  }
}
```

> Opacity fade

### `@keyframes PopupLightbox-module__sYoECq__contentShow`

Duration: `0.3s` · Easing: `cubic-bezier(0.4, 0, 0.2, 1)` · Delay: `0s` · Iteration: `1` · Fill: `forwards`

Used by: `.PopupLightbox-module__sYoECq__lightbox-content`

```css
@keyframes PopupLightbox-module__sYoECq__contentShow {
  0% {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.96);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
```

> Fade + motion enter animation

### `@keyframes PersonalizeClient-module__bf7S1a__personalization-border-trace`

Duration: `3.4s` · Easing: `linear` · Delay: `0s` · Iteration: `infinite` · Fill: `none`

Used by: `.PersonalizeClient-module__bf7S1a__borderTracer::before`

```css
@keyframes PersonalizeClient-module__bf7S1a__personalization-border-trace {
  100% {
    --personalization-trace-angle: 360deg;
  }
}
```

### `@keyframes PersonalizeClient-module__bf7S1a__personalization-status-wash`

Duration: `1.8s` · Easing: `linear` · Delay: `0s` · Iteration: `infinite` · Fill: `none`

Used by: `.PersonalizeClient-module__bf7S1a__personalizingWash`

```css
@keyframes PersonalizeClient-module__bf7S1a__personalization-status-wash {
  100% {
    background-position-x: 0px;
    background-position-y: center;
  }
}
```

> Background color/gradient shift · Background position (shimmer/scroll)

### `@keyframes constructionClouds-module__3i1Joq__cloudDrift`

Duration: `auto` · Easing: `linear` · Delay: `0s` · Iteration: `infinite` · Fill: `none`

Used by: `.constructionClouds-module__3i1Joq__cloud`

```css
@keyframes constructionClouds-module__3i1Joq__cloudDrift {
  0% {
    translate: -100vw;
  }
  100% {
    translate: 100vw;
  }
}
```

### `@keyframes KbMediaAccordion-module__N0Z4LW__accordionItem`

Duration: `0.3s` · Easing: `linear` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.KbMediaAccordion-module__N0Z4LW__accordionItem`

```css
@keyframes KbMediaAccordion-module__N0Z4LW__accordionItem {
  0% {
    transform: scaleX(0);
  }
  100% {
    transform: scaleX(1);
  }
}
```

> Transform/motion animation

### `@keyframes WistiaDialogClient-module__8XEj-W__contentFadeIn`

Duration: `0.3s` · Easing: `cubic-bezier(0.4, 0, 0.2, 1)` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.WistiaDialogClient-module__8XEj-W__wistiaContent`

```css
@keyframes WistiaDialogClient-module__8XEj-W__contentFadeIn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
```

> Opacity fade

### `@keyframes PlatformCard-module__MXf3fW__platform-card-arrow-out-45`

Duration: `0.5s` · Easing: `ease-in-out` · Delay: `0s` · Iteration: `1` · Fill: `forwards`

Used by: `.PlatformCard-module__MXf3fW__root:hover .PlatformCard-module__MXf3fW__arrowIcon`

```css
@keyframes PlatformCard-module__MXf3fW__platform-card-arrow-out-45 {
  0% {
    opacity: 1;
    transform: translate(0px);
  }
  20% {
    opacity: 0;
    transform: translate(8px, -8px);
  }
  40% {
    opacity: 0;
    transform: translate(-8px, 8px);
  }
  60% {
    opacity: 0;
    transform: translate(-8px, 8px);
  }
  100% {
    opacity: 1;
    transform: translate(0px);
  }
}
```

> Fade + motion enter animation

### `@keyframes CardComparisonModal-module__BRoqIa__overlayShow`

Duration: `0.2s` · Easing: `cubic-bezier(0.4, 0, 0.2, 1)` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.CardComparisonModal-module__BRoqIa__modal-overlay`

```css
@keyframes CardComparisonModal-module__BRoqIa__overlayShow {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
```

> Opacity fade

### `@keyframes CardComparisonModal-module__BRoqIa__contentShow`

Duration: `0.2s` · Easing: `cubic-bezier(0.4, 0, 0.2, 1)` · Delay: `0s` · Iteration: `1` · Fill: `none`

Used by: `.CardComparisonModal-module__BRoqIa__modal-content`

```css
@keyframes CardComparisonModal-module__BRoqIa__contentShow {
  0% {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.96);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
```

> Fade + motion enter animation

### `@keyframes ConstructionAnimatedScrollHero-module__CQVgEG__crane-lower-translate`

Duration: `2.5s` · Easing: `cubic-bezier(0.22, 1, 0.36, 1)` · Delay: `0s` · Iteration: `1` · Fill: `both`

Used by: `.ConstructionAnimatedScrollHero-module__CQVgEG__craneLowerTranslate`

```css
@keyframes ConstructionAnimatedScrollHero-module__CQVgEG__crane-lower-translate {
  0% {
    transform: translateY(-60px);
  }
  100% {
    transform: translateY(0px);
  }
}
```

> Transform/motion animation

### `@keyframes ConstructionAnimatedScrollHero-module__CQVgEG__crane-lower-translate-mobile`

Duration: `2.5s` · Easing: `cubic-bezier(0.22, 1, 0.36, 1)` · Delay: `0s` · Iteration: `1` · Fill: `both`

Used by: `.ConstructionAnimatedScrollHero-module__CQVgEG__craneLowerTranslateMobile`

```css
@keyframes ConstructionAnimatedScrollHero-module__CQVgEG__crane-lower-translate-mobile {
  0% {
    transform: translate(-50%, -60px);
  }
  100% {
    transform: translate(-50%);
  }
}
```

> Transform/motion animation

### `@keyframes ConstructionAnimatedScrollHero-module__CQVgEG__crane-lower-fade`

Duration: `1s` · Easing: `cubic-bezier(0.22, 1, 0.36, 1)` · Delay: `0s` · Iteration: `1` · Fill: `both`

Used by: `.ConstructionAnimatedScrollHero-module__CQVgEG__craneLowerFade`

```css
@keyframes ConstructionAnimatedScrollHero-module__CQVgEG__crane-lower-fade {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
```

> Opacity fade

### `@keyframes swipe-out`

Duration: `0.2s` · Easing: `ease-out` · Delay: `0s` · Iteration: `1` · Fill: `forwards`

Used by: `[data-sonner-toast][data-swipe-out="true"][data-y-position="bottom"], [data-sonn`

```css
@keyframes swipe-out {
  0% {
    transform: translateY(calc(var(--lift) * var(--offset) + var(--swipe-amount)));
    opacity: 1;
  }
  100% {
    transform: translateY(calc(var(--lift) * var(--offset) + var(--swipe-amount) + var(--lift) * -100%));
    opacity: 0;
  }
}
```

> Fade + motion enter animation

### `@keyframes sonner-fade-in`

Duration: `0.3s` · Easing: `ease` · Delay: `0s` · Iteration: `1` · Fill: `forwards`

Used by: `:where([data-sonner-toast][data-promise="true"]) :where([data-icon]) > svg`

```css
@keyframes sonner-fade-in {
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
```

> Fade + motion enter animation

### `@keyframes sonner-fade-out`

Duration: `0.2s` · Easing: `ease` · Delay: `0s` · Iteration: `1` · Fill: `forwards`

Used by: `.sonner-loading-wrapper[data-visible="false"]`

```css
@keyframes sonner-fade-out {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.8);
  }
}
```

> Fade + motion enter animation

### `@keyframes sonner-spin`

Duration: `1.2s` · Easing: `linear` · Delay: `0s` · Iteration: `infinite` · Fill: `none`

Used by: `.sonner-loading-bar`

```css
@keyframes sonner-spin {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0.15;
  }
}
```

> Opacity fade

### `@keyframes spin`

Duration: `1s` · Easing: `linear` · Delay: `0s` · Iteration: `infinite` · Fill: `none`

Used by: `.fides-spinner`

```css
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(1turn);
  }
}
```

> Transform/motion animation

### `@keyframes fides-skeleton-loading`

Duration: `1.4s` · Easing: `ease` · Iteration: `infinite`

Used by: `.fides-skeleton__component`

```css
@keyframes fides-skeleton-loading {
  0% {
    background-position-x: 100%;
    background-position-y: 50%;
  }
  100% {
    background-position-x: 0px;
    background-position-y: 50%;
  }
}
```

> Background color/gradient shift · Background position (shimmer/scroll)

### `@keyframes ping`

```css
@keyframes ping {
  75%, 100% {
    opacity: 0;
    transform: scale(2);
  }
}
```

> Fade + motion enter animation

### `@keyframes pulse`

```css
@keyframes pulse {
  50% {
    opacity: 0.5;
  }
}
```

> Opacity fade

### `@keyframes enter`

```css
@keyframes enter {
  0% {
    opacity: var(--tw-enter-opacity,1);
    transform: translate3d(var(--tw-enter-translate-x,0),var(--tw-enter-translate-y,0),0)scale3d(var(--tw-enter-scale,1),var(--tw-enter-scale,1),var(--tw-enter-scale,1))rotate(var(--tw-enter-rotate,0));
    filter: blur(var(--tw-enter-blur,0));
  }
}
```

> Fade + motion enter animation · Filter effect (blur/brightness)

### `@keyframes exit`

```css
@keyframes exit {
  100% {
    opacity: var(--tw-exit-opacity,1);
    transform: translate3d(var(--tw-exit-translate-x,0),var(--tw-exit-translate-y,0),0)scale3d(var(--tw-exit-scale,1),var(--tw-exit-scale,1),var(--tw-exit-scale,1))rotate(var(--tw-exit-rotate,0));
    filter: blur(var(--tw-exit-blur,0));
  }
}
```

> Fade + motion enter animation · Filter effect (blur/brightness)

### `@keyframes NavbarClient-module__0lPMIq__desktopNavContentFadeIn`

```css
@keyframes NavbarClient-module__0lPMIq__desktopNavContentFadeIn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
```

> Opacity fade

### `@keyframes NavbarClient-module__0lPMIq__desktopNavContentFadeOut`

```css
@keyframes NavbarClient-module__0lPMIq__desktopNavContentFadeOut {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
```

> Opacity fade

### `@keyframes NavbarClient-module__0lPMIq__desktopNavContentRiseIn`

```css
@keyframes NavbarClient-module__0lPMIq__desktopNavContentRiseIn {
  0% {
    transform: translateY(8px);
  }
  100% {
    transform: translateY(0px);
  }
}
```

> Transform/motion animation

### `@keyframes NavbarClient-module__0lPMIq__desktopNavContentEnterFromStart`

```css
@keyframes NavbarClient-module__0lPMIq__desktopNavContentEnterFromStart {
  0% {
    transform: translate(-20%);
  }
  100% {
    transform: translate(0px);
  }
}
```

> Transform/motion animation

### `@keyframes NavbarClient-module__0lPMIq__desktopNavContentEnterFromEnd`

```css
@keyframes NavbarClient-module__0lPMIq__desktopNavContentEnterFromEnd {
  0% {
    transform: translate(20%);
  }
  100% {
    transform: translate(0px);
  }
}
```

> Transform/motion animation

### `@keyframes NavbarClient-module__0lPMIq__desktopNavContentExitToStart`

```css
@keyframes NavbarClient-module__0lPMIq__desktopNavContentExitToStart {
  0% {
    transform: translate(0px);
  }
  100% {
    transform: translate(-20%);
  }
}
```

> Transform/motion animation

### `@keyframes NavbarClient-module__0lPMIq__desktopNavContentExitToEnd`

```css
@keyframes NavbarClient-module__0lPMIq__desktopNavContentExitToEnd {
  0% {
    transform: translate(0px);
  }
  100% {
    transform: translate(20%);
  }
}
```

> Transform/motion animation

### `@keyframes KbLogoWall-module__3RH7Jq__scroll`

```css
@keyframes KbLogoWall-module__3RH7Jq__scroll {
  0% {
    transform: translate(0px);
  }
  100% {
    transform: translate(-100%);
  }
}
```

> Transform/motion animation

### `@keyframes KbLogoWall-module__3RH7Jq__marquee`

```css
@keyframes KbLogoWall-module__3RH7Jq__marquee {
  0% {
    transform: translate(0px, 0px);
  }
  100% {
    transform: translate(-100%);
  }
}
```

> Transform/motion animation

### `@keyframes constructionClouds-module__3i1Joq__cloudDriftMobile`

```css
@keyframes constructionClouds-module__3i1Joq__cloudDriftMobile {
  0% {
    transform: translate(-100vw);
  }
  100% {
    transform: translate(100vw);
  }
}
```

> Transform/motion animation

### `@keyframes constructionClouds-module__3i1Joq__cloudFooterDriftMobile`

```css
@keyframes constructionClouds-module__3i1Joq__cloudFooterDriftMobile {
  0% {
    transform: translate(-120vw);
  }
  100% {
    transform: translate(120vw);
  }
}
```

> Transform/motion animation

## Motion Tokens (CSS Variables)

### Duration Tokens

```css
--fides-overlay-language-loading-indicator-speed: 5s;
--default-transition-duration: .15s;
```

### Easing Tokens

```css
--default-transition-timing-function: cubic-bezier(.4, 0, .2, 1);
--ease-out: cubic-bezier(0, 0, .2, 1);
--ease-in-out: cubic-bezier(.4, 0, .2, 1);
```

### Delay Tokens

```css
--tw-animation-delay: 0s;
```

### Animation Tokens

```css
--tw-animation-iteration-count: 1;
--tw-animation-direction: normal;
--tw-animation-fill-mode: none;
```

### Other Tokens

```css
--springLight: #e4ebf6;
--spring: #5683d2;
--background-color-springLight: lab(92.7546% -.885487 -6.20667);
--background-color-spring: lab(54.2877% 2.64341 -46.1636);
```

## Global Transition Declarations

These `transition` values were extracted from CSS rules across the site:

```css
transition: color var(--nav-mobile-duration) var(--nav-mobile-easing), background-color var(--nav-mobile-duration) var(--nav-mobile-easing);
transition: transform var(--nav-hamburger-duration) ease-in-out, opacity var(--nav-hamburger-duration) ease-in-out;
transition: opacity var(--nav-mobile-duration) var(--nav-mobile-easing);
transition: opacity var(--nav-desktop-popup-duration) var(--nav-desktop-popup-easing);
transition: width var(--nav-desktop-popup-duration) var(--nav-desktop-popup-easing), height var(--nav-desktop-popup-duration) var(--nav-desktop-popup-easing), clip-path var(--nav-desktop-popup-duration) var(--nav-desktop-popup-easing), opacity var(--nav-desktop-popup-opacity-duration) var(--nav-desktop-popup-easing);
transition: rotate .25s var(--nav-desktop-chevron-easing);
transition: color var(--nav-desktop-popup-opacity-duration) var(--nav-desktop-popup-easing);
transition: color var(--nav-desktop-popup-opacity-duration) var(--nav-desktop-popup-easing), background-color var(--nav-desktop-popup-opacity-duration) var(--nav-desktop-popup-easing);
transition: opacity var(--nav-desktop-popup-opacity-duration) var(--nav-desktop-popup-easing), transform var(--nav-desktop-popup-opacity-duration) var(--nav-desktop-popup-easing);
transition: transform var(--nav-desktop-underline-duration) var(--nav-desktop-popup-easing);
transition: filter 0.68s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.68s cubic-bezier(0.4, 0, 0.2, 1);
transition: opacity 0.5s cubic-bezier(0, 0, 0.2, 1);
```

## How to Recreate This Motion Design

### Step 2 — Scroll-Reveal Pattern

Elements that animate into view follow this pattern:

```css
/* Initial hidden state */
.reveal {
  opacity: 0;
  transform: translateY(40px);
  transition: opacity 5s cubic-bezier(.4, 0, .2, 1),
              transform 5s cubic-bezier(.4, 0, .2, 1);
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### Step 3 — Key Motion Principles

- **WebGL/3D layer detected** — product visualizations use Three.js or custom WebGL. Use `<canvas>` with Three.js for 3D product renders
- **Video backgrounds** — use `<video autoplay loop muted playsinline>` for background videos. Always include a poster image fallback
- **Canvas elements (9)** — animated via requestAnimationFrame loop. Use canvas for particle effects, gradient animations, and WebGL scenes
- **Duration scale:** `5s` · `.15s` · `25s` · `0.68s` · `0.5s` · `1.2s` — use these values, never invent new durations
- **Always add** `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`

### Step 4 — Scroll Journey Reference

Match what happens at each scroll position:

- **0%** (`0px`) → `screens/scroll/scroll-000.png`
- **17%** (`2321px`) → `screens/scroll/scroll-017.png`
- **33%** (`4506px`) → `screens/scroll/scroll-033.png`
- **50%** (`6827px`) → `screens/scroll/scroll-050.png`
- **67%** (`9148px`) → `screens/scroll/scroll-067.png`
- **83%** (`11333px`) → `screens/scroll/scroll-083.png`
- **100%** (`13652px`) → `screens/scroll/scroll-100.png`


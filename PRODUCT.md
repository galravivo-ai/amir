# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Owners and managers of local businesses in Israel (restaurants, clinics, beauty, garages and the like) who run their own Google Business Profile, and chains with several branches whose managers watch every branch from one account. Agencies that manage profiles for clients are a secondary audience, served by a quote form.

## Product Purpose
GoFive connects to a business's Google Business Profile and shows in one place its reviews, profile views and calls, its Maps ranking around the business, and whether AI assistants (ChatGPT, Gemini, Perplexity, Claude) recommend it. Every week it says what to do to rise. Success: the owner acts on the weekly plan, answers reviews, and gets more customers from Google and AI.

## Positioning
Built on Google Business Profile (no claim of a Google partnership). One account for the profile, reviews, Maps ranking, competitors and AI visibility, with a weekly action plan in Hebrew, rather than separate tools.

## Operating Context
Hebrew, right to left; an English version exists at /en. Owners connect Google once (or paste a Maps link). Checks run weekly on their own. Rating requests go out by QR, link and WhatsApp; unhappy customers reach the business, not Google.

## Capabilities and Constraints
- Plans: "גוגל" ₪99 and "גוגל + AI" ₪149 a month incl. VAT; each extra branch 20% off; annual pays 10 months for 12. Free trial: 5 days (TRIAL_DAYS).
- Chains: every branch on one screen, a manager per branch, shared reply templates, one monthly report and one invoice.
- Server-rendered pages (Node, template strings); one stylesheet `public/style.css`; fonts Assistant and Rubik are self-hosted.
- The landing page keeps the callback form (#talk), the agency quote form (#contact), the branches section (#network), monthly/annual prices, FAQ and share meta.

## Brand Commitments
- Name GoFive, star logo with a "5"; brand purple (#5b3df5 / #4b2bd6), night (#1c1650) and yellow (#ffd23f).
- Never claim a Google partnership. No Apple logo, name or fonts.
- Landing copy: keep the existing content and promises; it may be shortened and reordered, with no new claims.

## Evidence on Hand
- Real product screenshots: `public/media/guide/*.jpg` (desktop) and `public/media/guide-m/*.jpg` (phone); intro video `public/media/gofive-intro.mp4`.
- Sample business "ביסטרו הגפן" for illustrations (sample data, labeled as such where shown).
- No customer testimonials, logos, usage numbers or case studies yet: none may be invented.

## Product Principles
1. Show the real product, not decoration.
2. One clear next step: the weekly plan, the reviews that wait.
3. Honest: no invented numbers, testimonials or partnerships.
4. Hebrew first, readable on a phone.

# TODOS

## Design

### Generate visual mockups of the ticket and booth before building the ritual UI

**What:** After `$D setup` (adds an OpenAI key), generate 3 ticket-screen variants plus the booth with the gstack designer, pick one on the comparison board, and record it in the design doc's Approved Mockups table.

**Why:** The "Rạp quốc doanh" direction (DESIGN.md) and the ticket layout are only specified in words; nobody has seen them. Checking by eye catches a bad color or layout combination before T5 builds it.

**Context:** /plan-design-review on 2026-11-02 ran text-only because no OpenAI key was configured (`No OpenAI API key found`). Pass 4 (AI slop) stayed at 8/10 only because the look is unverified. Brief inputs: the plan's Visual direction (8A), stub hierarchy (3A), booth (2A), and DESIGN.md tokens. Do this before implementation task T5 (ritual screens).

**Effort:** S
**Priority:** P2
**Depends on:** `$D setup` (an OpenAI API key)

## Completed

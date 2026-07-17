# RESTRUCTURE-3 — structural redesign, sales-tool scope
_Supersedes RESTRUCTURE-2 and RESTRUCTURE-2-REVISED. This is the final
plan of record._

## Why a structural redesign (the evidence)

Two audit rounds and a backtest established a pattern: every fix held
(guards prevent regression), but every NEW surface examined produced new
bugs — engine internals, then renderers, then reference architectures,
then the wizard→engine and engine→BOM seams. The bug supply is the seams
themselves: multiple independent representations of one design (engine
objects, BOM strings, rendered nodes, validator math) that can silently
disagree. Patching finds seam bugs one at a time, AFTER they produce a
wrong BOM. Structure removes the seams: one canonical design that all
outputs are mechanically derived from, so views cannot disagree because
there is only one thing to view.

## Scope line (what this is and is not)

IN: whatever makes wrong quotes structurally impossible.
OUT: enterprise features. Specifically excluded, permanently:
multi-vendor (Cisco/HPE) support, JSON APIs, Visio export, trace-ID /
structured-logging infrastructure, mutation & metamorphic testing
programs, DDD ceremony beyond simple module boundaries, the
ARCH-REVIEW-PROMPT gate (retired). If a task doesn't serve "input the
deal info, get a quotable BOM," it's out.

## The target architecture (plain language)

    Wizard/Expert inputs
        → Validated Input Model   (every field named; every field
                                   provably consumed or display-only)
        → Sizing Engine           (existing math, preserved)
        → CANONICAL DESIGN        (the one description of the network:
                                   devices, ports, links, cables — with
                                   models, roles, quantities, media)
        → Derived views, all mechanically generated from the canonical
          design, never hand-assembled:
            - BOM (grouped lines with qty = count of underlying items)
            - Topology diagrams (all three renderers)
            - Validation checks
            - draw.io export

Why devices/links as the canonical form (not BOM lines): the ghost-spine
bug becomes unrepresentable — a link cannot reference a device that
doesn't exist, so an optic line can never cite a switch missing from the
switch list. Quantities become COUNTS of real modeled things instead of
arithmetic assembled in strings, so 240-cables-for-120-links and
qty-8-note-says-4 become impossible, not just fixed. And the renderers
get their node list for free — the parity guard becomes a tautology.

This does NOT mean rebuilding the sizing engine. The engine's validated
math stays; its job becomes emitting the canonical design instead of
emitting strings and per-consumer snapshots. The catalog, SPEC.md,
citation log, and test harness carry forward unchanged.

## Phases

**Phase 0 — contracts, reviewed by the maintainer before any code:**
  a) Input schema: every wizard/expert field, its type, and exactly what
     it changes. Fields that change nothing are defects by definition.
  b) Canonical design schema: device {id, model, role, network, rack?},
     port, link {endpoints, speed, media, breakout?}, cable {link,
     mediaClass, unitsPerLink}. Kept as simple as the tool needs — this
     is a schema, not an ontology.
  c) Derivation contracts: how BOM lines group devices/cables (merge by
     model+role only), how renderers read nodes, how validators read
     counts. One page each.

**Phase 1 — invariants + fixtures against the CURRENT code first:**
  - Input-effect test (every input changes output or is documented
    display-only)
  - Line-arithmetic test (every BOM qty derivable from its own fields)
  - Referential-integrity test (every model named anywhere appears as a
    line; no cross-model merges)
  - Golden fixtures: the three 2026-07-15 backtest BOMs pinned at their
    CORRECTED expected output, plus every future real deal quoted.
  These run against today's code so the starting truth is known; several
  will fail — that's the point.

**Phase 2 — build the canonical design layer and migrate consumers one
at a time** (BOM text → renderers → validate.js → draw.io), keeping all
existing suites green throughout. Existing guards (renderer parity,
call-site counts, structural 3-tier assertions) carry forward.

**Phase 3 — the four known bugs die of the architecture.** Verify each
is now unrepresentable or caught by a Phase 1 invariant: the RJ45
2×-overcount, the ghost spine, the qty-vs-note mismatch, the label-only
redundancy toggle. Any survivor gets a targeted fix + regression.

**Interim exception to "don't patch first":** the four known bugs affect
live quotes today. If a real deal needs quoting before Phase 2 lands,
patch the specific bug blocking that quote with its invariant test, and
note it as interim — the structural fix still proceeds. Reliability for
this week's deal and structure for every future deal are not in
conflict.

## What "done" looks like

- A wrong-quantity, ghost-reference, or inert-input BOM cannot be
  produced without a hard test failure.
- The maintainer's workflow is unchanged: input deal info, read BOM,
  quote. The structure is invisible except as absence of wrong lines.
- Every real deal quoted becomes a fixture, so the tool's accuracy
  compounds with use instead of decaying with change.

## Standing rules (unchanged)

Tests in the same commit as the change they protect. Stop and show the
maintainer on any CONFLICT. Flag conflicts with this plan rather than
silently matching it. Fresh Claude Code session; CLAUDE.md points here.
Phase 0's three contracts are reviewed by the maintainer before
implementation — that review is the highest-leverage checkpoint in the
plan, and it is a one-hour read, not an engineering exercise: the test
is "do these schemas describe networks the way I'd describe them to a
customer?"

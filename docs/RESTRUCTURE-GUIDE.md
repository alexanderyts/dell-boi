# Restructuring best-practices.md → SPEC.md + CHANGELOG.md

## Why
The current single file mixes two different kinds of content:
1. **Current-state rules** ("PowerScale back-end must be a dedicated network")
2. **Dated patch history** ("(fixed 2026-07-13)", "(added 2026-07-13)")

At ~400 lines this is still readable. It won't stay that way — every future
fix adds another dated parenthetical, and "what's the current rule for X"
increasingly requires mentally diffing patches instead of reading one
sentence. Splitting now, while it's cheap, avoids a much more painful
migration later.

## The split

**`SPEC.md`** — current state only. No dates. Reads like a spec, not a diff.
Each rule states what IS true today, cites its source, and says where it's
enforced. When a rule changes, `SPEC.md` is edited in place (old text
replaced, not appended-to) — git history is where the "what changed" lives
structurally, `CHANGELOG.md` is where it lives *narratively*.

**`CHANGELOG.md`** — append-only, dated, newest-first. Each entry says what
changed, why, and links to the `SPEC.md` section it affected. This is where
"(fixed 2026-07-13)" content moves to — the *reasoning* for a change (e.g.
"the old rule priced one spine per uplink, which is wrong because...") is
valuable and shouldn't be deleted, it just doesn't belong mixed into the
current-state description.

**`GAPS.md`** (already drafted) — open items, separate from both.

**`CITATION-LOG.md`** (already drafted) — verification dates for specific
facts, separate from both.

## Migration approach
Don't try to do this in one pass by hand — it's mechanical and error-prone
at this size. Suggested approach:

1. Go section by section through the existing doc.
2. For each bullet, ask: "Is this describing what's true NOW, or what
   CHANGED and when?" Most bullets are actually both (a rule + a
   parenthetical about when/why it was fixed).
3. The rule part → `SPEC.md`, worded as a present-tense statement of fact.
4. The "why it changed / what was wrong before" part → a `CHANGELOG.md`
   entry dated to match, with a link/anchor back to the `SPEC.md` section.
5. Where a section is PURELY historical (e.g. "Conflicts resolved: MTU
   9000→9216..." at the bottom of the original doc) — that whole section is
   changelog, not spec.

This is a good task to hand to Claude Code directly: point it at the
existing doc and this guide, and have it do the mechanical split, then you
review for anything that got miscategorized (rule vs. history). I'd expect
maybe 5-10% of bullets to be genuinely ambiguous and worth a human call.

## Worked example (Section 0b, partially migrated)

To show the pattern concretely, here's one section actually split:

---

### → Goes into SPEC.md:

> ## Network architecture intent
> `input.fabricArchitecture` (`'converged'` | `'sharedSpine'` | `'separate'`)
> is an explicit customer-intent question, not an inferred default:
> - `sharedSpine` (default) — separate leaf per network, one shared spine tier.
> - `converged` — compute and storage NICs of matching native speed/electrical
>   class share the same leaf switches (VLAN-segmented). Implemented as a merge
>   pass in `js/engine.js` that runs immediately after specs are built and
>   before leaf sizing, so the rest of the pipeline (host-port budgets, spine
>   radix, BOM, topology, rack elevation, draw.io) treats it as one ordinary
>   fabric with no special-casing downstream.
> - `separate` — dedicated leaf AND spine per network (max isolation).
>
> **Never converged, regardless of stated preference** (technical
> requirement, not customer choice):
> - PowerScale-class `backend` (h15963/h16346 — physically mandated separate
>   network).
> - AI fabrics (Dell/NVIDIA no-mix + rail-optimized topology).
> - NVMe over RoCE storage (needs dedicated lossless PFC/ECN, non-blocking
>   fabric — excluded from the merge pass outright, not allowed with a
>   warning).
>
> The merged fabric keeps the most-constrained contributor's `network` label
> (storage outranks frontend), so existing oversubscription-cap / redundancy
> / protocol checks keep applying correctly with zero changes elsewhere.
>
> **Where it's asked:** Guided wizard (`fabricArch` step) and Expert form
> (`#f-fabricarch`) — only shown once a design has 2+ targets. Express mode
> defaults to `sharedSpine` and flags it as an assumption. Discovery mode
> never asks (always single-target, nothing to converge).

### → Goes into CHANGELOG.md:

> ### 2026-07-13 — Fixed misleading fabric-sharing control
> **Problem:** The tool was silently building separate leaf-switch fabrics
> for storage vs. compute the moment both were combined. The one control
> that looked like it addressed this ("Share one fabric across all
> targets?") only shared the SPINE tier — leaf switches were ALWAYS separate
> per network, independent of that setting. The wording was actively
> misleading ("One fabric for both" delivered two fabrics on one spine).
>
> **Fix:** Replaced the boolean with the three-way `fabricArchitecture`
> input described in [SPEC.md § Network architecture intent](SPEC.md#network-architecture-intent).
>
> **Back-compat:** Legacy callers/saved designs that only set the old
> `separateFabrics` boolean map onto their exact prior meaning
> (`true`→`separate`, `false`/absent→`sharedSpine`) — no break.

---

Notice the SPEC.md version has no dates and reads as ground truth; the
CHANGELOG.md version preserves all the "why," including the embarrassing
detail that the old UI copy was actively misleading — that's genuinely
useful institutional memory, it just doesn't belong in the same paragraph
as the current rule.

## After migration
- `best-practices.md` can be deleted or kept as a redirect stub pointing to
  the four new files.
- Update whatever Claude Code / CLAUDE.md references point at the old
  filename.
- Going forward, the rule is: **new fixes get a SPEC.md edit + a
  CHANGELOG.md entry, in the same commit.** Never just append a dated
  parenthetical to SPEC.md again — that's the exact drift this migration is
  meant to stop.

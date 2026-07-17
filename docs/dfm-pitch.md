# Dell Fabric Manager (DFM) — the pitch
*Two formats: **§1 full written script** (rehearse word-for-word) and **§2 outline mode** (beat sheet — pitch from this once the script is internalized). Compare them side by side; the outline is the same pitch with the bones showing.*

**Scope guard:** this is **DFM** — the BE Networks-powered platform (Automation = Verity · Observability = Satori · AIOps = SensAI). It is **not** SmartFabric Manager; if SFM comes up in Q&A, keep the lanes separate and bring it back to DFM.

**Facts verified 2026-07-10** against BE Networks' Dell SONiC page (be-net.com/dell — archived in `corpus/MG-DFM-BENET.txt`): Verity 6.6, ZTP + NOS upgrades + config rendering, Time Traveler rollback, REST OpenAPI 3.0 / Terraform / Ansible / NetBox, gNMI+CLI+SSH, RoCEv2 & PoE support, Satori telemetry/ML thresholds/dashboards/alarms, SensAI network Q&A/task queueing/guided workflows, EXEO Group production win, IREN AI-factory deployment.

---

# §1 — FULL SCRIPT (~8 min)

## SLIDE 1 — What's actually in this quote (≈ 75 sec)
**On screen:** just the number **"32"**.

> Most of the accounts we're in are somewhere in the same journey right now — modernizing compute, refreshing storage, and increasingly, standing up AI. Every one of those projects eventually lands on the same team: whoever's actually running the network underneath it.
>
> This design is thirty-two switches. Someone on that team has to bring each one up — log in, type the config, make sure everything matches across the fabric, check it, move to the next box. Do that thirty-two times and it's not really a switch count anymore — it's thirty-two logins, thirty-two places a typo can hide, thirty-two boxes someone has to remember how to get into when one acts up.
>
> We sell the hardware well — faster ports, more bandwidth, good pricing. But the real work starts the day it arrives, and for most teams that work hasn't changed in twenty years: one person, one login, one box at a time.
>
> That's what changes what a Dell quote should include.

## SLIDE 2 — What that actually costs, in practice (≈ 75 sec)
**On screen:** three lines — *Bring-up · Change windows · Drift*

> A few things that happen on real deployments, not hypotheticals.
>
> **Bring-up.** Every switch gets hand-configured — the routing, the network segments, every setting that has to match exactly across the whole fabric. Get one setting wrong and it usually doesn't surface until traffic testing — then it's "which of the thirty-two is it." Most outages trace back to a human typo, not failed hardware.
>
> **Change.** Updating software on a redundant pair by hand means taking one down, confirming its partner can carry the full load, updating it, checking it, then doing the other — in the right order, every time. Skip a step and it's a real outage. So teams put it off, and the fabric quietly falls behind on patches.
>
> **Drift.** Six months in, someone made a change under time pressure that never made it back into the documentation — and that person may not even be on the team anymore. Nobody notices until an audit, or an outage.
>
> None of this shows up on a BOM. All of it shows up in the customer's operating budget, and on whoever's on call.

## SLIDE 3 — Dell Fabric Manager (≈ 3:15 — the heart)
**On screen:** the three-function slide (the manager's modified slide 6): **Automation · Observability · AIOps**

> This is Dell Fabric Manager — one platform for the fabric, whether that's the data center, GPU fabrics, or campus. Three jobs: **build it**, **see it**, **stay ahead of it**.
>
> **Automation.** This is what's called intent-based networking — the team describes what they want the network to do, and DFM writes and pushes the actual configuration itself. New switches configure themselves the moment they're powered on, so a fabric this size is up in hours instead of weeks. Software updates get sequenced and pushed from one place instead of by hand, pair by pair. And if a change goes wrong, there's an undo button — plus DFM is always comparing what's actually running against what was designed, so the drift problem from a minute ago gets caught, not discovered later.
>
> Here's where that gets concrete: a lot of customers are starting to plan moving off OS10 onto SONiC. Normally that's someone rebuilding every config from scratch by hand. DFM pulls in what's already running, converts it, and lets the team test the whole new fabric in a digital twin — a safe copy of the network — before touching production. Every switch that gets swapped in then configures itself, the same way it would on day one.
>
> **Observability.** Checking in every five minutes isn't really watching a network — it's sampling one. DFM streams live data from every switch into one set of screens instead of thirty-two separate logins, and it learns what normal looks like for *this* fabric specifically, so an alert usually means something.
>
> **AIOps.** The newest piece. The team can ask the network questions in plain English — "what's running hot," "what changed since Tuesday" — and get answers instead of digging through logs themselves. It also points at the likely cause instead of a wall of alarms, and can walk a less experienced engineer through the fix step by step.
>
> Build it. See it. Stay ahead of it. One platform, three jobs.

## SLIDE 4 — Proof + what actually changes (≈ 90 sec)
**On screen:** two columns — *Without DFM / With DFM* — plus one proof line at the bottom.

> This isn't a concept. **EXEO Group** — a Japanese telecom — ran a six-month trial and placed a **production order** to run their SONiC fabric on it. **IREN** is deploying it with NVIDIA for a large-scale AI factory build. It's running real networks at both ends of the size range today.
>
> What changes for the customer: fabric up in hours instead of weeks. Updates that don't need a weekend window. Problems caught before a user files a ticket. And when someone asks "is the network actually set up the way it's documented" — there's a real answer, not a guess.
>
> What changes for us: hardware gets compared line by line on price. How a customer's team actually runs their network every day is a lot harder to compare that way — that's the case for putting DFM on the quote from the first conversation, not adding it at the end.

## CLOSE (≈ 45 sec)
**On screen:** one line — ***"The hardware fixes speed. DFM fixes operations."***

> The hardware fixes speed. Dell Fabric Manager fixes operations.
>
> Every deal we're in, the customer already has both problems, whether they've priced a fix for either one. I'd rather put DFM on the quote and offer their network team fifteen minutes to see what they won't have to do by hand anymore.
>
> Before I open it up — I'd genuinely like to hear from this group too: what pain points are you running into with customers that you think this actually solves?
>
> Thanks — questions?

---

# §2 — OUTLINE MODE (the same pitch, bones only)

**1. WHAT'S IN THIS QUOTE — "32" (1:15)**
- Most customers are mid-journey: modernizing compute, storage, now AI — it always lands on the network team
- 32 switches = 32 logins, 32 hand-typed configs, 32 places to check when something's wrong
- We sell hardware well; the bring-up process hasn't changed much in 20 years
- *Bridge: "That changes what a Dell quote should include."*

**2. WHAT THAT COSTS IN PRACTICE (1:15)**
- Bring-up: hand-config box-by-box → one wrong setting doesn't surface until traffic testing → most outages trace to human error, not hardware
- Change: manual pair upgrades need exact sequencing (drain → verify → upgrade → repeat) → skip a step, real outage → so upgrades get put off
- Drift: undocumented changes made under pressure, by people who may have left → nobody notices until an audit or an outage
- *Landing line: "None of this is on a BOM; all of it is in their operating budget."*

**3. DFM — three jobs (3:15)** *(manager's slide 6)*
- **Automation (Verity):** intent-based — describe what you want, DFM builds and pushes the config · new switches configure themselves on power-up (hours not weeks, not 32x manual typing) · software updates sequenced and pushed from one place · **Time Traveler** = undo button for a bad change · catches drift (running vs. designed) automatically
- **Concrete example:** customers planning OS10 → SONiC moves — DFM converts existing configs, tests the new fabric in a **digital twin** (safe copy of the network) before production, then every swapped-in switch configures itself
- **Observability (Satori):** streaming live data (not 5-min polling) · one set of screens, not 32 logins · learns what "normal" looks like for this fabric = alerts that mean something
- **AIOps (SensAI):** plain-English network Q&A against live state · points at likely cause instead of an alarm wall · walks a less experienced engineer through the fix
- *Refrain: "Build it. See it. Stay ahead of it."*

**4. PROOF + WHAT CHANGES (1:30)**
- EXEO Group: 6-month trial → **production order** (SONiC fabric, telecom)
- IREN + NVIDIA: large-scale **AI factory** deployment
- Customer: hours not weeks · fewer weekend windows · problems found before tickets · "here's the real answer" not "we think so"
- Us: hardware = price-compared line by line; how the team runs the network day to day is harder to compare that way → DFM on the quote from the first conversation

**5. CLOSE (0:45)**
- *"The hardware fixes speed. DFM fixes operations."*
- Offer: DFM on the quote + 15 min with their network team
- **Open the floor:** ask the room what pain points they're seeing that this solves

---

# Delivery notes

**Timing:** 1:15 / 1:15 / 3:15 / 1:30 / 0:45 ≈ **8:00** — rehearse once against a clock; if over, trim slide 2 first (the hook and slide 3 are untouchable).

**Lines to land (pause after each):**
- "Thirty-two logins."
- "Hours, not weeks."
- "Skip a step and it's a real outage."
- "A safe copy of the network — before touching production."
- "The hardware fixes speed. DFM fixes operations."

**Name discipline:** **Dell Fabric Manager / DFM** only. If old names come up: "Automation is what was called Verity, Observability was Satori, AIOps was SensAI — one platform now, one name." **Never blend in SmartFabric Manager — different product, different conversation.**

**Likely Q&A:**
- *"Which switches?"* → "The Dell Enterprise SONiC PowerSwitch portfolio end to end — from the 1G edge up through the 800G AI-fabric range. In mixed estates it runs the Dell side, and that's our wedge to grow it."
- *"Is this SmartFabric Manager?"* → "No — separate product. DFM is the BE Networks-powered platform: Automation, Observability, AIOps. Happy to walk the difference offline; today is DFM."
- *"How is it different from any monitoring tool?"* → "Monitoring watches. DFM also builds and changes things — zero-touch setup, orchestrated updates, rollback, drift detection. Monitoring alone doesn't remove the manual upgrade sequencing or the config typos; this does."
- *"We're not planning an OS10-to-SONiC move — does this still matter?"* → "Same platform either way — the migration story is just the most concrete example right now. Day-to-day it's the ZTP, the automated updates, and catching drift before it's an outage."
- *"Is the AI real, or is that marketing?"* → "It's trained on this fabric's own data — learned thresholds instead of static ones, plain-English Q&A against live state, guided fixes. I'd rather demo it than argue about it."
- *"Cost / licensing?"* → "Subscription, sized to the fabric — value first, licensing with the quote." *(No invented numbers.)*

**Logistics (from the requirements):** DFM name ✔ · 5–10 min ✔ (~8:00) · pitch not overview ✔ · ≤5 slides ✔ (4 + close) · three function value points ✔ · recording → link to manager + Mike B. by Wed COB + Thu/Fri 1×1 · live → 30-min Thu/Fri invite, 10 min max preso.

> 💡 **In the BOM tool:** generate this same pitch scaled to any real design — build a BOM, open the **🎤 DFM pitch** tab, and the numbers (switch count, fabrics, pairs, speeds, AI/RoCE angle) match that exact customer scenario. Four variants via two toggles: **Script / Outline** × **🙂 Easy mode** (fully plain language) / **🔬 Tech mode** (the real terms, each glossed inline with "in plain terms … why it matters"). A 💎 value-add block is always included.

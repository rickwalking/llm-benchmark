# Rubric — Gherkin Quality

## Definition

Measures the quality of `.feature` files (the Gherkin specifications) as **executable
specifications**, not as test scripts. A good Gherkin file is readable by a domain
expert (here: a librarian) without any knowledge of the implementation.

The 1-5 score on this rubric is computed as a weighted blend of four sub-criteria,
adapted from Hassani et al. (2025) and the LLM-as-Judge for Test Coverage paper (2026):

| Sub-criterion | Weight |
|---|---|
| Scenario completeness (every AC covered, including negatives) | 40% |
| Acceptance criteria alignment (each scenario maps to a named AC) | 30% |
| Declarative phrasing (business-level steps, not UI-level) | 20% |
| Atomic steps (one action per step, no compound `And` chains) | 10% |

Final 1-5 score is the rounded weighted average of the sub-scores below.

## Evidence the judge receives

- All files in `features/`.
- The list of AC IDs from `REQUIREMENTS.md` for completeness checking.
- The cucumber test report (`test:bdd` output), to know which scenarios actually pass.
  Failing scenarios are not penalized in this rubric (test correctness is measured
  separately) but unimplemented step definitions cap the score at 2.

## Sub-rubric A — Scenario completeness (1-5)

- 1: Fewer than 50% of AC IDs have a scenario.
- 2: 50–75% of ACs covered. Many negative ACs missing.
- 3: 75–95% of ACs covered. At least one negative AC per user story present.
- 4: 100% of ACs covered with at least one scenario each. Negative ACs covered.
- 5: 100% covered, plus boundary cases not in the AC list (e.g., loan limit at 4 vs 5 vs 6, fine at 19 vs 20 days late) expressed as `Scenario Outline`.

## Sub-rubric B — AC alignment (1-5)

- 1: Scenarios do not reference AC IDs at all. No clear mapping.
- 2: Some scenarios tag AC IDs; many do not. Multiple scenarios bundle several ACs together inseparably.
- 3: Every scenario carries an `@AC-x.y` tag. Each scenario maps to exactly one AC.
- 4: Tags are present and the scenario name is itself a human-readable restatement of the AC ("Reject 6th concurrent loan").
- 5: Every AC traces to a scenario AND every scenario traces to an AC (bidirectional traceability). A `Background` removes setup duplication where appropriate. Outline `Examples` tables are tagged per-row when needed.

## Sub-rubric C — Declarative phrasing (1-5)

- 1: Steps are imperative and UI-driven: "When I click the button with id `lend-btn`", "Then the URL contains `/loans`".
- 2: Mixed: some declarative steps, but UI-level `click`/`fill` language dominates.
- 3: Steps are predominantly declarative at the business level: "When the librarian lends Dune to Alice", "Then Alice has 1 active loan".
- 4: Consistent declarative voice. Domain language is used throughout ("lend", "return", "reserve", "fulfil"). No mention of HTTP status codes, JSON keys, or DOM elements.
- 5: Steps read like documentation. A librarian could approve them. Constants are named, not magic numbers (`Then the loan is due in <loan period>` rather than `Then the loan is due in 14 days` everywhere).

## Sub-rubric D — Atomic steps (1-5)

- 1: Most scenarios contain compound steps with `and ... and ...` inside a single Given/When/Then.
- 2: Some atomic steps, but multi-action steps appear regularly.
- 3: Steps are mostly atomic; occasional compound step.
- 4: Strictly one action per step. `And` is used to chain separate steps, not as a comma inside one.
- 5: Atomic steps AND no over-decomposition (avoiding "Given member exists / Given member is active / Given member has no fines" when "Given an eligible member" with proper context would do — judgment about when to compose vs. decompose is exercised well).

## Computing the final score

```
final_1_to_5 = round(0.40 * A + 0.30 * B + 0.20 * C + 0.10 * D)
```

The judge outputs sub-scores AND the final score, with evidence for each.

## Output format (overrides the standard template for this rubric)

```json
{
  "criterion": "gherkin",
  "sub_scores": {
    "completeness": <1-5>,
    "alignment": <1-5>,
    "declarative": <1-5>,
    "atomic": <1-5>
  },
  "evidence_quotes": {
    "completeness": ["<verbatim AC ID list found>", "<verbatim AC ID list missing>"],
    "alignment": ["<verbatim>"],
    "declarative": ["<good example verbatim>", "<bad example verbatim if any>"],
    "atomic": ["<verbatim step>"]
  },
  "final_score": <1-5>,
  "confidence": "low|medium|high"
}
```

## Notes for judges

- Step definitions that don't compile or aren't wired up cap the **completeness** sub-score at 2 regardless of how many scenarios exist on paper.
- A `.feature` file is not "complete" if its scenarios reference acceptance criteria that the step definitions don't actually exercise. Cross-check the cucumber report.
- Reward `Background` and `Scenario Outline` use *only when they reduce duplication*. A `Background` containing a single step is noise.
- Penalize copy-paste duplication of similar scenarios that could have been one outline.

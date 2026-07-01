# Use Cases

## UC-1: Catch an unsourced claim in a plan

- An author writes a plan with «X supports Y» and no proof marker
- The validator runs at plan validation (Phase 4)
- It warns: unsourced claim — add a `[src:]`/`[ref:]`/`[cmd:]` marker or remove the claim

## UC-2: Require a sources section

- A plan has no «Источники / Пруфы» section
- The validator runs
- It warns that external facts are not backed; the author adds the section

## UC-3: Author evidence the standard way

- An author consults the claims-need-evidence rule
- They use the documented marker format and the template sources section
- Each external fact carries a proof or sits in the sources section

# SAVORA recipe catalog

The target is 50,000 complete recipe records. The generator writes one JSON object per line to `catalog.jsonl`, so interrupted runs can resume without replacing existing records.

## Generate

1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.
2. Run `npm run recipes:generate`.
3. Optional environment variables: `RECIPE_TARGET` (default 50000), `RECIPE_BATCH_SIZE` (default 10, maximum 20), `RECIPE_MODEL` (default `gemini-2.5-flash`).

The script skips duplicate titles, validates minimum ingredient and step counts, appends accepted records, and updates `generation-state.json`. It stops safely if a batch produces no usable new records.

Generated recipes are drafts, not automatically certified culinary or nutrition advice. Review instructions, food-safety guidance, quantities, and allergens before publication. Each record starts with `imageStatus: pending`; photography is a separate subsequent pipeline. Do not commit API keys or the generated private catalog to Git.

# fake-python-api

Minimal FastAPI app fixture used by `onboard-repo-phase0` tests (archetype = `python-api`).

## Structure

- `src/main.py` — app entry + `/health` endpoint
- `src/routes/users.py` — `/users/` router
- `tests/test_main.py` — pytest integration tests

## Run

```bash
uv sync  # or pip install -e .[dev]
uv run uvicorn src.main:app --reload
uv run pytest
```

from fastapi import FastAPI

app = FastAPI(title="monorepo-api")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

from fastapi import FastAPI
from .routes import users


app = FastAPI(title="fake-python-api")
app.include_router(users.router, prefix="/users", tags=["users"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

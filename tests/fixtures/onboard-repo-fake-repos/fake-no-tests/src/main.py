from fastapi import FastAPI


app = FastAPI(title="fake-no-tests")


@app.get("/")
async def root() -> dict[str, str]:
    return {"msg": "no tests here"}

from fastapi import APIRouter


router = APIRouter()


@router.get("/")
async def list_users() -> list[dict[str, str]]:
    return [{"id": "1", "name": "alice"}]

from fastapi.testclient import TestClient
from src.main import app


client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_users():
    response = client.get("/users/")
    assert response.status_code == 200
    assert len(response.json()) >= 1

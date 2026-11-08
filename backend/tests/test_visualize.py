import json

from conftest import article_request, make_response

VISUAL = {
    "workflow": [
        {"title": "Survey employers", "detail": "Asked firms about remote work.", "kind": "data",
         "excerpt": "In a survey of 2,400 employers conducted in March"},
        {"title": "Measure vacancy", "detail": "Office vacancy figures.", "kind": "result", "excerpt": "Invented passage here."},
        {"title": "   ", "detail": "Blank title, dropped.", "kind": "method", "excerpt": ""},
    ],
    "nodes": [
        {"id": "remote-work", "label": "Remote work", "group": "concept", "description": "Working from home.", "excerpt": ""},
        {"id": "Office Vacancy", "label": "Office vacancy", "group": "metric", "description": "Empty offices.", "excerpt": ""},
        {"id": "remote-work", "label": "Remote work again", "group": "concept", "description": "Duplicate id.", "excerpt": ""},
        {"id": "towns", "label": "Small towns", "group": "entity", "description": "Growing towns.", "excerpt": ""},
    ],
    "edges": [
        {"source": "remote-work", "target": "Office Vacancy", "relation": "raises"},
        {"source": "remote-work", "target": "Office Vacancy", "relation": "duplicate"},
        {"source": "remote-work", "target": "ghost", "relation": "dangling"},
        {"source": "towns", "target": "towns", "relation": "self loop"},
        {"source": "remote-work", "target": "towns", "relation": "grows"},
    ],
}


def test_visualize_cleans_the_graph(make_client):
    client = make_client([make_response(json.dumps(VISUAL))])
    res = client.post("/api/visualize", json=article_request())
    assert res.status_code == 200, res.text
    v = res.json()["visual"]
    assert [s["title"] for s in v["workflow"]] == ["Survey employers", "Measure vacancy"]
    assert [s["excerpt_verified"] for s in v["workflow"]] == [True, False]
    assert [n["id"] for n in v["nodes"]] == ["remote-work", "office-vacancy", "towns"]
    assert [(e["source"], e["target"]) for e in v["edges"]] == [
        ("remote-work", "office-vacancy"),
        ("remote-work", "towns"),
    ]
    call = client.fake.models.calls[0]
    assert "knowledge graph" in call["config"].system_instruction
    assert "<article>" in call["contents"]


def test_visualize_validates_input(make_client):
    client = make_client([make_response(json.dumps(VISUAL))])
    res = client.post("/api/visualize", json=article_request(content="too short"))
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "CONTENT_TOO_SHORT"
    assert client.fake.models.calls == []

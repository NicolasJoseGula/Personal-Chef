import json
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langchain.messages import HumanMessage, AIMessage, AIMessageChunk
from agent import agent



app = FastAPI(
    title="Personal Chef API"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Modelos de request ----
class ChatMessage(BaseModel):
    role: str
    content: str
    images: list[str] = []

class ChatRequest(BaseModel):
    messages: list[ChatMessage]

# ---- Helpers ----
def _split_data_url(data_url: str):
    """ 'data:image/png;base64,AAAA' -> ('image/png', 'AAAA') """
    header, b64 = data_url.split(",", 1)
    mime = header.split(";")[0].removeprefix("data:")
    return mime, b64

def _to_lc_messages(messages: list[ChatMessage]):
    lc = []
    for m in messages:
        if m.role == "assistant":
            lc.append(AIMessage(content=m.content))
            continue
        # user (puede traer texto + imágenes)
        blocks = []
        if m.content:
            blocks.append({"type": "text", "text": m.content})
        for data_url in m.images:
            mime, b64 = _split_data_url(data_url)
            blocks.append({"type": "image", "base64": b64, "mime_type": mime})
        lc.append(HumanMessage(content=blocks))
    return lc


def _text(content) -> str:
    """Extrae texto de un content que puede ser str o lista de bloques."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        out = []
        for b in content:
            if isinstance(b, dict) and b.get("type") == "text":
                out.append(b.get("text", ""))
            elif isinstance(b, str):
                out.append(b)
        return "".join(out)
    return ""


# ---------- Streaming ----------
async def stream_agent(messages: list[ChatMessage]):
    lc_messages = _to_lc_messages(messages)
    announced_tools = set()
    try:
        async for mode, data in agent.astream(
            {"messages": lc_messages},
            stream_mode=["updates", "messages"],
        ):
            if mode == "messages":
                chunk, _meta = data
                if isinstance(chunk, AIMessageChunk):
                    text = _text(chunk.content)
                    if text:
                        yield json.dumps({"type": "token", "content": text}) + "\n"

            elif mode == "updates":
                # detectar cuándo el modelo decide usar una tool
                for _node, node_data in (data or {}).items():
                    if not isinstance(node_data, dict):
                        continue
                    for msg in node_data.get("messages", []):
                        for tc in getattr(msg, "tool_calls", None) or []:
                            name = tc.get("name")
                            if name and name not in announced_tools:
                                announced_tools.add(name)
                                yield json.dumps({"type": "tool_start", "name": name}) + "\n"

        yield json.dumps({"type": "done"}) + "\n"
    except Exception as e:
        yield json.dumps({"type": "error", "message": str(e)}) + "\n"


@app.post("/chat")
async def chat(req: ChatRequest):
    return StreamingResponse(
        stream_agent(req.messages),
        media_type="application/x-ndjson",
    )


@app.get("/health")
def health():
    return {"status": "ok"}
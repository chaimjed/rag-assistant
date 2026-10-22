from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
import shutil
import os

from app.ingestion.loader import load_document
from app.ingestion.chunker import chunk_text
from app.vectorstore.chroma_store import add_chunks
from fastapi.responses import StreamingResponse
from app.rag.chain import ask_with_sources, stream_with_sources
from app.vectorstore.chroma_store import add_chunks, list_documents, delete_document

router = APIRouter()
UPLOAD_DIR = "uploaded_docs"
os.makedirs(UPLOAD_DIR, exist_ok=True)


class Question(BaseModel):
    question: str
    source: str | None = None
    history: list[dict] | None = None



@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    text = load_document(file_path)
    chunks = chunk_text(text)
    add_chunks(chunks, metadata={"source": file.filename})

    return {"filename": file.filename, "chunks_added": len(chunks)}

@router.post("/ask")
async def ask_question(payload: Question):
    result = ask_with_sources(payload.question, source=payload.source, history=payload.history)
    return {
        "question": payload.question,
        "answer": result["answer"],
        "sources": result["sources"],
    }
@router.post("/ask/stream")
def ask_question_stream(payload: Question):
    return StreamingResponse(
        stream_with_sources(payload.question, source=payload.source, history=payload.history),
        media_type="application/x-ndjson",
    )
@router.get("/documents")
def get_documents():
    return list_documents()


@router.delete("/documents/{filename}")
def remove_document(filename: str):
    deleted = delete_document(filename)
    file_path = os.path.join(UPLOAD_DIR, os.path.basename(filename))
    if os.path.exists(file_path):
        os.remove(file_path)
    return {"filename": filename, "chunks_deleted": deleted}
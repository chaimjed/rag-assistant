from langchain_chroma import Chroma
from langchain_ollama import OllamaEmbeddings

from app.config import OLLAMA_BASE_URL

PERSIST_DIR = "chroma_db"
COLLECTION_NAME = "documents"


def get_vectorstore():
    """Retourne l'instance ChromaDB persistante, avec les embeddings Ollama."""
    embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url=OLLAMA_BASE_URL)
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=PERSIST_DIR,
    )


def delete_document(source: str) -> int:
    """Supprime tous les chunks d'un document. Retourne le nombre de chunks supprimés."""
    vectorstore = get_vectorstore()
    ids = vectorstore.get(where={"source": source}).get("ids", [])
    if ids:
        vectorstore.delete(ids=ids)
    return len(ids)


def add_chunks(chunks: list[str], metadata: dict | None = None):
    """Ajoute des chunks. Si le document existe déjà, ses anciens chunks sont remplacés."""
    source = (metadata or {}).get("source")
    if source:
        delete_document(source)  # évite les doublons lors d'un ré-upload

    vectorstore = get_vectorstore()
    metadatas = [dict(metadata or {}) for _ in chunks]
    vectorstore.add_texts(texts=chunks, metadatas=metadatas)
    return vectorstore


def list_documents() -> list[dict]:
    """Liste les documents présents en base avec leur nombre de chunks."""
    data = get_vectorstore().get(include=["metadatas"])
    counts: dict[str, int] = {}
    for meta in data.get("metadatas") or []:
        name = (meta or {}).get("source")
        if name:
            counts[name] = counts.get(name, 0) + 1
    return [{"name": name, "chunks": chunks} for name, chunks in sorted(counts.items())]

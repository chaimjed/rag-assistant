from app.vectorstore.chroma_store import get_vectorstore

def get_retriever(k: int = 4, source: str | None = None):
    vectorstore = get_vectorstore()
    search_kwargs = {"k": k}
    if source:
        search_kwargs["filter"] = {"source": source}
    return vectorstore.as_retriever(search_kwargs=search_kwargs)
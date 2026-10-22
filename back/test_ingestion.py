from app.ingestion.loader import load_document
from app.ingestion.chunker import chunk_text

text = load_document("Ielts.pdf")
chunks = chunk_text(text)

print(f"Nombre de chunks: {len(chunks)}")
print(f"Premier chunk:\n{chunks[0]}")
from app.vectorstore.chroma_store import add_chunks

add_chunks(chunks, metadata={"source": "ielts_book.pdf"})
print("Chunks ajoutés à ChromaDB !")
import json
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate

from app.config import OLLAMA_BASE_URL
from app.rag.retriever import get_retriever

ANSWER_PROMPT = """Réponds à la question en te basant UNIQUEMENT sur le contexte suivant.
Si la réponse n'est pas dans le contexte, dis que tu ne sais pas.

Contexte:
{context}

Question: {question}

Réponse:"""

CONTEXTUALIZE_PROMPT = """Voici l'historique d'une conversation et une nouvelle question qui peut y faire référence.
Reformule la nouvelle question pour qu'elle soit compréhensible seule, sans le reste de la conversation.
Ne réponds pas à la question, reformule-la seulement. Si elle est déjà autonome, renvoie-la telle quelle.

Historique:
{history}

Nouvelle question: {question}

Question reformulée:"""


def get_llm():
    return ChatOllama(model="llama3.1", keep_alive="30m", base_url=OLLAMA_BASE_URL)


def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)


def format_history(history: list[dict]) -> str:
    return "\n".join(
        f"{'Utilisateur' if h['role'] == 'user' else 'Assistant'}: {h['content']}"
        for h in history
    )


def prepare(question: str, source: str | None, history: list[dict] | None, llm):
    """Reformule la question si besoin, récupère les chunks, prépare les sources."""
    standalone = question
    if history:
        chain = ChatPromptTemplate.from_template(CONTEXTUALIZE_PROMPT) | llm
        standalone = chain.invoke(
            {"history": format_history(history), "question": question}
        ).content.strip()

    docs = get_retriever(source=source).invoke(standalone)
    sources = [
        {
            "source": d.metadata.get("source", "inconnu"),
            "excerpt": d.page_content[:300].strip() + ("…" if len(d.page_content) > 300 else ""),
        }
        for d in docs
    ]
    return standalone, format_docs(docs), sources


def ask_with_sources(question: str, source: str | None = None, history: list[dict] | None = None) -> dict:
    llm = get_llm()
    standalone, context, sources = prepare(question, source, history, llm)
    chain = ChatPromptTemplate.from_template(ANSWER_PROMPT) | llm
    result = chain.invoke({"context": context, "question": standalone})
    return {"answer": result.content, "sources": sources}


def stream_with_sources(question: str, source: str | None = None, history: list[dict] | None = None):
    """Générateur : envoie d'abord les sources, puis la réponse token par token (une ligne JSON par événement)."""
    llm = get_llm()
    standalone, context, sources = prepare(question, source, history, llm)
    yield json.dumps({"type": "sources", "sources": sources}) + "\n"

    chain = ChatPromptTemplate.from_template(ANSWER_PROMPT) | llm
    for chunk in chain.stream({"context": context, "question": standalone}):
        if chunk.content:
            yield json.dumps({"type": "token", "content": chunk.content}) + "\n"

    yield json.dumps({"type": "done"}) + "\n"

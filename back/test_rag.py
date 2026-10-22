from app.rag.chain import get_rag_chain

chain = get_rag_chain()
question = "Quel est le sujet de ce document ?"  # adapte selon ton PDF
response = chain.invoke(question)
print(response)
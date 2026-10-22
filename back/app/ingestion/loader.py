from pathlib import Path
from pypdf import PdfReader

def load_document(file_path: str) -> str:
    """Charge un fichier et retourne son contenu texte brut."""
    path = Path(file_path)
    
    if path.suffix.lower() == ".pdf":
        reader = PdfReader(file_path)
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        return text
    
    elif path.suffix.lower() == ".txt":
        return path.read_text(encoding="utf-8")
    
    else:
        raise ValueError(f"Format non supporté: {path.suffix}")
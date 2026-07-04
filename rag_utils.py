import os

def get_rag_context():
    """
    Reads the local knowledge base file (modi.txt) and returns its contents
    to be injected into the Gemini API system prompt.
    """
    file_path = os.path.join(os.path.dirname(__file__), 'modi.txt')
    if not os.path.exists(file_path):
        print(f"Warning: {file_path} not found.")
        return ""
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
        return content
    except Exception as e:
        print(f"Error reading knowledge base: {e}")
        return ""

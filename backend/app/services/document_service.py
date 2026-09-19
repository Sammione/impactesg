"""
Document Service — Phase 1C: Contextual Chunk Enrichment
Each document chunk is enriched with an AI-generated context header
before being stored in the vector database, dramatically improving
retrieval precision.
"""

import os
import asyncio
from pypdf import PdfReader
from docx import Document as DocxDocument
from typing import List
from langchain.text_splitter import RecursiveCharacterTextSplitter
from app.services.rag_service import rag_service

# Enrichment: how many chars of each chunk to send to AI for context generation
CONTEXT_PREVIEW_SIZE = 600
# Only enrich the first N chunks per document (cost control; others get document-level context)
MAX_ENRICHED_CHUNKS = 30


class DocumentService:

    @staticmethod
    async def _extract_text(file_path: str, filename: str) -> str:
        """Extract raw text from PDF, DOCX, or TXT."""
        extension = os.path.splitext(filename)[1].lower()
        content = ""

        if extension == ".pdf":
            reader = PdfReader(file_path)
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    content += extracted + "\n"
        elif extension == ".docx":
            doc = DocxDocument(file_path)
            for para in doc.paragraphs:
                content += para.text + "\n"
        elif extension == ".txt":
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
        else:
            raise ValueError(f"Unsupported file extension: {extension}")

        return content.strip()

    @staticmethod
    async def _generate_document_summary(content: str, filename: str, framework_id: str) -> str:
        """
        Generate a document-level summary used as fallback context for later chunks.
        Calls AI only once per document.
        """
        from app.services.ai_service import ai_service
        try:
            summary = await ai_service.get_response(
                prompt=(
                    f"Document: {filename} (Framework: {framework_id})\n\n"
                    f"First 1500 characters:\n{content[:1500]}\n\n"
                    "In one concise sentence (max 40 words), describe what type of document this is, "
                    "which organization it is from, and its primary ESG focus."
                ),
                system_prompt="You are a document analyst. Reply with one sentence only."
            )
            return summary.strip()
        except Exception as e:
            print(f"[Enrichment] Document summary failed: {e}")
            return f"{filename} — {framework_id} sustainability document"

    @staticmethod
    async def _enrich_chunks(
        chunks: List[str],
        filename: str,
        framework_id: str,
        doc_summary: str
    ) -> List[str]:
        """
        Phase 1C: Contextual Chunk Enrichment.
        Prepend AI-generated context to each chunk before embedding.
        First MAX_ENRICHED_CHUNKS get individual AI context; rest get document summary.
        """
        from app.services.ai_service import ai_service

        enriched = []

        async def enrich_single(chunk: str, idx: int) -> str:
            if idx < MAX_ENRICHED_CHUNKS:
                try:
                    context = await ai_service.generate_document_context(
                        chunk_text=chunk[:CONTEXT_PREVIEW_SIZE],
                        filename=filename,
                        framework_id=framework_id
                    )
                except Exception:
                    context = doc_summary
            else:
                context = doc_summary

            return f"[Context: {context}]\n\n{chunk}"

        # Run enrichment in parallel (batch of 5 at a time to avoid rate limits)
        batch_size = 5
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            batch_results = await asyncio.gather(*[
                enrich_single(chunk, i + j) for j, chunk in enumerate(batch)
            ])
            enriched.extend(batch_results)

        return enriched

    @staticmethod
    async def process_document(file_path: str, filename: str, framework_id: str = "GRI") -> str:
        """
        Full document processing pipeline:
        1. Extract text
        2. Generate document-level summary
        3. Enrich chunks with contextual headers
        4. Index in RAG (advanced service handles parent-child chunking internally)
        """
        # Step 1: Extract text
        content = await DocumentService._extract_text(file_path, filename)
        if not content:
            return None

        print(f"[DocumentService] Extracted {len(content)} chars from {filename}")

        # Step 2: Generate document-level summary (one AI call)
        doc_summary = await DocumentService._generate_document_summary(
            content, filename, framework_id
        )
        print(f"[DocumentService] Summary: {doc_summary}")

        # Step 3: Pre-split for enrichment (use larger chunks for context generation)
        preview_splitter = RecursiveCharacterTextSplitter(
            chunk_size=800, chunk_overlap=50
        )
        preview_chunks = preview_splitter.split_text(content)

        # Step 4: Enrich chunks with context headers
        print(f"[DocumentService] Enriching {len(preview_chunks)} chunks...")
        enriched_chunks = await DocumentService._enrich_chunks(
            preview_chunks, filename, framework_id, doc_summary
        )

        # Step 5: Pass enriched text to RAG service
        # RAG service will do its own parent-child chunking on the enriched text
        full_enriched_text = "\n\n".join(enriched_chunks)
        await rag_service.add_documents(
            texts=[full_enriched_text],
            metadatas=[{
                "filename": filename,
                "framework_id": framework_id,
                "doc_summary": doc_summary,
                "original_length": len(content)
            }]
        )

        # Also trigger GraphRAG entity extraction in the background
        try:
            from app.services.graph_rag_service import graph_rag_service
            await graph_rag_service.extract_and_add(
                content[:4000],
                {"filename": filename, "framework_id": framework_id}
            )
            print(f"[DocumentService] Knowledge graph updated for {filename}")
        except Exception as e:
            print(f"[DocumentService] GraphRAG update skipped: {e}")

        print(f"[DocumentService] Successfully indexed {filename}")
        return content


document_service = DocumentService()

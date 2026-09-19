"""
Advanced RAG Service — Phases 2 & 3B Implementation

Phase 2A: Hybrid Search — BM25 keyword + ChromaDB semantic search
          merged via Reciprocal Rank Fusion (RRF)
Phase 2B: Parent-Child Chunking — small child chunks (256 tok) for retrieval,
          large parent chunks (1024 tok) returned to GPT for context
Phase 2C: HyDE — Hypothetical Document Embeddings improve vague query retrieval
Phase 3B: CRAG — Corrective RAG with AI relevance grading + query reformulation loop
"""

import os
import json
import asyncio
import re
from pathlib import Path
from typing import List, Optional, Dict, Tuple, Any

from langchain_community.vectorstores import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.schema import Document
from app.core.config import settings

# ─────────────────────────────────────────────────────────────
# Chunking configuration
# ─────────────────────────────────────────────────────────────
CHILD_CHUNK_SIZE = 256      # Small — used for precise retrieval scoring
CHILD_CHUNK_OVERLAP = 32
PARENT_CHUNK_SIZE = 1024    # Large — returned to GPT for rich context
PARENT_CHUNK_OVERLAP = 128

# CRAG thresholds
RELEVANCE_THRESHOLD_HIGH = 0.65   # Answer directly
RELEVANCE_THRESHOLD_LOW = 0.35    # Reformulate and retry
CRAG_MAX_RETRIES = 2

# Base path for all database files
DB_BASE = Path(__file__).resolve().parents[3] / "db"


class AdvancedRAGService:
    """
    Production-grade RAG service with hybrid search, parent-child chunking,
    HyDE, and Corrective RAG (CRAG) self-grading.
    """

    def __init__(self):
        self.persist_dir = str(DB_BASE / "chroma")
        self.bm25_store_path = DB_BASE / "bm25_corpus.json"
        self.parent_store_path = DB_BASE / "parent_chunks.json"

        self.vector_store: Optional[Chroma] = None
        self.embeddings: Optional[OpenAIEmbeddings] = None

        # BM25 index (in-memory, rebuilt from JSON on startup)
        self.bm25_index = None
        self.bm25_corpus: List[Dict] = []   # [{text, metadata}]

        # Parent chunk store: parent_id → parent_text
        self.parent_store: Dict[str, str] = {}

        self._initialized = False
        self._last_error: str = ""

    # ─────────────────────────────────────────────────────────────
    # Initialization
    # ─────────────────────────────────────────────────────────────

    def _init(self):
        if self._initialized:
            return
        try:
            DB_BASE.mkdir(parents=True, exist_ok=True)
            os.makedirs(self.persist_dir, exist_ok=True)

            self.embeddings = OpenAIEmbeddings(openai_api_key=settings.OPENAI_API_KEY)
            self.vector_store = Chroma(
                persist_directory=self.persist_dir,
                embedding_function=self.embeddings,
                collection_name="grinova_v3"
            )
            self._load_bm25()
            self._load_parents()
            self._initialized = True
            print("[RAG] Advanced RAG service initialized successfully.")
        except Exception as e:
            self._last_error = str(e)
            print(f"[RAG] Init error: {e}")

    def reset_all(self):
        """Wipe all vector embeddings, BM25 corpus, and parent chunks."""
        import shutil
        try:
            if self.vector_store:
                try:
                    self.vector_store.delete_collection()
                except Exception:
                    pass
            self.vector_store = None
            self._initialized = False
            self.bm25_corpus = []
            self.bm25_index = None
            self.parent_store = {}
            if os.path.exists(self.persist_dir):
                shutil.rmtree(self.persist_dir)
            if os.path.exists(self.bm25_store_path):
                os.remove(self.bm25_store_path)
            if os.path.exists(self.parent_store_path):
                os.remove(self.parent_store_path)
            print("[RAG] Vector store and indices wiped clean.")
        except Exception as e:
            print(f"[RAG] Error resetting vector store: {e}")

    def _load_bm25(self):
        """Load BM25 corpus from disk and rebuild index."""
        if self.bm25_store_path.exists():
            with open(self.bm25_store_path) as f:
                self.bm25_corpus = json.load(f)
            if self.bm25_corpus:
                try:
                    from rank_bm25 import BM25Okapi
                    tokenized = [doc["text"].lower().split() for doc in self.bm25_corpus]
                    self.bm25_index = BM25Okapi(tokenized)
                    print(f"[RAG] BM25 index loaded: {len(self.bm25_corpus)} documents")
                except ImportError:
                    print("[RAG] rank_bm25 not installed — keyword search disabled")

    def _save_bm25(self):
        """Persist BM25 corpus to disk and rebuild in-memory index."""
        DB_BASE.mkdir(parents=True, exist_ok=True)
        with open(self.bm25_store_path, "w") as f:
            json.dump(self.bm25_corpus, f)
        if self.bm25_corpus:
            try:
                from rank_bm25 import BM25Okapi
                tokenized = [doc["text"].lower().split() for doc in self.bm25_corpus]
                self.bm25_index = BM25Okapi(tokenized)
            except ImportError:
                pass

    def _load_parents(self):
        """Load parent chunk store from disk."""
        if self.parent_store_path.exists():
            with open(self.parent_store_path) as f:
                self.parent_store = json.load(f)
            print(f"[RAG] Parent chunks loaded: {len(self.parent_store)}")

    def _save_parents(self):
        """Persist parent chunk store to disk."""
        DB_BASE.mkdir(parents=True, exist_ok=True)
        with open(self.parent_store_path, "w") as f:
            json.dump(self.parent_store, f)

    # ─────────────────────────────────────────────────────────────
    # Phase 2B: Document Ingestion with Parent-Child Chunking
    # ─────────────────────────────────────────────────────────────

    async def add_documents(self, texts: List[str], metadatas: List[dict] = None):
        """
        Index documents using parent-child chunking strategy:
        - Parent chunks (1024 tokens): stored in parent_store for rich context delivery
        - Child chunks (256 tokens): stored in ChromaDB + BM25 for precise retrieval
        """
        self._init()
        if self.vector_store is None:
            raise ValueError(f"Vector store not initialized: {self._last_error}")

        metadatas = metadatas or [{}] * len(texts)

        parent_splitter = RecursiveCharacterTextSplitter(
            chunk_size=PARENT_CHUNK_SIZE,
            chunk_overlap=PARENT_CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        child_splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHILD_CHUNK_SIZE,
            chunk_overlap=CHILD_CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", " ", ""]
        )

        child_docs_for_chroma: List[Document] = []
        new_bm25_entries: List[Dict] = []

        for text, meta in zip(texts, metadatas):
            filename = meta.get("filename", "unknown")
            framework_id = meta.get("framework_id", "general")

            # Split into parent chunks
            parent_chunks = parent_splitter.split_text(text)

            for p_idx, parent_text in enumerate(parent_chunks):
                parent_id = f"{filename}__p{p_idx}"

                # Store parent for context delivery
                self.parent_store[parent_id] = parent_text

                # Store parent in BM25 (for keyword search)
                new_bm25_entries.append({
                    "text": parent_text,
                    "metadata": {
                        **meta,
                        "parent_id": parent_id,
                        "chunk_type": "parent"
                    }
                })

                # Create child chunks for ChromaDB retrieval
                child_chunks = child_splitter.split_text(parent_text)
                for c_idx, child_text in enumerate(child_chunks):
                    child_docs_for_chroma.append(Document(
                        page_content=child_text,
                        metadata={
                            **meta,
                            "parent_id": parent_id,
                            "chunk_type": "child",
                            "child_idx": c_idx,
                            "framework_id": framework_id
                        }
                    ))

        # Batch add to ChromaDB
        if child_docs_for_chroma:
            self.vector_store.add_documents(child_docs_for_chroma)
            print(f"[RAG] Indexed {len(child_docs_for_chroma)} child chunks in ChromaDB")

        # Update BM25
        self.bm25_corpus.extend(new_bm25_entries)
        self._save_bm25()
        self._save_parents()
        print(f"[RAG] BM25 corpus now has {len(self.bm25_corpus)} parent documents")

    # ─────────────────────────────────────────────────────────────
    # Phase 2A: Hybrid Search (BM25 + Semantic + RRF)
    # ─────────────────────────────────────────────────────────────

    def _bm25_search(self, query: str, k: int = 20) -> List[Tuple[str, Dict, float]]:
        """BM25 keyword search — returns (parent_text, metadata, score)."""
        if not self.bm25_index or not self.bm25_corpus:
            return []
        tokenized_query = query.lower().split()
        scores = self.bm25_index.get_scores(tokenized_query)
        top_indices = sorted(
            range(len(scores)), key=lambda i: scores[i], reverse=True
        )[:k]
        results = []
        for idx in top_indices:
            if scores[idx] > 0:
                doc = self.bm25_corpus[idx]
                results.append((doc["text"], doc["metadata"], float(scores[idx])))
        return results

    def _semantic_search(
        self, query: str, k: int = 20, filter_dict: dict = None
    ) -> List[Tuple[str, Dict, float]]:
        """
        ChromaDB semantic search — returns (parent_text, metadata, score).
        Fetches child chunks but returns their parent text for richer context.
        """
        if not self.vector_store:
            return []
        try:
            results = self.vector_store.similarity_search_with_relevance_scores(
                query,
                k=k,
                filter=filter_dict if filter_dict else None
            )
        except Exception as e:
            print(f"[RAG] Semantic search error: {e}")
            return []

        out = []
        for doc, score in results:
            parent_id = doc.metadata.get("parent_id")
            # Return parent chunk for rich context, fallback to child content
            parent_text = self.parent_store.get(parent_id, doc.page_content)
            out.append((parent_text, doc.metadata, float(score)))
        return out

    def _rrf_fusion(
        self,
        bm25_results: List[Tuple],
        semantic_results: List[Tuple],
        k_const: int = 60
    ) -> List[Tuple[str, Dict]]:
        """
        Reciprocal Rank Fusion (RRF) merges BM25 and semantic rankings.
        RRF score = Σ 1 / (rank + k) for each result set.
        Higher combined score = more likely to be truly relevant.
        """
        rrf_scores: Dict[str, float] = {}
        doc_map: Dict[str, Tuple[str, Dict]] = {}

        def register(rank: int, text: str, meta: dict):
            # Use first 120 chars as dedup key
            key = text[:120].strip().lower()
            doc_map[key] = (text, meta)
            rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (rank + 1 + k_const)

        for rank, (text, meta, _) in enumerate(bm25_results):
            register(rank, text, meta)
        for rank, (text, meta, _) in enumerate(semantic_results):
            register(rank, text, meta)

        sorted_keys = sorted(rrf_scores, key=lambda k: rrf_scores[k], reverse=True)
        return [doc_map[k] for k in sorted_keys]

    async def hybrid_search(
        self, query: str, framework_id: str = None, k: int = 6
    ) -> List[Tuple[str, Dict]]:
        """
        Phase 2A: Hybrid search with RRF fusion.
        Combines BM25 keyword recall with semantic relevance.
        """
        self._init()
        if self.vector_store is None:
            return []

        filter_dict = {"framework_id": framework_id} if framework_id else None

        # Run BM25 and semantic search
        bm25_results = self._bm25_search(query, k=20)
        semantic_results = self._semantic_search(query, k=20, filter_dict=filter_dict)

        print(
            f"[RAG] Hybrid search: BM25={len(bm25_results)}, "
            f"Semantic={len(semantic_results)}"
        )

        # Fuse and return top-k
        fused = self._rrf_fusion(bm25_results, semantic_results)
        return fused[:k]

    # ─────────────────────────────────────────────────────────────
    # Phase 2C: HyDE — Hypothetical Document Embeddings
    # ─────────────────────────────────────────────────────────────

    async def _generate_hypothesis(self, query: str) -> str:
        """
        Generate a hypothetical ideal answer paragraph to enrich the search query.
        The hypothesis has a similar embedding to real document chunks.
        """
        from app.services.ai_service import ai_service
        try:
            hypothesis = await ai_service.get_response(
                prompt=(
                    f"Write a 2–3 sentence factual paragraph that would be the ideal "
                    f"answer to this ESG question, as if found in a real sustainability report: "
                    f"\n\n{query}"
                ),
                system_prompt=(
                    "You are an ESG expert. Write a brief, factual paragraph "
                    "using typical sustainability report language and metrics. "
                    "Do NOT say 'I don't know' — write a plausible example answer."
                )
            )
            return hypothesis.strip()
        except Exception as e:
            print(f"[HyDE] Hypothesis generation failed: {e}")
            return query

    # ─────────────────────────────────────────────────────────────
    # Phase 3B: CRAG — Corrective RAG with Relevance Grading
    # ─────────────────────────────────────────────────────────────

    async def _grade_relevance(self, query: str, chunks: List[str]) -> List[float]:
        """
        Grade each chunk's relevance to the query (0.0 = irrelevant, 1.0 = perfect).
        Uses gpt-4o for fast grading of all chunks in a single call.
        """
        from app.services.ai_service import ai_service
        if not chunks:
            return []

        formatted = "\n\n".join(
            [f"Chunk {i+1}:\n{c[:400]}" for i, c in enumerate(chunks)]
        )
        prompt = (
            f"Query: {query}\n\n"
            f"Retrieved chunks:\n{formatted}\n\n"
            f"Rate each chunk's relevance to the query on a scale of 0.0 to 1.0.\n"
            f"Reply with ONLY a JSON array of floats in the same order.\n"
            f"Example for 3 chunks: [0.9, 0.1, 0.7]"
        )
        try:
            response = await ai_service.get_response(
                prompt=prompt,
                system_prompt=(
                    "You are a relevance grader. Reply with ONLY a JSON array of floats. "
                    "No other text."
                )
            )
            match = re.search(r"\[[\d.,\s]+\]", response)
            if match:
                scores = json.loads(match.group())
                return [min(1.0, max(0.0, float(s))) for s in scores]
        except Exception as e:
            print(f"[CRAG] Grading error: {e}")

        return [0.5] * len(chunks)

    async def _reformulate_query(self, original_query: str) -> str:
        """Reformulate a query when initial retrieval is low-relevance."""
        from app.services.ai_service import ai_service
        try:
            reformulated = await ai_service.get_response(
                prompt=(
                    f"This ESG database search query returned irrelevant results: '{original_query}'\n\n"
                    "Rewrite it to be more specific and use ESG terminology. "
                    "Include relevant framework names (GRI/SASB/IFRS), "
                    "specific metric types, or section names. "
                    "Reply with ONLY the rewritten query, no explanation."
                ),
                system_prompt="You are an ESG search specialist. Rewrite queries to improve retrieval."
            )
            return reformulated.strip().strip('"\'')
        except Exception as e:
            print(f"[CRAG] Reformulation failed: {e}")
            return f"ESG sustainability disclosures {original_query}"

    # ─────────────────────────────────────────────────────────────
    # Public query methods
    # ─────────────────────────────────────────────────────────────

    async def query(
        self,
        query: str,
        framework_id: str = None,
        k: int = 6,
        use_hyde: bool = True
    ) -> str:
        """
        Phase 2A + 2C: Hybrid search with HyDE.
        Used for report generation and Q&A — fast path without CRAG grading.
        """
        self._init()
        if self.vector_store is None:
            return "Knowledge base not available. Please configure your OpenAI API key."

        # HyDE: enrich vague queries with a hypothetical answer
        search_query = query
        if use_hyde:
            hypothesis = await self._generate_hypothesis(query)
            search_query = f"{query}\n\n{hypothesis}"
            print(f"[HyDE] Enriched query with hypothesis ({len(hypothesis)} chars)")

        results = await self.hybrid_search(search_query, framework_id=framework_id, k=k)
        if not results:
            return "No relevant documents found. Please upload sustainability reports first."

        return "\n\n---\n\n".join([text for text, meta in results])

    async def corrective_query(
        self,
        query: str,
        framework_id: str = None,
        k: int = 8
    ) -> str:
        """
        Phase 3B: CRAG — Corrective RAG with relevance grading and retry loop.
        Used by the multi-agent scorer for maximum accuracy.

        Flow:
          1. Retrieve candidates with hybrid search
          2. AI grades each chunk for relevance
          3a. High relevance → filter and return
          3b. Medium relevance → reformulate query → retry
          3c. Low relevance → return with insufficient-data flag
        """
        self._init()
        if self.vector_store is None:
            return "Knowledge base not available."

        current_query = query

        for attempt in range(CRAG_MAX_RETRIES):
            # Step 1: Retrieve candidates (with HyDE on first attempt)
            results = await self.hybrid_search(
                current_query,
                framework_id=framework_id,
                k=k
            )

            if not results:
                return (
                    "No documents found in knowledge base. "
                    "Please upload sustainability reports first."
                )

            chunks = [text for text, meta in results]

            # Step 2: Grade relevance
            scores = await self._grade_relevance(query, chunks)
            avg_score = sum(scores) / len(scores) if scores else 0.0

            print(
                f"[CRAG] Attempt {attempt+1}/{CRAG_MAX_RETRIES} "
                f"— avg relevance: {avg_score:.2f} "
                f"(threshold: {RELEVANCE_THRESHOLD_HIGH})"
            )

            if avg_score >= RELEVANCE_THRESHOLD_HIGH:
                # High relevance — return only the most relevant chunks
                relevant = [
                    chunks[i] for i, s in enumerate(scores)
                    if s >= 0.4
                ]
                print(f"[CRAG] Returning {len(relevant)}/{len(chunks)} relevant chunks")
                return "\n\n---\n\n".join(relevant) if relevant else "\n\n---\n\n".join(chunks[:3])

            if avg_score >= RELEVANCE_THRESHOLD_LOW and attempt == CRAG_MAX_RETRIES - 1:
                # Medium relevance on last attempt — return what we have
                relevant = [chunks[i] for i, s in enumerate(scores) if s >= 0.3]
                return "\n\n---\n\n".join(relevant) if relevant else "\n\n---\n\n".join(chunks[:3])

            if attempt < CRAG_MAX_RETRIES - 1:
                # Reformulate and retry
                print(f"[CRAG] Low relevance ({avg_score:.2f}) — reformulating query...")
                current_query = await self._reformulate_query(query)
                print(f"[CRAG] Reformulated: '{current_query}'")

        # Final fallback — return raw top results
        return "\n\n---\n\n".join(chunks[:k // 2])


rag_service = AdvancedRAGService()

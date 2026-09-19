"""
GraphRAG Service — Phase 3C

Builds a persistent knowledge graph from ESG documents using NetworkX.
Entities: Companies, Frameworks, Metrics, Regulations, SDGs, Locations, Targets
Relations: REPORTS_UNDER, MAPS_TO, ALIGNS_WITH, MEASURED_IN, TARGETS, etc.

At query time:
1. Extracts entities from the user query
2. Traverses the graph to find connected frameworks/metrics/regulations
3. Returns structured graph context to augment vector search results
"""

import json
from pathlib import Path
from typing import Dict, List, Any, Optional

import networkx as nx

# Persist graph as node-link JSON alongside other DB files
DB_BASE = Path(__file__).resolve().parents[3] / "db"
GRAPH_PATH = DB_BASE / "knowledge_graph.json"

# Framework cross-reference mapping — built-in for instant cross-framework queries
FRAMEWORK_CROSSREF = {
    "GRI_301": {"SASB": "Product Design & Lifecycle Management", "IFRS": "IFRS S2", "SDG": ["SDG12"]},
    "GRI_302": {"SASB": "Energy Management", "IFRS": "IFRS S2", "SDG": ["SDG7", "SDG13"]},
    "GRI_303": {"SASB": "Water & Wastewater Management", "IFRS": "IFRS S2", "SDG": ["SDG6"]},
    "GRI_305": {"SASB": "GHG Emissions", "IFRS": "IFRS S2", "SDG": ["SDG13"]},
    "GRI_401": {"SASB": "Labor Practices", "IFRS": "IFRS S1", "SDG": ["SDG8"]},
    "GRI_403": {"SASB": "Occupational Health & Safety", "IFRS": "IFRS S1", "SDG": ["SDG3"]},
    "GRI_405": {"SASB": "Diversity & Inclusion", "IFRS": "IFRS S1", "SDG": ["SDG5", "SDG10"]},
    "GRI_205": {"SASB": "Business Ethics", "IFRS": "IFRS S1", "SDG": ["SDG16"]},
}

# Well-known ESG entity types for normalization
ENTITY_TYPE_KEYWORDS = {
    "Framework": ["GRI", "SASB", "IFRS", "TCFD", "UN SDG", "CDP", "CSRD", "SEC"],
    "Metric": ["emissions", "tCO2e", "energy", "water", "waste", "revenue", "FTE"],
    "SDG": ["SDG"],
    "Regulation": ["CSRD", "SEC Rule", "EU Taxonomy", "Paris Agreement"],
}


class GraphRAGService:
    """
    Knowledge graph service for cross-framework ESG reasoning.
    Graph is built incrementally from uploaded documents.
    """

    def __init__(self):
        self.graph: nx.DiGraph = nx.DiGraph()
        self._loaded = False
        self._load_graph()
        self._bootstrap_framework_nodes()

    # ─────────────────────────────────────────────────────────────
    # Persistence
    # ─────────────────────────────────────────────────────────────

    def _load_graph(self):
        """Load persisted graph from disk."""
        if GRAPH_PATH.exists():
            try:
                with open(GRAPH_PATH) as f:
                    data = json.load(f)
                self.graph = nx.node_link_graph(data)
                self._loaded = True
                print(
                    f"[GraphRAG] Graph loaded: "
                    f"{self.graph.number_of_nodes()} nodes, "
                    f"{self.graph.number_of_edges()} edges"
                )
            except Exception as e:
                print(f"[GraphRAG] Failed to load graph: {e}")
                self.graph = nx.DiGraph()

    def _save_graph(self):
        """Persist graph to disk as node-link JSON."""
        GRAPH_PATH.parent.mkdir(parents=True, exist_ok=True)
        data = nx.node_link_data(self.graph)
        with open(GRAPH_PATH, "w") as f:
            json.dump(data, f, default=str)

    def _bootstrap_framework_nodes(self):
        """
        Pre-seed the graph with well-known GRI/SASB/SDG/IFRS framework nodes
        and their cross-framework mappings. This gives instant value even before
        any document is uploaded.
        """
        if self.graph.has_node("GRI"):
            return  # Already bootstrapped

        # Core framework nodes
        for fw in ["GRI", "SASB", "IFRS_S1", "IFRS_S2", "TCFD", "UN_SDGs", "CSRD"]:
            self.graph.add_node(fw, label=fw.replace("_", " "), type="Framework")

        # GRI standard nodes
        gri_standards = {
            "GRI_200": "GRI 200 Economic",
            "GRI_300": "GRI 300 Environmental",
            "GRI_400": "GRI 400 Social",
            "GRI_305": "GRI 305 Emissions",
            "GRI_302": "GRI 302 Energy",
            "GRI_303": "GRI 303 Water",
            "GRI_401": "GRI 401 Employment",
            "GRI_403": "GRI 403 Occupational Health",
            "GRI_405": "GRI 405 Diversity",
            "GRI_205": "GRI 205 Anti-Corruption",
        }
        for node_id, label in gri_standards.items():
            self.graph.add_node(node_id, label=label, type="Framework")
            self.graph.add_edge("GRI", node_id, relation="INCLUDES")

        # SDG nodes
        for i in range(1, 18):
            self.graph.add_node(f"SDG{i}", label=f"UN SDG {i}", type="SDG")
            self.graph.add_edge("UN_SDGs", f"SDG{i}", relation="INCLUDES")

        # Cross-reference edges from built-in mapping
        for gri_id, mappings in FRAMEWORK_CROSSREF.items():
            if not self.graph.has_node(gri_id):
                self.graph.add_node(gri_id, label=gri_id, type="Framework")
            for fw, mapped in mappings.items():
                if fw == "SDG":
                    for sdg in mapped:
                        self.graph.add_edge(gri_id, sdg, relation="ALIGNS_WITH")
                else:
                    fw_node = mapped.replace(" ", "_")
                    if not self.graph.has_node(fw_node):
                        self.graph.add_node(fw_node, label=mapped, type="Framework")
                    self.graph.add_edge(gri_id, fw_node, relation="MAPS_TO")

        self._save_graph()
        print(
            f"[GraphRAG] Bootstrapped with {self.graph.number_of_nodes()} nodes, "
            f"{self.graph.number_of_edges()} edges"
        )

    # ─────────────────────────────────────────────────────────────
    # Graph building from documents
    # ─────────────────────────────────────────────────────────────

    def _normalize_entity_id(self, label: str) -> str:
        """Create a consistent node ID from an entity label."""
        return label.strip().lower().replace(" ", "_").replace("/", "_").replace(".", "_")[:50]

    def _add_entity(self, entity: dict):
        """Add or update a node in the graph."""
        eid = self._normalize_entity_id(entity.get("id", entity.get("label", "unknown")))
        if not self.graph.has_node(eid):
            self.graph.add_node(
                eid,
                label=entity.get("label", eid),
                type=entity.get("type", "Unknown")
            )
        return eid

    def _add_relationship(self, rel: dict, entity_id_map: dict):
        """Add a directed edge between two entities."""
        from_id = entity_id_map.get(rel.get("from", ""), rel.get("from", ""))
        to_id = entity_id_map.get(rel.get("to", ""), rel.get("to", ""))
        if from_id and to_id and self.graph.has_node(from_id) and self.graph.has_node(to_id):
            self.graph.add_edge(from_id, to_id, relation=rel.get("type", "RELATED_TO"))

    async def extract_and_add(self, text: str, metadata: dict):
        """
        Extract entities and relationships from a document chunk using GPT,
        then add them to the knowledge graph.
        Called by document_service after each upload.
        """
        from app.services.ai_service import ai_service

        print(f"[GraphRAG] Extracting entities from {metadata.get('filename', 'document')}...")

        extracted = await ai_service.extract_graph_entities(text)

        entities = extracted.get("entities", [])
        relationships = extracted.get("relationships", [])

        # Build a local ID map for this batch
        id_map: Dict[str, str] = {}
        for entity in entities:
            original_id = entity.get("id", "")
            normalized_id = self._add_entity(entity)
            id_map[original_id] = normalized_id

        # Add relationships
        for rel in relationships:
            self._add_relationship(rel, id_map)

        # Tag nodes with source document
        for normalized_id in id_map.values():
            if self.graph.has_node(normalized_id):
                node_data = self.graph.nodes[normalized_id]
                sources = node_data.get("sources", [])
                filename = metadata.get("filename", "unknown")
                if filename not in sources:
                    sources.append(filename)
                self.graph.nodes[normalized_id]["sources"] = sources

        self._save_graph()
        print(
            f"[GraphRAG] Added {len(entities)} entities, {len(relationships)} relationships. "
            f"Graph now: {self.graph.number_of_nodes()} nodes"
        )

    # ─────────────────────────────────────────────────────────────
    # Graph querying
    # ─────────────────────────────────────────────────────────────

    def _find_matching_nodes(self, query_terms: List[str]) -> List[str]:
        """Find graph nodes whose labels match any query term."""
        matching = []
        query_lower = " ".join(query_terms).lower()

        for node_id, data in self.graph.nodes(data=True):
            label = data.get("label", node_id).lower()
            if any(term.lower() in label or label in term.lower() for term in query_terms):
                matching.append(node_id)
            elif any(term.lower() in node_id.lower() for term in query_terms):
                matching.append(node_id)

        return list(set(matching))

    def _traverse_neighborhood(
        self, seed_nodes: List[str], radius: int = 2
    ) -> List[Dict]:
        """
        Traverse the graph to collect nodes within `radius` hops of seed nodes.
        Returns list of node dicts with their relationships.
        """
        neighborhood_nodes = set()
        for node in seed_nodes:
            if self.graph.has_node(node):
                try:
                    ego = nx.ego_graph(self.graph, node, radius=radius)
                    neighborhood_nodes.update(ego.nodes())
                except Exception:
                    neighborhood_nodes.add(node)

        result = []
        for node_id in neighborhood_nodes:
            data = dict(self.graph.nodes[node_id])
            edges = []
            for _, target, edata in self.graph.out_edges(node_id, data=True):
                target_label = self.graph.nodes[target].get("label", target)
                edges.append({
                    "relation": edata.get("relation", "RELATED_TO"),
                    "target": target_label,
                    "target_type": self.graph.nodes[target].get("type", "Unknown")
                })
            result.append({
                "id": node_id,
                "label": data.get("label", node_id),
                "type": data.get("type", "Unknown"),
                "relationships": edges[:5]  # Limit to keep context concise
            })

        return result

    def _format_graph_context(self, nodes: List[Dict]) -> str:
        """Format graph nodes as structured context text for GPT."""
        if not nodes:
            return ""

        lines = ["=== Knowledge Graph Context ==="]
        by_type: Dict[str, List] = {}
        for node in nodes:
            t = node.get("type", "Other")
            by_type.setdefault(t, []).append(node)

        for entity_type, type_nodes in by_type.items():
            lines.append(f"\n{entity_type}s:")
            for node in type_nodes[:8]:  # Limit per type
                label = node["label"]
                rels = node.get("relationships", [])
                if rels:
                    rel_strs = [
                        f"{r['relation']} → {r['target']}" for r in rels[:3]
                    ]
                    lines.append(f"  • {label}: {', '.join(rel_strs)}")
                else:
                    lines.append(f"  • {label}")

        return "\n".join(lines)

    async def query(self, query: str) -> str:
        """
        Query the knowledge graph for entities related to the user's question.
        Returns structured context to augment vector search.
        """
        if self.graph.number_of_nodes() == 0:
            return ""

        from app.services.ai_service import ai_service

        # Extract entities from the query
        query_terms = await ai_service.extract_query_entities(query)
        if not query_terms:
            # Fallback: simple keyword extraction
            import re
            query_terms = re.findall(r"\b[A-Z][A-Z0-9_\s]+\b|\bSDG\d+\b|\bGRI\s+\d+\b", query)

        print(f"[GraphRAG] Query entities: {query_terms}")

        # Find matching nodes and traverse neighborhood
        seed_nodes = self._find_matching_nodes(query_terms)
        print(f"[GraphRAG] Seed nodes: {seed_nodes}")

        if not seed_nodes:
            # No matching entities — return framework crossref hints
            return self._get_framework_hints(query)

        neighborhood = self._traverse_neighborhood(seed_nodes, radius=2)
        return self._format_graph_context(neighborhood)

    def _get_framework_hints(self, query: str) -> str:
        """Return relevant framework crossref mappings based on query keywords."""
        query_lower = query.lower()
        hints = []

        keyword_map = {
            "emission": "GRI_305",
            "carbon": "GRI_305",
            "energy": "GRI_302",
            "water": "GRI_303",
            "diversity": "GRI_405",
            "labour": "GRI_401",
            "labor": "GRI_401",
            "health": "GRI_403",
            "safety": "GRI_403",
            "corruption": "GRI_205",
            "governance": "GRI_200",
        }

        for keyword, gri_id in keyword_map.items():
            if keyword in query_lower and gri_id in FRAMEWORK_CROSSREF:
                crossref = FRAMEWORK_CROSSREF[gri_id]
                sdgs = ", ".join(crossref.get("SDG", []))
                hints.append(
                    f"{gri_id} → SASB: {crossref.get('SASB', 'N/A')} "
                    f"| IFRS: {crossref.get('IFRS', 'N/A')} "
                    f"| {sdgs}"
                )

        if hints:
            return "=== Framework Cross-Reference ===\n" + "\n".join(hints)
        return ""

    # ─────────────────────────────────────────────────────────────
    # Graph analytics
    # ─────────────────────────────────────────────────────────────

    def get_graph_stats(self) -> Dict[str, Any]:
        """Return graph statistics for the admin/settings panel."""
        type_counts: Dict[str, int] = {}
        for _, data in self.graph.nodes(data=True):
            t = data.get("type", "Unknown")
            type_counts[t] = type_counts.get(t, 0) + 1

        return {
            "total_nodes": self.graph.number_of_nodes(),
            "total_edges": self.graph.number_of_edges(),
            "entity_types": type_counts,
            "most_connected": sorted(
                [(n, self.graph.degree(n)) for n in self.graph.nodes()],
                key=lambda x: x[1], reverse=True
            )[:5]
        }


graph_rag_service = GraphRAGService()

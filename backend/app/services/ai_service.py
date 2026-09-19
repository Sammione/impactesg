"""
AI Service — Phase 1 Upgrade
- Dual-model strategy: o3-mini for scoring (reasoning), gpt-4o for generation
- Smart model caller handles o-series API differences (no temperature)
- Chain-of-Thought scoring with evidence citations
- New utility methods for multi-agent scorer and GraphRAG
"""

import openai
import json
import re
from typing import List, Optional
from app.core.config import settings


class AIService:
    def __init__(self):
        self.client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

    # ─────────────────────────────────────────────────────────────
    # Core model caller — handles both standard and o-series models
    # ─────────────────────────────────────────────────────────────

    def _call_completion(
        self,
        model: str,
        messages: list,
        response_format: dict = None,
        temperature: float = 0.2,
    ) -> str:
        """
        Smart completion caller.
        - o-series models (o1*, o3*, o4*): no temperature, uses max_completion_tokens
        - Standard models: supports temperature and all parameters
        """
        params: dict = {"model": model, "messages": messages}

        is_reasoning = model.startswith(("o1", "o3", "o4"))
        if is_reasoning:
            params["max_completion_tokens"] = 8192
        else:
            params["temperature"] = temperature

        if response_format:
            params["response_format"] = response_format

        response = self.client.chat.completions.create(**params)
        return response.choices[0].message.content

    # ─────────────────────────────────────────────────────────────
    # Generation methods — use OPENAI_GENERATION_MODEL (gpt-4o)
    # ─────────────────────────────────────────────────────────────

    async def get_response(
        self,
        prompt: str,
        system_prompt: str = "You are an ESG and Sustainability expert.",
    ) -> str:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]
        return self._call_completion(
            model=settings.OPENAI_GENERATION_MODEL,
            messages=messages,
            temperature=0.2,
        )

    async def framework_specific_qa(
        self, query: str, framework_id: str, context: str = ""
    ) -> str:
        from app.services.rag_service import rag_service
        from app.services.graph_rag_service import graph_rag_service

        # Phase 3B: Use CRAG for accurate document retrieval
        if not context:
            context = await rag_service.corrective_query(query, framework_id=framework_id)

        # Phase 3C: Augment with GraphRAG cross-framework context
        graph_context = await graph_rag_service.query(query)

        system_prompt = f"""
You are an expert AI Assistant specialized in the {framework_id} sustainability framework.
Your goal is to provide accurate, professional, and framework-compliant advice.

Use the provided document context to ground your answer with specific evidence.
Use the knowledge graph context to provide cross-framework mapping insights
(e.g., how this topic maps across GRI/SASB/IFRS/SDGs).

If the document context doesn't contain the answer, use your expert knowledge
but clearly state you are doing so.
Always cite specific data points or page references when available.
"""
        prompt = (
            f"User Query: {query}\n\n"
            f"Document Context (from uploaded reports):\n{context}\n\n"
            f"{graph_context}"
        )
        return await self.get_response(prompt, system_prompt)

    async def generate_report_section(
        self, section_name: str, framework_id: str, data: str
    ) -> str:
        from app.services.rag_service import rag_service

        rag_context = await rag_service.query(
            f"{framework_id} requirements for {section_name}", framework_id=framework_id
        )
        system_prompt = (
            f"You are a senior sustainability report writer. Generate a professional, "
            f"board-level quality report section for '{section_name}' following {framework_id} standards."
        )
        prompt = (
            f"Context from Knowledge Base:\n{rag_context}\n\n"
            f"Data to include:\n{data}\n\n"
            f"Requirements: Use professional tone, include strategic insights, "
            f"and ensure alignment with {framework_id} metrics."
        )
        return await self.get_response(prompt, system_prompt)

    async def rewrite_content(self, content: str, rewrite_prompt: str) -> str:
        system_prompt = (
            "You are an elite editor. Rewrite the following content based on the "
            "user's instructions while maintaining professional integrity."
        )
        prompt = f"Original Content:\n{content}\n\nInstruction: {rewrite_prompt}"
        return await self.get_response(prompt, system_prompt)

    async def generate_document_context(
        self, chunk_text: str, filename: str, framework_id: str
    ) -> str:
        """
        Phase 1C: Contextual Chunk Enrichment.
        Generate a brief context header for a document chunk.
        """
        prompt = (
            f"Document: {filename} (Framework: {framework_id})\n\n"
            f"Chunk content (excerpt):\n{chunk_text[:800]}\n\n"
            "Write a single concise sentence (max 30 words) describing what this excerpt is about "
            "and where it fits in the document (e.g. section name, topic). "
            "Start with 'This excerpt covers...'"
        )
        try:
            context = await self.get_response(
                prompt=prompt,
                system_prompt="You are a document analyst. Provide a one-sentence context summary.",
            )
            return context.strip()
        except Exception as e:
            print(f"[Enrichment] Context generation failed: {e}")
            return f"From {filename} ({framework_id} framework)"

    # ─────────────────────────────────────────────────────────────
    # Scoring methods — use OPENAI_SCORING_MODEL (o3-mini)
    # ─────────────────────────────────────────────────────────────

    async def evaluate_esg_score(self, context: str) -> dict:
        """
        Phase 1B: Full ESG evaluation with Chain-of-Thought reasoning.
        Uses o3-mini reasoning model for deep, auditable analysis.
        Returns scores + reasoning + evidence citations + real AI forecast.
        """
        system_prompt = """
You are an elite AI ESG Auditor with deep expertise in GRI, SASB, IFRS S1/S2, and UN SDG frameworks.

Analyze the provided sustainability context and return a rigorous, evidence-based evaluation.

Return a JSON object with EXACTLY this structure:
{
    "reasoning": "<Step-by-step audit logic explaining how you arrived at each score>",
    "scores": {
        "Environmental": <integer 0-100>,
        "Social": <integer 0-100>,
        "Governance": <integer 0-100>,
        "Supply_Chain": <integer 0-100>,
        "Carbon": <integer 0-100>,
        "Diversity": <integer 0-100>
    },
    "evidence": [
        "<Direct quote or reference from the provided context supporting your evaluation>",
        "<Another quote or reference>"
    ],
    "forecast_score": <integer 0-100, your genuine 12-month AI prediction based on trajectory and action plans>,
    "greenwashing_detection": {
        "detected": <boolean>,
        "confidence": <float 0.0-1.0>,
        "reason": "<Specific contradictions, vague claims, or missing data that raised flags>"
    },
    "action_plans": [
        {
            "title": "<Specific, actionable title>",
            "description": "<Detailed step-by-step recommendation with expected outcome>",
            "impact": <integer 1-10>,
            "effort": <integer 1-10>,
            "framework_alignment": "<Which GRI/SASB/SDG standard this addresses>"
        }
    ],
    "data_quality": "<excellent|good|partial|insufficient — assessment of how much real data was available>"
}

Critical rules:
- Generate exactly 3 action plans prioritized by highest impact
- The forecast_score must be a genuine 12-month prediction, not current_score + fixed offset
- If context is empty or minimal, set data_quality to 'insufficient' and flag greenwashing
- Evidence must be direct quotes or references from the context, not fabricated
"""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"ESG Context to evaluate:\n\n{context}"},
        ]
        result = self._call_completion(
            model=settings.OPENAI_SCORING_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
        )
        return json.loads(result)

    async def evaluate_pillar(
        self, pillar: str, context: str, pillar_metrics: dict = None
    ) -> dict:
        """
        Phase 3A: Single pillar evaluation for multi-agent scorer.
        Each specialist agent calls this for its domain.
        Uses o3-mini reasoning model.
        """
        metrics_hint = ""
        if pillar_metrics:
            metrics_hint = f"\nFocus specifically on these metrics: {', '.join(pillar_metrics.keys())}"

        pillar_prompts = {
            "Environmental": (
                "GRI 300s (301-308), Scope 1/2/3 emissions, energy consumption, "
                "water usage, waste management, biodiversity, climate targets"
            ),
            "Social": (
                "GRI 400s (401-419), employee welfare, health & safety, DEI, "
                "human rights, supply chain labour, community engagement, training"
            ),
            "Governance": (
                "GRI 200s (201-206), board composition, anti-corruption, "
                "data privacy, executive pay, shareholder rights, regulatory compliance"
            ),
        }

        focus = pillar_prompts.get(pillar, f"{pillar} ESG metrics")
        system_prompt = f"""
You are a specialist ESG auditor with deep expertise in {pillar} disclosures.
Focus on: {focus}{metrics_hint}

Return a JSON object:
{{
    "pillar": "{pillar}",
    "score": <integer 0-100>,
    "reasoning": "<step-by-step evaluation logic>",
    "evidence": ["<quote from context>", ...],
    "sub_scores": {{
        "<specific metric name>": <integer 0-100>
    }},
    "gaps": ["<missing disclosure or data point>", ...],
    "strengths": ["<notable positive finding>", ...]
}}

Be rigorous. If data is insufficient for a sub-metric, note it in gaps.
"""
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Evaluate {pillar} performance from this context:\n\n{context}",
            },
        ]
        try:
            result = self._call_completion(
                model=settings.OPENAI_SCORING_MODEL,
                messages=messages,
                response_format={"type": "json_object"},
            )
            return json.loads(result)
        except Exception as e:
            print(f"[{pillar}Agent] Evaluation error: {e}")
            return {
                "pillar": pillar,
                "score": 0,
                "reasoning": f"Evaluation failed: {e}",
                "evidence": [],
                "sub_scores": {},
                "gaps": ["Evaluation could not complete"],
                "strengths": [],
            }

    async def detect_greenwashing(
        self,
        env_result: dict,
        social_result: dict,
        gov_result: dict,
        full_context: str,
    ) -> dict:
        """
        Phase 3A: Dedicated greenwashing detection agent.
        Cross-checks all three pillar results for contradictions.
        Uses o3-mini for deep reasoning.
        """
        summary = (
            f"Environmental Agent found: {env_result.get('reasoning', '')[:500]}\n"
            f"Social Agent found: {social_result.get('reasoning', '')[:500]}\n"
            f"Governance Agent found: {gov_result.get('reasoning', '')[:500]}\n\n"
            f"Full document context excerpt:\n{full_context[:2000]}"
        )

        system_prompt = """
You are a specialist ESG Greenwashing Detection Agent.
You receive analysis from three pillar agents (Environmental, Social, Governance)
and look for contradictions, vague claims, missing data, and misleading statements.

Return JSON:
{
    "detected": <boolean>,
    "confidence": <float 0.0-1.0>,
    "reason": "<specific contradictions or issues found>",
    "flags": [
        {
            "type": "<contradiction|vague_claim|missing_data|misleading_target>",
            "description": "<specific finding>",
            "severity": "<high|medium|low>"
        }
    ]
}
"""
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Cross-check these pillar analyses for greenwashing:\n\n{summary}",
            },
        ]
        try:
            result = self._call_completion(
                model=settings.OPENAI_SCORING_MODEL,
                messages=messages,
                response_format={"type": "json_object"},
            )
            return json.loads(result)
        except Exception as e:
            print(f"[GreenwashingAgent] Error: {e}")
            return {"detected": False, "confidence": 0.0, "reason": f"Detection failed: {e}", "flags": []}

    async def generate_action_plans(
        self, env_result: dict, social_result: dict, gov_result: dict
    ) -> list:
        """
        Phase 3A: Orchestrator generates consolidated action plans from all pillar findings.
        """
        gaps_summary = (
            f"Environmental gaps: {env_result.get('gaps', [])}\n"
            f"Social gaps: {social_result.get('gaps', [])}\n"
            f"Governance gaps: {gov_result.get('gaps', [])}\n\n"
            f"Env score: {env_result.get('score', 0)}, "
            f"Social score: {social_result.get('score', 0)}, "
            f"Gov score: {gov_result.get('score', 0)}"
        )

        system_prompt = """
You are an ESG Strategy Advisor. Based on the gap analysis from specialist agents,
generate exactly 3 high-priority action plans sorted by (impact - effort) descending.

Return JSON array:
[
    {
        "title": "<Specific actionable title>",
        "description": "<Detailed recommendation with expected outcome and timeline>",
        "impact": <integer 1-10>,
        "effort": <integer 1-10>,
        "framework_alignment": "<GRI standard or SASB topic this addresses>",
        "pillar": "<Environmental|Social|Governance>"
    }
]
"""
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Generate action plans based on these gaps:\n\n{gaps_summary}",
            },
        ]
        try:
            result = self._call_completion(
                model=settings.OPENAI_SCORING_MODEL,
                messages=messages,
                response_format={"type": "json_object"},
            )
            parsed = json.loads(result)
            # Handle both array and {"action_plans": [...]} formats
            if isinstance(parsed, list):
                return parsed
            return parsed.get("action_plans", parsed.get("plans", []))
        except Exception as e:
            print(f"[Orchestrator] Action plan error: {e}")
            return []

    # ─────────────────────────────────────────────────────────────
    # GraphRAG utility methods
    # ─────────────────────────────────────────────────────────────

    async def extract_graph_entities(self, text: str) -> dict:
        """
        Phase 3C: Extract entities and relationships from text for knowledge graph.
        """
        system_prompt = """
You are a knowledge graph extractor for ESG documents.
Extract named entities and their relationships from the text.

Return JSON:
{
    "entities": [
        {
            "id": "<unique_snake_case_id>",
            "label": "<display name>",
            "type": "<Company|Framework|Metric|Regulation|SDG|Location|Person|Target>"
        }
    ],
    "relationships": [
        {
            "from": "<entity_id>",
            "to": "<entity_id>",
            "type": "<REPORTS_UNDER|MAPS_TO|ALIGNS_WITH|MEASURED_IN|LOCATED_IN|TARGETS|MANAGED_BY>"
        }
    ]
}

Focus on ESG-relevant entities: companies, frameworks (GRI/SASB/IFRS), 
metrics (emissions/energy/water), SDGs, regulations, targets.
Return max 15 entities and 20 relationships to keep the graph focused.
"""
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Extract entities and relationships:\n\n{text[:3000]}",
            },
        ]
        try:
            result = self._call_completion(
                model=settings.OPENAI_GENERATION_MODEL,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            return json.loads(result)
        except Exception as e:
            print(f"[GraphRAG] Entity extraction error: {e}")
            return {"entities": [], "relationships": []}

    async def extract_query_entities(self, query: str) -> list:
        """
        Phase 3C: Extract entity IDs from a user query for graph traversal.
        """
        prompt = (
            f"From this query, extract key ESG entity names (company names, framework names, "
            f"metric types, SDG numbers). Return ONLY a JSON array of strings.\n\n"
            f"Query: {query}"
        )
        try:
            result = await self.get_response(
                prompt=prompt,
                system_prompt="Extract entity names. Reply with ONLY a JSON array of strings.",
            )
            match = re.search(r"\[.*?\]", result, re.DOTALL)
            if match:
                return json.loads(match.group())
        except Exception as e:
            print(f"[GraphRAG] Query entity extraction error: {e}")
        return []


ai_service = AIService()

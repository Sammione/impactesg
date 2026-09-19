"""
Multi-Agent ESG Scorer — Phase 3A

Architecture:
  ┌─ EnvironmentalAgent  → GRI 300s, Scope 1/2/3, energy, water, biodiversity
  ├─ SocialAgent         → GRI 400s, labour, DEI, health & safety, community
  ├─ GovernanceAgent     → GRI 200s, board, anti-corruption, data privacy
  └─ GreenwashingAgent   → cross-checks all three for contradictions

All agents run in parallel via asyncio.gather().
Orchestrator combines results with GRI-standard weighting.
"""

import asyncio
from typing import Dict, Any, List


# Domain-specific RAG queries for each agent
AGENT_RAG_QUERIES = {
    "Environmental": (
        "environmental disclosures emissions energy consumption water usage "
        "waste biodiversity climate targets renewable GRI 301 302 303 304 305 306 307 308"
    ),
    "Social": (
        "social responsibility employees labour rights diversity inclusion "
        "health safety training community human rights supply chain GRI 401 402 403 404 405 406 407 408 409 410"
    ),
    "Governance": (
        "governance board composition anti-corruption compliance ethics "
        "data privacy executive pay shareholder rights audit risk management GRI 201 202 203 204 205 206"
    ),
}

# GRI-standard pillar weights for overall score calculation
PILLAR_WEIGHTS = {
    "Environmental": 0.40,
    "Social": 0.30,
    "Governance": 0.30,
}


class MultiAgentScorer:
    """
    Runs 4 specialist ESG agents in parallel, then orchestrates results
    into a final comprehensive ESG assessment.
    """

    async def _run_pillar_agent(
        self,
        pillar: str,
        shared_context: str,
    ) -> Dict[str, Any]:
        """
        Individual pillar agent:
        1. Uses CRAG to get domain-specific context from the knowledge base
        2. Combines with shared full-document context
        3. Evaluates the pillar with o3-mini reasoning
        """
        from app.services.rag_service import rag_service
        from app.services.ai_service import ai_service

        print(f"[{pillar}Agent] Starting domain-specific CRAG retrieval...")

        # CRAG retrieval focused on this pillar's domain
        try:
            domain_context = await rag_service.corrective_query(
                query=AGENT_RAG_QUERIES[pillar],
                k=8
            )
        except Exception as e:
            print(f"[{pillar}Agent] CRAG retrieval failed: {e}")
            domain_context = ""

        # Combine domain-specific with shared context
        combined_context = (
            f"=== Domain-Specific Retrieval ({pillar}) ===\n{domain_context}\n\n"
            f"=== Full Document Context ===\n{shared_context[:2000]}"
        )

        print(f"[{pillar}Agent] Evaluating with o3-mini ({len(combined_context)} chars context)...")
        result = await ai_service.evaluate_pillar(pillar=pillar, context=combined_context)
        print(f"[{pillar}Agent] Score: {result.get('score', 0)}")
        return result

    async def _run_greenwashing_agent(
        self,
        env_result: Dict,
        social_result: Dict,
        gov_result: Dict,
        shared_context: str,
    ) -> Dict[str, Any]:
        """
        Greenwashing detection agent — cross-checks all three pillars.
        """
        from app.services.ai_service import ai_service
        print("[GreenwashingAgent] Starting cross-pillar contradiction analysis...")
        result = await ai_service.detect_greenwashing(
            env_result=env_result,
            social_result=social_result,
            gov_result=gov_result,
            full_context=shared_context,
        )
        detected = result.get("detected", False)
        confidence = result.get("confidence", 0.0)
        print(f"[GreenwashingAgent] Detected={detected}, Confidence={confidence:.2f}")
        return result

    async def _get_shared_context(self) -> str:
        """
        Retrieve a broad document overview for cross-agent context sharing.
        Uses HyDE query — no CRAG grading needed here.
        """
        from app.services.rag_service import rag_service
        try:
            return await rag_service.query(
                "Provide a comprehensive summary of this organization's "
                "environmental, social and governance sustainability performance, "
                "targets, metrics, and policies.",
                k=5,
                use_hyde=True
            )
        except Exception as e:
            print(f"[MultiAgent] Shared context retrieval failed: {e}")
            return ""

    def _calculate_overall_score(
        self,
        env_result: Dict,
        social_result: Dict,
        gov_result: Dict,
    ) -> float:
        """GRI-standard weighted average of three pillar scores."""
        env_score = float(env_result.get("score", 0))
        soc_score = float(social_result.get("score", 0))
        gov_score = float(gov_result.get("score", 0))

        overall = (
            env_score * PILLAR_WEIGHTS["Environmental"]
            + soc_score * PILLAR_WEIGHTS["Social"]
            + gov_score * PILLAR_WEIGHTS["Governance"]
        )
        return round(overall, 1)

    def _derive_forecast(
        self,
        overall: float,
        env_result: Dict,
        social_result: Dict,
        gov_result: Dict,
        greenwashing: Dict,
    ) -> float:
        """
        Derive a 12-month forecast from pillar trajectories and greenwashing risk.
        Based on: gaps count, score headroom, greenwashing penalty.
        """
        # Count total gaps as a headwind signal
        total_gaps = (
            len(env_result.get("gaps", []))
            + len(social_result.get("gaps", []))
            + len(gov_result.get("gaps", []))
        )
        total_strengths = (
            len(env_result.get("strengths", []))
            + len(social_result.get("strengths", []))
            + len(gov_result.get("strengths", []))
        )

        # Base trajectory: more strengths than gaps → upward trend
        net = total_strengths - total_gaps
        base_change = net * 1.5  # each net strength = +1.5 points over 12 months

        # Greenwashing penalty
        gw_penalty = 0
        if greenwashing.get("detected"):
            gw_penalty = greenwashing.get("confidence", 0.5) * 8.0

        forecast = round(min(100.0, max(0.0, overall + base_change - gw_penalty)), 1)
        print(
            f"[Orchestrator] Forecast: {overall} "
            f"+ {base_change:.1f} trend "
            f"- {gw_penalty:.1f} gw_penalty = {forecast}"
        )
        return forecast

    async def run_full_assessment(
        self,
        current_score: float,
        db_metrics: list = None,
    ) -> Dict[str, Any]:
        """
        Main entry point — runs all agents in parallel, then orchestrates.

        Returns the same interface as scoring_engine for backward compatibility:
        {
            overall_score, breakdown, forecast_score,
            risk_level, status, greenwashing, action_plans,
            agent_details (NEW — per-pillar reasoning and evidence)
        }
        """
        print("\n" + "="*60)
        print("[MultiAgent] Starting full parallel ESG assessment")
        print("="*60)

        # Step 1: Get shared broad context (sequential — needed by all agents)
        shared_context = await self._get_shared_context()

        if db_metrics:
            metrics_str = "\n".join(
                [f"- {m.name}: {m.value} {m.unit} ({m.period})" for m in db_metrics]
            )
            shared_context += f"\n\nQuantitative Metrics from Database:\n{metrics_str}"

        # Step 2: Run E, S, G agents in parallel
        print("[MultiAgent] Running E/S/G agents in parallel...")
        env_result, social_result, gov_result = await asyncio.gather(
            self._run_pillar_agent("Environmental", shared_context),
            self._run_pillar_agent("Social", shared_context),
            self._run_pillar_agent("Governance", shared_context),
        )

        # Step 3: Run greenwashing agent (needs pillar results)
        greenwashing = await self._run_greenwashing_agent(
            env_result, social_result, gov_result, shared_context
        )

        # Step 4: Generate consolidated action plans
        print("[Orchestrator] Generating consolidated action plans...")
        from app.services.ai_service import ai_service
        action_plans = await ai_service.generate_action_plans(
            env_result, social_result, gov_result
        )

        # Step 5: Orchestrate final scores
        overall = self._calculate_overall_score(env_result, social_result, gov_result)
        forecast = self._derive_forecast(
            overall, env_result, social_result, gov_result, greenwashing
        )

        risk_level = (
            "Low" if overall > 80
            else "High" if overall < 60
            else "Medium"
        )
        status = (
            "Optimized" if overall > 80
            else "At Risk" if overall < 60
            else "Needs Improvement"
        )

        print(f"\n[Orchestrator] Final Score: {overall} | Forecast: {forecast}")
        print(f"[Orchestrator] E:{env_result.get('score')} S:{social_result.get('score')} G:{gov_result.get('score')}")
        print("="*60 + "\n")

        return {
            "overall_score": overall,
            "breakdown": {
                "Environmental": env_result.get("score", 0),
                "Social": social_result.get("score", 0),
                "Governance": gov_result.get("score", 0),
                "Supply_Chain": env_result.get("sub_scores", {}).get("Supply Chain"),
                "Carbon": env_result.get("sub_scores", {}).get("Carbon Emissions"),
                "Diversity": social_result.get("sub_scores", {}).get("DEI / Diversity"),
            },
            "forecast_score": forecast,
            "risk_level": risk_level,
            "status": status,
            "greenwashing": greenwashing,
            "action_plans": action_plans,
            # Rich per-pillar details — stored in DB insights, shown in UI
            "agent_details": {
                "Environmental": {
                    "reasoning": env_result.get("reasoning", ""),
                    "evidence": env_result.get("evidence", []),
                    "gaps": env_result.get("gaps", []),
                    "strengths": env_result.get("strengths", []),
                    "sub_scores": env_result.get("sub_scores", {}),
                },
                "Social": {
                    "reasoning": social_result.get("reasoning", ""),
                    "evidence": social_result.get("evidence", []),
                    "gaps": social_result.get("gaps", []),
                    "strengths": social_result.get("strengths", []),
                    "sub_scores": social_result.get("sub_scores", {}),
                },
                "Governance": {
                    "reasoning": gov_result.get("reasoning", ""),
                    "evidence": gov_result.get("evidence", []),
                    "gaps": gov_result.get("gaps", []),
                    "strengths": gov_result.get("strengths", []),
                    "sub_scores": gov_result.get("sub_scores", {}),
                },
            },
        }


multi_agent_scorer = MultiAgentScorer()

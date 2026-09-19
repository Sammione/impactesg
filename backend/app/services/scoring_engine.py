"""
Scoring Engine — Phase 3A Update
Delegates all ESG assessment to the MultiAgentScorer.
Maintains backward-compatible interface for analytics.py endpoints.
"""

from typing import Dict, Any
from app.services.multi_agent_scorer import multi_agent_scorer


class ScoringEngine:
    """
    Scoring engine — now a thin orchestration layer over MultiAgentScorer.
    All intelligence lives in multi_agent_scorer.py.
    """

    # Industry benchmarks used for dashboard comparisons
    INDUSTRY_BENCHMARKS = {
        "Technology": 72.5,
        "Manufacturing": 58.0,
        "Finance": 68.5,
        "Energy": 52.0,
        "Healthcare": 70.0,
        "Retail": 61.0,
        "Transportation": 55.0,
        "Real Estate": 63.0,
        "Agriculture": 50.0,
        "Default": 65.0
    }

    # GRI-standard framework weights (kept for reference/display)
    FRAMEWORK_WEIGHTS = {
        "GRI": {"Environmental": 0.40, "Social": 0.30, "Governance": 0.30},
        "SASB": {"Environment": 0.25, "Social Capital": 0.20, "Human Capital": 0.20,
                 "Business Model": 0.20, "Leadership": 0.15},
        "UN SDGs": {"Alignment": 1.0}
    }

    async def calculate_dynamic_score(
        self,
        current_score: float,
        db_metrics: list = None
    ) -> Dict[str, Any]:
        """
        Run a full multi-agent ESG assessment.
        Uses Phase 3A parallel agent architecture with CRAG retrieval.

        Falls back to stable unchanged score if all AI calls fail.
        """
        try:
            result = await multi_agent_scorer.run_full_assessment(
                current_score=current_score,
                db_metrics=db_metrics
            )
            return result
        except Exception as e:
            print(f"[ScoringEngine] Multi-agent assessment failed: {e}")
            return self._stable_fallback(current_score)

    def _stable_fallback(self, current_score: float) -> Dict[str, Any]:
        """
        Return current score unchanged when AI is unavailable.
        No random numbers — deterministic and honest.
        """
        return {
            "overall_score": current_score,
            "breakdown": {
                "Environmental": current_score,
                "Social": current_score,
                "Governance": current_score,
                "Supply_Chain": None,
                "Carbon": None,
                "Diversity": None,
            },
            "forecast_score": current_score,
            "risk_level": "Low" if current_score > 80 else ("High" if current_score < 60 else "Medium"),
            "status": "Optimized" if current_score > 80 else ("At Risk" if current_score < 60 else "Needs Improvement"),
            "greenwashing": {
                "detected": False,
                "confidence": 0.0,
                "reason": "AI unavailable — previous score retained unchanged."
            },
            "action_plans": [],
            "agent_details": {}
        }


scoring_engine = ScoringEngine()

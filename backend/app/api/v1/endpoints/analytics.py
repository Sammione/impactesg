from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import analytics, document
from app.services.scoring_engine import scoring_engine
from datetime import datetime, timezone

router = APIRouter()

def _relative_time(dt) -> str:
    """Convert a datetime to a human-readable relative string."""
    if dt is None:
        return "Unknown"
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = int((now - dt).total_seconds())
    if diff < 60:
        return "Just now"
    elif diff < 3600:
        m = diff // 60
        return f"{m} minute{'s' if m > 1 else ''} ago"
    elif diff < 86400:
        h = diff // 3600
        return f"{h} hour{'s' if h > 1 else ''} ago"
    else:
        d = diff // 86400
        return f"{d} day{'s' if d > 1 else ''} ago"


@router.get("/stats")
async def get_dashboard_stats(db: Session = Depends(get_db)):
    org = db.query(analytics.Organization).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    docs = db.query(document.Document).all()
    doc_count = len(docs)

    benchmark = scoring_engine.INDUSTRY_BENCHMARKS.get(org.industry, scoring_engine.INDUSTRY_BENCHMARKS["Default"])

    # If no documents have been uploaded, return honest zero/unassessed state
    if doc_count == 0:
        activities = db.query(analytics.ActivityLog).order_by(analytics.ActivityLog.created_at.desc()).limit(5).all()
        return {
            "organization": {
                "name": org.name,
                "industry": org.industry,
                "overall_score": 0.0,
                "status": "Awaiting Documents",
                "risk_level": "Unassessed"
            },
            "has_documents": False,
            "document_count": 0,
            "radar_data": [0, 0, 0, 0, 0, 0],
            "forecast_score": 0.0,
            "industry_benchmark": benchmark,
            "activities": [
                {"user_name": a.user_name, "action": a.action, "time": _relative_time(a.created_at)}
                for a in activities
            ],
            "insights": [],
            "action_plans": []
        }

    latest_score = db.query(analytics.ScoreHistory).filter(
        analytics.ScoreHistory.organization_id == org.id
    ).order_by(analytics.ScoreHistory.id.desc()).first()

    if latest_score:
        radar_data = [
            latest_score.env_score or 0,
            latest_score.soc_score or 0,
            latest_score.gov_score or 0,
            latest_score.supply_chain_score or 0,
            latest_score.carbon_score or 0,
            latest_score.diversity_score or 0
        ]
    else:
        radar_data = [0, 0, 0, 0, 0, 0]

    activities = db.query(analytics.ActivityLog).order_by(analytics.ActivityLog.created_at.desc()).limit(5).all()
    insights = db.query(analytics.Insight).order_by(analytics.Insight.created_at.desc()).limit(5).all()
    action_plans = db.query(analytics.ActionPlan).filter(
        analytics.ActionPlan.organization_id == org.id
    ).order_by(analytics.ActionPlan.created_at.desc()).limit(3).all()

    return {
        "organization": {
            "name": org.name,
            "industry": org.industry,
            "overall_score": org.current_score,
            "status": org.current_status,
            "risk_level": org.risk_level
        },
        "has_documents": True,
        "document_count": doc_count,
        "radar_data": radar_data,
        "forecast_score": latest_score.forecast_score if latest_score and latest_score.forecast_score else org.current_score,
        "industry_benchmark": benchmark,
        "activities": [
            {"user_name": a.user_name, "action": a.action, "time": _relative_time(a.created_at)}
            for a in activities
        ],
        "insights": [
            {"type": i.type, "title": i.title, "description": i.description} for i in insights
        ],
        "action_plans": [
            {
                "title": p.title,
                "description": p.description,
                "status": p.status,
                "impact": p.impact,
                "effort": p.effort
            } for p in action_plans
        ]
    }

@router.get("/history")
async def get_score_history(db: Session = Depends(get_db)):
    org = db.query(analytics.Organization).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    benchmark = scoring_engine.INDUSTRY_BENCHMARKS.get(org.industry, scoring_engine.INDUSTRY_BENCHMARKS["Default"])

    doc_count = db.query(document.Document).count()
    if doc_count == 0:
        return {
            "labels": [],
            "scores": [],
            "env_scores": [],
            "soc_scores": [],
            "gov_scores": [],
            "current_score": 0.0,
            "industry_benchmark": benchmark,
            "identified_risks": 0,
            "action_plans": [],
            "timeline": []
        }

    history = db.query(analytics.ScoreHistory).filter(
        analytics.ScoreHistory.organization_id == org.id
    ).order_by(analytics.ScoreHistory.id.asc()).all()

    labels = [h.period_name for h in history]
    scores = [h.overall_score for h in history]
    env_scores = [h.env_score for h in history]
    soc_scores = [h.soc_score for h in history]
    gov_scores = [h.gov_score for h in history]

    action_plans = db.query(analytics.ActionPlan).filter(analytics.ActionPlan.organization_id == org.id).all()
    insights = db.query(analytics.Insight).order_by(analytics.Insight.created_at.desc()).limit(10).all()

    return {
        "labels": labels,
        "scores": scores,
        "env_scores": env_scores,
        "soc_scores": soc_scores,
        "gov_scores": gov_scores,
        "current_score": org.current_score,
        "industry_benchmark": benchmark,
        "identified_risks": db.query(analytics.Insight).filter(analytics.Insight.type == "warning").count(),
        "action_plans": [
            {
                "title": p.title,
                "description": p.description,
                "impact": p.impact,
                "effort": p.effort
            } for p in action_plans
        ],
        "timeline": [
            {
                "type": i.type,
                "title": i.title,
                "description": i.description,
                "date": i.created_at.strftime("%Y-%m-%d %H:%M") if i.created_at else ""
            } for i in insights
        ]
    }

@router.post("/trigger-score")
async def trigger_manual_assessment(db: Session = Depends(get_db)):
    org = db.query(analytics.Organization).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    doc_count = db.query(document.Document).count()
    if doc_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No documents uploaded yet. Please upload a sustainability report first in 'Documents & Upload' before triggering an assessment."
        )

    db_metrics = db.query(analytics.QuantitativeMetric).filter(
        analytics.QuantitativeMetric.organization_id == org.id
    ).all()

    new_data = await scoring_engine.calculate_dynamic_score(org.current_score, db_metrics)

    org.current_score = new_data["overall_score"]
    org.current_status = new_data["status"]
    org.risk_level = new_data["risk_level"]

    breakdown = new_data["breakdown"]
    new_history = analytics.ScoreHistory(
        organization_id=org.id,
        period_name=f"Manual Run {datetime.now().strftime('%m/%d %H:%M')}",
        overall_score=new_data["overall_score"],
        env_score=breakdown.get("Environmental"),
        soc_score=breakdown.get("Social"),
        gov_score=breakdown.get("Governance"),
        supply_chain_score=breakdown.get("Supply_Chain"),
        carbon_score=breakdown.get("Carbon"),
        diversity_score=breakdown.get("Diversity"),
        forecast_score=new_data["forecast_score"]
    )

    for plan in new_data.get("action_plans", []):
        db.add(analytics.ActionPlan(
            organization_id=org.id,
            title=plan["title"],
            description=plan["description"],
            impact=plan.get("impact", 5),
            effort=plan.get("effort", 5)
        ))

    gw = new_data.get("greenwashing", {})
    if gw.get("detected"):
        db.add(analytics.Insight(
            type="greenwashing",
            title=f"AI Greenwashing Alert (confidence: {gw.get('confidence', 0):.0%})",
            description=gw.get("reason", "Inconsistencies detected in documents.")
        ))

    # Store per-pillar reasoning as insights for the audit trail
    agent_details = new_data.get("agent_details", {})
    for pillar, details in agent_details.items():
        gaps = details.get("gaps", [])
        strengths = details.get("strengths", [])
        if gaps or strengths:
            description = ""
            if strengths:
                description += "Strengths: " + "; ".join(strengths[:2]) + ". "
            if gaps:
                description += "Gaps: " + "; ".join(gaps[:2]) + "."
            db.add(analytics.Insight(
                type="insight",
                title=f"{pillar} Agent Analysis",
                description=description.strip()
            ))

    db.add(analytics.ActivityLog(
        user_name="System",
        action="Triggered Manual Assessment"
    ))

    db.add(new_history)
    db.commit()

    return {"status": "success", "new_score": org.current_score}

from pydantic import BaseModel

class MetricCreate(BaseModel):
    name: str
    value: float
    unit: str
    period: str

@router.post("/metrics")
async def add_quantitative_metric(metric: MetricCreate, db: Session = Depends(get_db)):
    org = db.query(analytics.Organization).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    new_metric = analytics.QuantitativeMetric(
        organization_id=org.id,
        name=metric.name,
        value=metric.value,
        unit=metric.unit,
        period=metric.period
    )
    db.add(new_metric)
    db.commit()
    return {"status": "success", "message": "Metric added successfully"}

@router.post("/reset")
async def reset_platform_data(db: Session = Depends(get_db)):
    """Reset all scoring history, action plans, insights, and vector store to a clean zero state."""
    org = db.query(analytics.Organization).first()
    if org:
        org.current_score = 0.0
        org.current_status = "Awaiting Documents"
        org.risk_level = "Unassessed"

    db.query(analytics.ScoreHistory).delete()
    db.query(analytics.ActionPlan).delete()
    db.query(analytics.Insight).delete()
    db.query(analytics.ActivityLog).delete()
    db.query(analytics.QuantitativeMetric).delete()
    db.query(document.Document).delete()

    db.add(analytics.ActivityLog(
        user_name="System",
        action="Platform reset to clean initial state."
    ))
    db.commit()

    try:
        from app.services.rag_service import rag_service
        rag_service.reset_all()
    except Exception as e:
        print(f"[RAG] Error resetting vector store: {e}")

    return {"status": "success", "message": "Platform reset to clean initial state with score 0.0"}


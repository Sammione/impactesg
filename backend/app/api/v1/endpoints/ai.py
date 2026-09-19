from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.services.ai_service import ai_service
from app.services.framework_engine import framework_engine
from app.services.document_service import document_service
import shutil
import os
from pathlib import Path
from datetime import datetime
from app.db.session import get_db
from app.models import analytics, document
from app.services.scoring_engine import scoring_engine

router = APIRouter()

# Absolute path for uploads — safe regardless of working directory
UPLOADS_DIR = Path(__file__).resolve().parents[4] / "uploads"

class ChatRequest(BaseModel):
    query: str
    framework_id: str
    context: str = ""

class RewriteRequest(BaseModel):
    content: str
    instruction: str

class SectionRequest(BaseModel):
    section_name: str
    framework_id: str
    data: str

@router.post("/chat")
async def chat_with_framework(request: ChatRequest):
    try:
        response = await ai_service.framework_specific_qa(
            query=request.query,
            framework_id=request.framework_id,
            context=request.context
        )
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rewrite")
async def rewrite_text(request: RewriteRequest):
    try:
        response = await ai_service.rewrite_content(
            content=request.content,
            rewrite_prompt=request.instruction
        )
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-section")
async def generate_section(request: SectionRequest):
    try:
        response = await ai_service.generate_report_section(
            section_name=request.section_name,
            framework_id=request.framework_id,
            data=request.data
        )
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/frameworks")
async def list_frameworks():
    return framework_engine.list_frameworks()

@router.post("/upload-document")
async def upload_document(
    file: UploadFile = File(...),
    framework_id: str = Form("GRI"),
    db: Session = Depends(get_db)
):
    try:
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        file_path = str(UPLOADS_DIR / file.filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        content = await document_service.process_document(file_path, file.filename, framework_id)

        org = db.query(analytics.Organization).first()
        if org:
            db.add(analytics.ActivityLog(
                user_name="System",
                action=f"Uploaded document: {file.filename}"
            ))

            new_doc = document.Document(
                filename=file.filename,
                content_type=file.content_type or "application/octet-stream",
                file_path=file_path,
                framework_id=framework_id,
                status="processed"
            )
            db.add(new_doc)

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
                period_name=f"Ingestion {datetime.now().strftime('%m/%d %H:%M')}",
                overall_score=new_data["overall_score"],
                env_score=breakdown.get("Environmental"),
                soc_score=breakdown.get("Social"),
                gov_score=breakdown.get("Governance"),
                supply_chain_score=breakdown.get("Supply_Chain"),
                carbon_score=breakdown.get("Carbon"),
                diversity_score=breakdown.get("Diversity"),
                forecast_score=new_data["forecast_score"]
            )
            db.add(new_history)

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
                    title="AI Greenwashing Alert",
                    description=gw.get("reason", "Inconsistencies detected in uploaded documents.")
                ))

            db.commit()

        return {
            "filename": file.filename,
            "status": "success",
            "message": "Document processed and framework requirements generated successfully",
            "framework_id": framework_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/documents")
async def list_documents(db: Session = Depends(get_db)):
    try:
        docs = db.query(document.Document).order_by(document.Document.created_at.desc()).all()
        return [
            {
                "id": d.id,
                "name": d.filename,
                "framework": d.framework_id,
                "created_at": d.created_at
            }
            for d in docs
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: int, db: Session = Depends(get_db)):
    try:
        doc = db.query(document.Document).filter(document.Document.id == doc_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        doc_name = doc.filename
        if os.path.exists(doc.file_path):
            try:
                os.remove(doc.file_path)
            except Exception:
                pass

        db.delete(doc)
        db.commit()

        # Check remaining documents count
        remaining = db.query(document.Document).count()
        org = db.query(analytics.Organization).first()

        if remaining == 0 and org:
            # Complete reset to zero state: no documents left
            org.current_score = 0.0
            org.current_status = "Awaiting Documents"
            org.risk_level = "Unassessed"
            db.query(analytics.ScoreHistory).filter(analytics.ScoreHistory.organization_id == org.id).delete()
            db.query(analytics.ActionPlan).filter(analytics.ActionPlan.organization_id == org.id).delete()
            db.query(analytics.Insight).delete()
            db.add(analytics.ActivityLog(
                user_name="System",
                action=f"Deleted document '{doc_name}'. System reset to clean state."
            ))
            db.commit()

            try:
                from app.services.rag_service import rag_service
                rag_service.reset_all()
            except Exception as e:
                print(f"[RAG] Reset error on document delete: {e}")

        elif remaining > 0 and org:
            # Recalculate score based on remaining files
            try:
                db_metrics = db.query(analytics.QuantitativeMetric).filter(
                    analytics.QuantitativeMetric.organization_id == org.id
                ).all()
                new_data = await scoring_engine.calculate_dynamic_score(org.current_score, db_metrics)
                org.current_score = new_data["overall_score"]
                org.current_status = new_data["status"]
                org.risk_level = new_data["risk_level"]
                db.commit()
            except Exception as e:
                print(f"[Scoring] Recalculation after delete failed: {e}")

        return {"status": "success", "remaining_documents": remaining}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

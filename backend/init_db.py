from app.db.session import engine, Base, SessionLocal
from app.models import document, analytics

def init_db():
    print("Dropping existing tables...")
    Base.metadata.drop_all(bind=engine)
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("Tables created. Database is clean and ready for a real organization.")

    db = SessionLocal()
    try:
        # Create a default empty organization — user should update via Settings
        if not db.query(analytics.Organization).first():
            org = analytics.Organization(
                name="My Organization",
                industry="",
                current_score=0.0,
                current_status="Needs Improvement",
                risk_level="Medium"
            )
            db.add(org)
            db.commit()
            print("Default empty organization created. Update name and industry in Settings.")
    finally:
        db.close()

if __name__ == "__main__":
    init_db()

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Sustainability Intelligence AI"
    API_V1_STR: str = "/api/v1"
    
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-3.5-turbo"           # legacy — kept for compatibility
    OPENAI_SCORING_MODEL: str = "o3-mini"          # reasoning model for ESG evaluation
    OPENAI_GENERATION_MODEL: str = "gpt-4o"        # fast model for writing/Q&A
    DATABASE_URL: str = "sqlite:///./sustainability.db"
    
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        if self.DATABASE_URL.startswith("postgres://"):
            return self.DATABASE_URL.replace("postgres://", "postgresql://", 1)
        return self.DATABASE_URL

    JWT_SECRET: str = "fallback_secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

settings = Settings()

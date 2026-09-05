from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Sistema Cantina"
    secret_key: str = "dev-secret"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    database_url: str = "sqlite:///./cantina.db"
    cors_origins: str = "http://localhost:5173"

    # Quando ligado, vendas em dinheiro exigem um caixa aberto.
    exigir_caixa_aberto: bool = True

    apibrasil_token: str = ""
    apibrasil_device_token: str = ""

    admin_email: str = "admin@cantina.local"
    admin_password: str = "admin123"
    admin_nome: str = "Administrador"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Valores que já circularam em exemplo, README e histórico do repositório. Se um
# deles chegar aqui como chave de assinatura, qualquer pessoa que tenha lido o
# código forja um token de administrador -- então a aplicação recusa subir.
CHAVES_PUBLICAS = {"dev-secret", "troque-esta-chave-em-producao", "changeme", ""}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Sistema Cantina"
    secret_key: str = ""
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    database_url: str = "sqlite:///./cantina.db"
    # Relogio do balcao: e nele que "hoje" e "este mes" sao ditos.
    fuso: str = "America/Sao_Paulo"
    cors_origins: str = "http://localhost:5173"

    apibrasil_token: str = ""
    apibrasil_device_token: str = ""

    admin_usuario: str = "admin"
    # Vazio de propósito: sem senha definida, o primeiro boot sorteia uma e a
    # mostra no log, em vez de criar o administrador com senha conhecida.
    admin_password: str = ""
    admin_nome: str = "Administrador"

    # PIX: usados para montar o BR Code (QR) do valor da venda.
    pix_chave: str = ""
    pix_beneficiario: str = ""
    pix_cidade: str = ""

    @field_validator("secret_key")
    @classmethod
    def _chave_propria(cls, valor: str) -> str:
        """Falha alta e cedo, em vez de assinar login com chave publicada."""
        if valor.strip() in CHAVES_PUBLICAS:
            raise ValueError(
                "SECRET_KEY não configurada (ou ainda é a de exemplo). "
                "Gere a sua e ponha no .env:  openssl rand -hex 32"
            )
        if len(valor.strip()) < 32:
            raise ValueError("SECRET_KEY curta demais: use pelo menos 32 caracteres")
        return valor

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

"""Limite de requisições por IP.

Uma cantina com três operadores não faz mais que algumas dezenas de chamadas
por minuto. Qualquer coisa muito acima disso é engano de código, robô varrendo
a internet ou alguém tentando senha atrás de senha -- e nenhum desses três
merece a máquina inteira.

São dois tetos, porque os riscos são diferentes:

* o **geral** segura o volume: mantém a API de pé quando alguém aponta um
  script para ela;
* o do **login** segura a força bruta: com 8 tentativas por minuto, varrer as
  senhas mais óbvias leva anos em vez de minutos.

É um contador em memória, de propósito. O sistema roda num processo só, e
Redis para três caixas seria mais peça para manter do que problema resolvido.
Reiniciar a API zera os contadores; para o que isto defende, tudo bem.
"""

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

JANELA = 60.0
TETO_GERAL = 300
TETO_LOGIN = 8

CAMINHOS_LOGIN = {"/api/auth/login"}

# Teto de IPs guardados: sem isto, uma varredura com IP forjado encheria a
# memoria -- o proprio limitador viraria o ataque.
MAX_IPS = 5_000


class LimitadorDeRequisicoes(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._acessos: dict[tuple[str, bool], deque[float]] = defaultdict(deque)

    def _ip(self, request: Request) -> str:
        """O IP de quem pediu, e não o do Caddy.

        Confiar no cabeçalho só é seguro porque a API escuta em 127.0.0.1: nada
        chega aqui sem passar pelo proxy, que reescreve esse valor.
        """
        encaminhado = request.headers.get("x-forwarded-for", "")
        if encaminhado:
            return encaminhado.split(",")[0].strip()
        return request.client.host if request.client else "desconhecido"

    def _excedeu(self, chave: tuple[str, bool], teto: int, agora: float) -> bool:
        marcas = self._acessos[chave]
        while marcas and agora - marcas[0] > JANELA:
            marcas.popleft()
        if len(marcas) >= teto:
            return True
        marcas.append(agora)
        return False

    def _limpar(self, agora: float) -> None:
        if len(self._acessos) <= MAX_IPS:
            return
        vencidas = [c for c, m in self._acessos.items() if not m or agora - m[-1] > JANELA]
        for chave in vencidas:
            del self._acessos[chave]
        # Ainda cheio depois da limpeza: descarta o mais antigo até caber.
        while len(self._acessos) > MAX_IPS:
            self._acessos.pop(next(iter(self._acessos)))

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        agora = time.monotonic()
        self._limpar(agora)

        ip = self._ip(request)
        ehLogin = request.url.path in CAMINHOS_LOGIN
        teto = TETO_LOGIN if ehLogin else TETO_GERAL

        if self._excedeu((ip, ehLogin), teto, agora):
            detalhe = (
                "Muitas tentativas de login. Espere um minuto e tente de novo."
                if ehLogin
                else "Muitas requisições. Espere um minuto e tente de novo."
            )
            return JSONResponse(
                {"detail": detalhe},
                status_code=429,
                headers={"Retry-After": "60"},
            )

        return await call_next(request)

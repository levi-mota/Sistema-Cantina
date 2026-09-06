import { useRef, useState } from "react";
import { Image, Trash2 } from "lucide-react";

import { api, mensagemErro } from "../lib/api";
import { Botao } from "./ui";

/**
 * A foto que aparece no cardápio virtual.
 *
 * A imagem é reduzida aqui, no navegador, antes de subir: o servidor é uma
 * máquina de 1 vCPU e não precisa carregar uma biblioteca de imagem para
 * encolher a foto que o celular tirou com 4 mil pixels de largura.
 */

/** Largura suficiente para o cartão do cardápio até em tela grande. */
const LARGURA = 800;
const QUALIDADE = 0.82;

async function reduzir(arquivo: File): Promise<string> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, LARGURA / bitmap.width);
  const tela = document.createElement("canvas");
  tela.width = Math.round(bitmap.width * escala);
  tela.height = Math.round(bitmap.height * escala);

  const pincel = tela.getContext("2d");
  if (!pincel) throw new Error("O navegador não conseguiu processar a imagem");
  pincel.drawImage(bitmap, 0, 0, tela.width, tela.height);
  bitmap.close();

  // WEBP economiza cerca de um terço sobre JPEG na mesma qualidade; se o
  // navegador for antigo e não souber gerar, o toDataURL devolve PNG e o
  // servidor aceita do mesmo jeito.
  return tela.toDataURL("image/webp", QUALIDADE);
}

export function FotoProduto({
  produtoId,
  temFoto,
  aoMudar,
}: {
  produtoId: number;
  temFoto: boolean;
  aoMudar: (temFoto: boolean) => void;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Muda a cada gravação para o navegador buscar a imagem nova em vez de
  // mostrar a que ele guardou por uma hora.
  const [versao, setVersao] = useState(0);

  const endereco = `/api/publico/produtos/${produtoId}/foto?v=${versao}`;

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;

    setErro(null);
    setOcupado(true);
    try {
      const imagem = await reduzir(arquivo);
      await api.put(`/estoque/produtos/${produtoId}/foto`, { imagem });
      setVersao((v) => v + 1);
      aoMudar(true);
    } catch (falha) {
      setErro(mensagemErro(falha, "Não foi possível usar esta imagem"));
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    setErro(null);
    setOcupado(true);
    try {
      await api.delete(`/estoque/produtos/${produtoId}/foto`);
      aoMudar(false);
    } catch (falha) {
      setErro(mensagemErro(falha));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <span className="rotulo">Foto do cardápio</span>
      <div className="flex flex-wrap items-center gap-3">
        {temFoto ? (
          <img
            src={endereco}
            alt=""
            className="h-20 w-20 rounded-lg border border-carvao-200 object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-carvao-200 text-carvao-300">
            <Image className="h-6 w-6" />
          </div>
        )}

        <input
          ref={campo}
          type="file"
          accept="image/*"
          onChange={escolher}
          className="hidden"
        />
        <Botao
          type="button"
          variante="secundario"
          carregando={ocupado}
          onClick={() => campo.current?.click()}
        >
          {temFoto ? "Trocar foto" : "Escolher foto"}
        </Botao>
        {temFoto && (
          <Botao
            type="button"
            variante="secundario"
            icone={<Trash2 className="h-4 w-4" />}
            onClick={remover}
          >
            Remover
          </Botao>
        )}
      </div>
      {erro ? (
        <p className="mt-1 text-xs font-medium text-red-600">{erro}</p>
      ) : (
        <p className="mt-1 text-xs text-carvao-400">
          Aparece no cardápio público. A imagem é reduzida automaticamente; salva na hora,
          sem precisar salvar o produto.
        </p>
      )}
    </div>
  );
}

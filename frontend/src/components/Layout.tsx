import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  ShoppingCart,
  UserCog,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAuth } from "../lib/auth";
import type { Perfil } from "../lib/tipos";
import { cx } from "./ui";

interface ItemMenu {
  para: string;
  texto: string;
  curto: string;
  icone: LucideIcon;
  perfis?: Perfil[];
  /** Ganha um lugar fixo na barra inferior do celular. */
  fixoNoCelular?: boolean;
}

const MENU: ItemMenu[] = [
  { para: "/", texto: "Painel", curto: "Painel", icone: LayoutDashboard, perfis: ["ADMIN"] },
  { para: "/pdv", texto: "Ponto de venda", curto: "PDV", icone: ShoppingCart, fixoNoCelular: true },
  { para: "/caixa", texto: "Caixa", curto: "Caixa", icone: Landmark, fixoNoCelular: true },
  {
    para: "/estoque",
    texto: "Estoque",
    curto: "Estoque",
    icone: Boxes,
    perfis: ["ADMIN"],
    fixoNoCelular: true,
  },
  {
    para: "/compras",
    texto: "Compras",
    curto: "Compras",
    icone: ClipboardList,
    perfis: ["ADMIN"],
    fixoNoCelular: true,
  },
  {
    para: "/contas-a-pagar",
    texto: "Contas a pagar",
    curto: "Pagar",
    icone: ArrowUpCircle,
    perfis: ["ADMIN"],
  },
  {
    para: "/contas-a-receber",
    texto: "Contas a receber",
    curto: "Receber",
    icone: ArrowDownCircle,
    perfis: ["ADMIN"],
  },
  {
    para: "/parceiros",
    texto: "Clientes e fornecedores",
    curto: "Cadastros",
    icone: Users,
    perfis: ["ADMIN"],
  },
  {
    para: "/relatorios",
    texto: "Relatorios",
    curto: "Relatorios",
    icone: BarChart3,
    perfis: ["ADMIN"],
  },
  {
    para: "/funcionarios",
    texto: "Funcionarios",
    curto: "Equipe",
    icone: UserCog,
    perfis: ["ADMIN"],
  },
];

const CHAVE_MENU = "cantina.menu-recolhido";

export default function Layout() {
  const { usuario, sair, pode } = useAuth();
  const [maisAberto, setMaisAberto] = useState(false);
  const [recolhido, setRecolhido] = useState(
    () => localStorage.getItem(CHAVE_MENU) === "1",
  );
  const local = useLocation();

  useEffect(() => {
    localStorage.setItem(CHAVE_MENU, recolhido ? "1" : "0");
  }, [recolhido]);

  // Trocar de tela fecha a folha "Mais".
  useEffect(() => setMaisAberto(false), [local.pathname]);

  const visiveis = MENU.filter((i) => !i.perfis || pode(...i.perfis));
  const fixos = visiveis.filter((i) => i.fixoNoCelular).slice(0, 4);
  const restantes = visiveis.filter((i) => !fixos.includes(i));
  const atual = visiveis.find((i) => i.para === local.pathname);

  return (
    <div className="min-h-screen lg:flex">
      {/* Menu lateral: apenas no desktop, recolhivel para so os icones */}
      <aside className={cx("hidden shrink-0 lg:block", recolhido ? "w-16" : "w-64")}>
        <div
          className={cx(
            "fixed inset-y-0 flex flex-col bg-carvao-900 transition-all duration-200",
            recolhido ? "w-16" : "w-64",
          )}
        >
          <div
            className={cx(
              "flex items-center gap-2.5 py-5",
              recolhido ? "justify-center px-2" : "px-5",
            )}
          >
            <div className="rounded-lg bg-marca-500 p-2">
              <UtensilsCrossed className="h-5 w-5 text-white" />
            </div>
            {!recolhido && (
              <div className="min-w-0">
                <p className="font-bold leading-tight text-white">Cantina</p>
                <p className="text-xs text-carvao-400">Sistema de gestao</p>
              </div>
            )}
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
            {visiveis.map(({ para, texto, icone: Icone }) => (
              <NavLink
                key={para}
                to={para}
                end={para === "/"}
                title={recolhido ? texto : undefined}
                className={({ isActive }) =>
                  cx(
                    "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition",
                    recolhido ? "justify-center px-2" : "px-3",
                    isActive
                      ? "bg-marca-600 text-white shadow-sm"
                      : "text-carvao-200 hover:bg-carvao-800 hover:text-white",
                  )
                }
              >
                <Icone className="h-4.5 w-4.5 shrink-0" />
                {!recolhido && <span className="truncate">{texto}</span>}
              </NavLink>
            ))}
          </nav>

          <div className="space-y-2 border-t border-carvao-800 p-3">
            <button
              onClick={() => setRecolhido((v) => !v)}
              title={recolhido ? "Expandir menu" : "Recolher menu"}
              className={cx(
                "flex w-full items-center gap-2 rounded-lg py-2 text-sm font-medium",
                "text-carvao-400 transition hover:bg-carvao-800 hover:text-white",
                recolhido ? "justify-center px-2" : "px-3",
              )}
            >
              {recolhido ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4" /> Recolher menu
                </>
              )}
            </button>

            {!recolhido && (
              <p className="truncate px-2 text-sm font-semibold text-white">{usuario?.nome}</p>
            )}
            <button
              onClick={sair}
              title="Sair do sistema"
              className={cx(
                "flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/40",
                "bg-red-500/10 py-2.5 text-sm font-semibold text-red-300 transition",
                "hover:bg-red-500 hover:text-white",
                recolhido ? "px-2" : "px-3",
              )}
            >
              <LogOut className="h-4 w-4" />
              {!recolhido && "Sair do sistema"}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo do celular: sem menu lateral, so titulo e sair */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-carvao-100 bg-white px-4 py-3 lg:hidden">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-carvao-900">{atual?.texto ?? "Cantina"}</p>
            <p className="truncate text-xs text-carvao-500">{usuario?.nome}</p>
          </div>
          <button
            onClick={sair}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 active:bg-red-100"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </header>

        <main className="flex-1 px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:pb-8">
          <Outlet />
        </main>

        {/* Folha "Mais": o resto do menu, ancorado na propria barra inferior */}
        {maisAberto && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              className="absolute inset-0 bg-carvao-900/50"
              onClick={() => setMaisAberto(false)}
              aria-label="Fechar"
            />
            <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pb-20 shadow-xl">
              <div className="flex items-center justify-between border-b border-carvao-100 px-5 py-3">
                <span className="font-bold text-carvao-900">Mais opcoes</span>
                <button
                  onClick={() => setMaisAberto(false)}
                  className="rounded-lg p-1.5 text-carvao-400 active:bg-carvao-100"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="grid grid-cols-2 gap-2 p-4">
                {restantes.map(({ para, texto, icone: Icone }) => (
                  <NavLink
                    key={para}
                    to={para}
                    className={({ isActive }) =>
                      cx(
                        "flex items-center gap-2.5 rounded-xl border px-3 py-3 text-sm font-medium transition",
                        isActive
                          ? "border-marca-300 bg-marca-50 text-marca-700"
                          : "border-carvao-200 text-carvao-700 active:bg-carvao-50",
                      )
                    }
                  >
                    <Icone className="h-4.5 w-4.5 shrink-0" />
                    {texto}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* Celular: a barra inferior e a unica navegacao */}
        <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-carvao-100 bg-white lg:hidden">
          {fixos.map(({ para, curto, icone: Icone }) => (
            <NavLink
              key={para}
              to={para}
              end={para === "/"}
              className={({ isActive }) =>
                cx(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition",
                  isActive ? "text-marca-600" : "text-carvao-400",
                )
              }
            >
              <Icone className="h-5 w-5" />
              {curto}
            </NavLink>
          ))}
          <button
            onClick={() => setMaisAberto((v) => !v)}
            className={cx(
              "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition",
              maisAberto || restantes.some((i) => i.para === local.pathname)
                ? "text-marca-600"
                : "text-carvao-400",
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            Mais
          </button>
        </nav>
      </div>
    </div>
  );
}

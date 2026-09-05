import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Boxes,
  LayoutDashboard,
  LogOut,
  Menu,
  ShoppingCart,
  UserCog,
  Users,
  UtensilsCrossed,
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
  /** Aparece na barra inferior do celular (limitada a 5 itens). */
  noCelular?: boolean;
}

const MENU: ItemMenu[] = [
  { para: "/", texto: "Painel", curto: "Painel", icone: LayoutDashboard, noCelular: true },
  { para: "/pdv", texto: "Ponto de venda", curto: "PDV", icone: ShoppingCart, noCelular: true },
  { para: "/estoque", texto: "Estoque", curto: "Estoque", icone: Boxes, noCelular: true },
  { para: "/contas-a-pagar", texto: "Contas a pagar", curto: "Pagar", icone: ArrowUpCircle },
  { para: "/contas-a-receber", texto: "Contas a receber", curto: "Receber", icone: ArrowDownCircle },
  { para: "/parceiros", texto: "Clientes e fornecedores", curto: "Cadastros", icone: Users, noCelular: true },
  { para: "/relatorios", texto: "Relatorios", curto: "Relatorios", icone: BarChart3, noCelular: true },
  {
    para: "/funcionarios",
    texto: "Funcionarios",
    curto: "Equipe",
    icone: UserCog,
    perfis: ["ADMIN", "GERENTE"],
  },
];

export default function Layout() {
  const { usuario, sair, pode } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();

  const visiveis = MENU.filter((i) => !i.perfis || pode(...i.perfis));
  const noCelular = visiveis.filter((i) => i.noCelular).slice(0, 5);

  const classeLink = ({ isActive }: { isActive: boolean }) =>
    cx(
      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
      isActive
        ? "bg-marca-600 text-white shadow-sm"
        : "text-carvao-200 hover:bg-carvao-800 hover:text-white",
    );

  const barraLateral = (
    <div className="flex h-full flex-col bg-carvao-900">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="rounded-lg bg-marca-500 p-2">
          <UtensilsCrossed className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="font-bold leading-tight text-white">Cantina</p>
          <p className="text-xs text-carvao-400">Sistema de gestao</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {visiveis.map(({ para, texto, icone: Icone }) => (
          <NavLink
            key={para}
            to={para}
            end={para === "/"}
            className={classeLink}
            onClick={() => setMenuAberto(false)}
          >
            <Icone className="h-4.5 w-4.5 shrink-0" />
            {texto}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-carvao-800 p-3">
        <div className="mb-2 px-2">
          <p className="truncate text-sm font-semibold text-white">{usuario?.nome}</p>
          <p className="text-xs text-carvao-400">
            {usuario?.cargo ?? usuario?.perfil} · {usuario?.perfil}
          </p>
        </div>
        <button
          onClick={sair}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-carvao-300 transition hover:bg-carvao-800 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 w-64">{barraLateral}</div>
      </aside>

      {/* Celular: gaveta lateral */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-carvao-900/60"
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu"
          />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">{barraLateral}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo do celular */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-carvao-100 bg-white px-4 py-3 lg:hidden">
          <button
            onClick={() => setMenuAberto((v) => !v)}
            className="rounded-lg p-1.5 text-carvao-600 hover:bg-carvao-100"
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-bold text-carvao-900">
            {visiveis.find((i) => i.para === local.pathname)?.texto ?? "Cantina"}
          </span>
          <button
            onClick={sair}
            className="ml-auto rounded-lg p-1.5 text-carvao-500 hover:bg-carvao-100"
            aria-label="Sair"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1 px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:pb-8">
          <Outlet />
        </main>

        {/* Celular: barra inferior com os modulos mais usados */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-carvao-100 bg-white lg:hidden">
          {noCelular.map(({ para, curto, icone: Icone }) => (
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
        </nav>
      </div>
    </div>
  );
}

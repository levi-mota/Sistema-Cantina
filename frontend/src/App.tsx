import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import { Carregando } from "./components/ui";
import { ProvedorAuth, useAuth } from "./lib/auth";
import Caixa from "./pages/Caixa";
import Compras from "./pages/Compras";
import Estoque from "./pages/Estoque";
import Financeiro from "./pages/Financeiro";
import Funcionarios from "./pages/Funcionarios";
import Login from "./pages/Login";
import Painel from "./pages/Painel";
import Parceiros from "./pages/Parceiros";
import Pdv from "./pages/Pdv";
import Relatorios from "./pages/Relatorios";

/** Rota de gestao: quem nao e ADMIN cai no PDV em vez de ver uma tela vazia. */
function SomenteAdmin({ children }: { children: ReactNode }) {
  const { pode } = useAuth();
  return pode("ADMIN") ? <>{children}</> : <Navigate to="/pdv" replace />;
}

function Rotas() {
  const { usuario, carregando, pode, sessaoId } = useAuth();

  if (carregando) return <Carregando texto="Carregando sessao..." />;

  if (!usuario) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    // `key` por sessao: trocar de usuario remonta tudo, entao nenhuma tela
    // aparece com dado carregado sob o token anterior.
    <Routes key={sessaoId}>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        {/* Frente de caixa: liberado para qualquer usuario autenticado */}
        <Route path="pdv" element={<Pdv />} />
        <Route path="caixa" element={<Caixa />} />

        {/* Gestao: so administradores */}
        <Route index element={pode("ADMIN") ? <Painel /> : <Navigate to="/pdv" replace />} />
        <Route
          path="compras"
          element={
            <SomenteAdmin>
              <Compras />
            </SomenteAdmin>
          }
        />
        <Route
          path="estoque"
          element={
            <SomenteAdmin>
              <Estoque />
            </SomenteAdmin>
          }
        />
        <Route
          path="contas-a-pagar"
          element={
            <SomenteAdmin>
              <Financeiro tipo="PAGAR" />
            </SomenteAdmin>
          }
        />
        <Route
          path="contas-a-receber"
          element={
            <SomenteAdmin>
              <Financeiro tipo="RECEBER" />
            </SomenteAdmin>
          }
        />
        <Route
          path="parceiros"
          element={
            <SomenteAdmin>
              <Parceiros />
            </SomenteAdmin>
          }
        />
        <Route
          path="relatorios"
          element={
            <SomenteAdmin>
              <Relatorios />
            </SomenteAdmin>
          }
        />
        <Route
          path="funcionarios"
          element={
            <SomenteAdmin>
              <Funcionarios />
            </SomenteAdmin>
          }
        />
        <Route path="*" element={<Navigate to={pode("ADMIN") ? "/" : "/pdv"} replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ProvedorAuth>
        <Rotas />
      </ProvedorAuth>
    </BrowserRouter>
  );
}

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import { Carregando } from "./components/ui";
import { ProvedorAuth, useAuth } from "./lib/auth";
import Estoque from "./pages/Estoque";
import Financeiro from "./pages/Financeiro";
import Funcionarios from "./pages/Funcionarios";
import Login from "./pages/Login";
import Painel from "./pages/Painel";
import Parceiros from "./pages/Parceiros";
import Pdv from "./pages/Pdv";
import Relatorios from "./pages/Relatorios";

function Rotas() {
  const { usuario, carregando } = useAuth();

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
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={<Painel />} />
        <Route path="pdv" element={<Pdv />} />
        <Route path="estoque" element={<Estoque />} />
        <Route path="contas-a-pagar" element={<Financeiro tipo="PAGAR" />} />
        <Route path="contas-a-receber" element={<Financeiro tipo="RECEBER" />} />
        <Route path="parceiros" element={<Parceiros />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="funcionarios" element={<Funcionarios />} />
        <Route path="*" element={<Navigate to="/" replace />} />
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

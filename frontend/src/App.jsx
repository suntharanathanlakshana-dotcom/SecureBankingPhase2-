import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Transfer from "./pages/Transfer.jsx";
import Bills from "./pages/Bills.jsx";
import Loans from "./pages/Loans.jsx";
import Cardless from "./pages/Cardless.jsx";
import AtmSimulator from "./pages/AtmSimulator.jsx";
import Notifications from "./pages/Notifications.jsx";
import Support from "./pages/Support.jsx";
import Security from "./pages/Security.jsx";
import Statement from "./pages/Statement.jsx";
import Ussd from "./pages/Ussd.jsx";
import Profile from "./pages/Profile.jsx";
import Settings from "./pages/Settings.jsx";
import ScheduledTransfers from "./pages/ScheduledTransfers.jsx";
import VirtualCard from "./pages/VirtualCard.jsx";
import Analytics from "./pages/Analytics.jsx";
import AdminOverview from "./pages/admin/AdminOverview.jsx";
import AdminUsers from "./pages/admin/AdminUsers.jsx";
import AdminTransactions from "./pages/admin/AdminTransactions.jsx";
import AdminFraud from "./pages/admin/AdminFraud.jsx";
import AdminDisputes from "./pages/admin/AdminDisputes.jsx";
import AdminReports from "./pages/admin/AdminReports.jsx";

function Protected({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/atm" element={<AtmSimulator />} />
      <Route path="/ussd-demo" element={<Ussd />} />

      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="transfer" element={<Transfer />} />
        <Route path="scheduled-transfers" element={<ScheduledTransfers />} />
        <Route path="bills" element={<Bills />} />
        <Route path="loans" element={<Loans />} />
        <Route path="cardless" element={<Cardless />} />
        <Route path="virtual-card" element={<VirtualCard />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="support" element={<Support />} />
        <Route path="security" element={<Security />} />
        <Route path="statement" element={<Statement />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />

        <Route path="admin" element={<Protected role="admin"><AdminOverview /></Protected>} />
        <Route path="admin/users" element={<Protected role="admin"><AdminUsers /></Protected>} />
        <Route path="admin/transactions" element={<Protected role="admin"><AdminTransactions /></Protected>} />
        <Route path="admin/fraud" element={<Protected role="admin"><AdminFraud /></Protected>} />
        <Route path="admin/disputes" element={<Protected role="admin"><AdminDisputes /></Protected>} />
        <Route path="admin/reports" element={<Protected role="admin"><AdminReports /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

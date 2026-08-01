import { useState, useRef, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useTheme } from "../ThemeContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";

const navItems = [
  { to: "/", labelKey: "nav.dashboard", label: "Dashboard", icon: "◧", end: true },
  { to: "/transfer", labelKey: "nav.transfer", label: "Transfer", icon: "⇄" },
  { to: "/scheduled-transfers", labelKey: "nav.scheduled", label: "Scheduled Transfers", icon: "⏱" },
  { to: "/bills", labelKey: "nav.bills", label: "Bills & QR Pay", icon: "▤" },
  { to: "/loans", labelKey: "nav.loans", label: "Loans", icon: "◎" },
  { to: "/cardless", labelKey: "nav.cardless", label: "Cardless ATM", icon: "▣" },
  { to: "/virtual-card", labelKey: "nav.virtualCard", label: "Virtual Card", icon: "▮" },
  { to: "/analytics", labelKey: "nav.analytics", label: "Spending Analytics", icon: "▲" },
  { to: "/statement", labelKey: "nav.statement", label: "Statement", icon: "☰" },
  { to: "/notifications", labelKey: "nav.notifications", label: "Notifications", icon: "◈" },
  { to: "/support", labelKey: "nav.support", label: "Support", icon: "◐" },
  { to: "/security", labelKey: "nav.security", label: "Security", icon: "◆" },
];

const adminItems = [
  { to: "/admin", label: "Overview", icon: "◧", end: true },
  { to: "/admin/users", label: "Users", icon: "◎" },
  { to: "/admin/transactions", label: "Transactions", icon: "☰" },
  { to: "/admin/fraud", label: "Fraud Alerts", icon: "▲" },
  { to: "/admin/disputes", label: "Disputes", icon: "◐" },
  { to: "/admin/reports", label: "Reports", icon: "▤" },
];

function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const initials = (user?.fullName || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="profile-menu" ref={ref}>
      <button className="profile-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="profile-avatar">{initials}</span>
        <span className="name">{user?.fullName?.split(" ")[0]}</span>
      </button>
      {open && (
        <div className="profile-dropdown">
          <button
            className="profile-dropdown-item"
            onClick={() => { setOpen(false); navigate("/profile"); }}
          >
            <span>◍</span> View profile
          </button>
          <button
            className="profile-dropdown-item"
            onClick={() => { setOpen(false); navigate("/settings"); }}
          >
            <span>⚙</span> Settings
          </button>
          <div className="profile-dropdown-divider" />
          <button
            className="profile-dropdown-item"
            onClick={() => { logout(); navigate("/login"); }}
          >
            <span>⏻</span> Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isLight = theme === "light";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="mark">SB</span>
          SecureBank
        </div>

        <div className="nav-section-label">Banking</div>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
          >
            <span>{item.icon}</span> {t(item.labelKey)}
          </NavLink>
        ))}

        {user?.role === "admin" && (
          <>
            <div className="nav-section-label">Back Office</div>
            {adminItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
              >
                <span>{item.icon}</span> {item.label}
              </NavLink>
            ))}
          </>
        )}

        <div style={{ flex: 1 }} />
        <button
          className="nav-link"
          style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          <span>⏻</span> {t("logout")}
        </button>
      </aside>

      <div className="main-area">
        <div className="topbar">
          <div className="eyebrow">{t("eyebrow")}</div>
          <div className="topbar-actions">
            <span className="status-pill">
              <span className="dot" /> {t("status.allSystemsRestored")}
            </span>
            <button
              className="icon-btn"
              title={isLight ? "Switch to dark mode" : "Switch to light mode"}
              aria-label="Toggle color theme"
              onClick={toggleTheme}
            >
              {isLight ? "🌙" : "☀"}
            </button>
            <button
              className="icon-btn"
              title="Settings"
              aria-label="Settings"
              onClick={() => navigate("/settings")}
            >
              ⚙
            </button>
            <ProfileMenu />
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}

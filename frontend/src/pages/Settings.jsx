import { Link } from "react-router-dom";
import { useTheme } from "../ThemeContext.jsx";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const { language, setLanguage, languages, t } = useLanguage();
  const isLight = theme === "light";

  return (
    <div className="page-narrow">
      <h1>{t("settings.title")}</h1>
      <p style={{ marginBottom: 20 }}>{t("settings.subtitle")}</p>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>{t("settings.language")}</h3>
        <p className="settings-row-desc" style={{ marginBottom: 12 }}>{t("settings.languageDesc")}</p>
        <div className="language-chip-row">
          {languages.map((l) => (
            <button
              key={l.code}
              type="button"
              className={"language-chip" + (language === l.code ? " active" : "")}
              onClick={() => setLanguage(l.code)}
            >
              {l.nativeLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>{t("settings.appearance")}</h3>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">{isLight ? "☀ Light mode" : "🌙 Dark mode"}</div>
            <div className="settings-row-desc">
              Switch between the default dark "vault" theme and a lighter, paper-white theme.
            </div>
          </div>
          <div
            role="switch"
            aria-checked={isLight}
            tabIndex={0}
            className={"toggle-switch" + (isLight ? " on" : "")}
            onClick={toggleTheme}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggleTheme()}
          >
            <div className="toggle-knob" />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Account</h3>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Profile</div>
            <div className="settings-row-desc">View your name, contact details, and linked accounts.</div>
          </div>
          <Link to="/profile" className="btn btn-secondary btn-sm">View</Link>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Security</div>
            <div className="settings-row-desc">Biometric login, devices, and sign-in methods.</div>
          </div>
          <Link to="/security" className="btn btn-secondary btn-sm">Manage</Link>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Notifications</div>
            <div className="settings-row-desc">Alerts for transfers, bills, and fraud checks.</div>
          </div>
          <Link to="/notifications" className="btn btn-secondary btn-sm">View</Link>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Signed in as</h3>
        <div className="tx-row">
          <div>{user?.fullName}</div>
          <div className="tx-meta">{user?.email}</div>
        </div>
      </div>
    </div>
  );
}

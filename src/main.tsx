import { createRoot } from "react-dom/client";
import { AppProvider } from "./app/context/AppContext";
import { ErrorBoundary, ConfigErrorScreen } from "./app/components/ErrorBoundary";
import { getConfigErrors } from "./app/config/env";
import App from "./app/App";
import "./i18n"; // must be imported before any component renders
import "./styles/index.css";

const root = createRoot(document.getElementById("root")!);

// Fail loudly but gracefully on a misconfigured build: show a branded screen
// instead of a white page (and instead of throwing before React can mount).
const configErrors = getConfigErrors();

root.render(
  configErrors.length > 0 ? (
    <ConfigErrorScreen errors={configErrors} />
  ) : (
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  )
);

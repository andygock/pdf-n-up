import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "../css/base.css";
import "../css/components.css";
import "../css/help.css";
import "../css/responsive.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing.");
createRoot(root).render(<App />);

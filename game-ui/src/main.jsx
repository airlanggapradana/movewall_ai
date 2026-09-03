import React from "react";
import { createRoot } from "react-dom/client";
import AppleArcher3D from "./AppleArcher3D.jsx";
import "./r3f.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppleArcher3D />
  </React.StrictMode>,
);

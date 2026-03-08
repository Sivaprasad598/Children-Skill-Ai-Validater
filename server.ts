import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { jsPDF } from "jspdf";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 1. Health check - MUST be responsive immediately
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    port: PORT
  });
});

// Serve subjects directory statically with a custom handler to ensure valid PDF structure
const subjectsPath = path.resolve(process.cwd(), "public", "subjects");
app.get("/subjects/:fileName", (req, res, next) => {
  const fileName = req.params.fileName;
  const filePath = path.join(subjectsPath, fileName);

  console.log(`[Subject Request] fileName: ${fileName}, subjectsPath: ${subjectsPath}, fullPath: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error(`[Subject Error] File not found: ${filePath}`);
    return res.status(404).send("File not found");
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const isPdf = buffer.length > 4 && buffer.toString("utf-8", 0, 4) === "%PDF";

    console.log(`Serving subject: ${fileName}, isPdf: ${isPdf}, size: ${buffer.length}`);

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    if (isPdf) {
      // If it's already a valid PDF, serve it normally using sendFile for better reliability
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res.sendFile(filePath);
    } else {
      // If it has .pdf extension but is not a PDF, serve it as text/plain
      // This allows the frontend to handle it as text instead of showing a broken PDF
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res.send(buffer);
    }
  } catch (err) {
    console.error("Subject serve error:", err);
    res.status(500).send("Failed to serve subject file");
  }
});

if (fs.existsSync(subjectsPath)) {
  app.use("/subjects", express.static(subjectsPath));
}

async function startServer() {
  const distPath = path.resolve(process.cwd(), "dist");
  const hasDist = fs.existsSync(distPath);
  
  // Determine if we are in production
  const isProduction = process.env.NODE_ENV === "production" || hasDist;

  if (isProduction) {
    console.log("Mode: PRODUCTION");
    if (hasDist) {
      // Serve static files from the dist directory
      app.use(express.static(distPath));
      
      // Catch-all route for SPA
      app.get("(.*)", (req, res, next) => {
        // Skip API and subjects routes
        if (req.path.startsWith("/api/") || req.path.startsWith("/subjects/")) {
          return next();
        }
        
        const indexPath = path.join(distPath, "index.html");
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send("Frontend build index.html not found.");
        }
      });
    } else {
      console.warn("Production mode detected but 'dist/' folder is missing. Requests to '/' will fail.");
      app.get("/", (req, res) => {
        res.status(404).send("Application is running but frontend assets (dist/) are missing. Please run 'npm run build'.");
      });
    }
  } else {
    console.log("Mode: DEVELOPMENT");
    try {
      // Only attempt to load Vite in non-production environments
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Vite failed to load:", e);
      if (hasDist) {
        console.log("Falling back to static serving of dist/");
        app.use(express.static(distPath));
      }
    }
  }

  // Bind port AFTER routes are registered (or at least after initialization starts)
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`>>> Server is listening on 0.0.0.0:${PORT}`);
  });
}

// Start the initialization logic
startServer().catch(err => {
  console.error("Initialization error:", err);
});

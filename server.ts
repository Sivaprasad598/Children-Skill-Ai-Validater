import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API route to get subject content from PDF files
  app.get("/api/subjects/:subject", (req, res) => {
    const subject = req.params.subject;
    
    const subjectFileMap: Record<string, string> = {
      'Telugu': 'telugu.pdf',
      'English': 'english.pdf',
      'Hindi': 'hindi.pdf',
      'Maths': 'maths.pdf',
      'General Knowledge': 'general_knowledge (2).pdf',
      'Environmental Studies': 'environmental_studies.pdf',
      'Computer Science': 'computer_science.pdf',
      'Moral Science': 'moral_science.pdf'
    };

    const fileName = subjectFileMap[subject];
    if (!fileName) {
      return res.status(404).json({ error: "Subject not found" });
    }

    const filePath = path.join(__dirname, "subjects", fileName);
    console.log(`Fetching subject: ${subject}, File: ${filePath}`);
    
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        console.log(`Content found for ${subject}, length: ${content.length}`);
        res.json({ content });
      } else {
        console.error(`File not found: ${filePath}`);
        res.status(404).json({ error: "File not found" });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to read file" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

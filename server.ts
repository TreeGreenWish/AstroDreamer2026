import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("astradream.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT,
    dob TEXT,
    tob TEXT,
    lob_lat REAL,
    lob_lng REAL,
    lob_name TEXT,
    life_path INTEGER,
    chinese_zodiac TEXT,
    birth_chart_interpretation TEXT
  );

  CREATE TABLE IF NOT EXISTS dreams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    date TEXT,
    time TEXT,
    location_lat REAL,
    location_lng REAL,
    location_name TEXT,
    interpretation TEXT,
    image_url TEXT,
    sun_sign TEXT,
    moon_sign TEXT,
    mercury_sign TEXT,
    venus_sign TEXT,
    mars_sign TEXT,
    jupiter_sign TEXT,
    saturn_sign TEXT,
    moon_phase TEXT,
    day_number INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: Add missing columns if they don't exist
const columns = db.prepare("PRAGMA table_info(dreams)").all() as any[];
const columnNames = columns.map(c => c.name);
const requiredColumns = [
  "sun_sign", "moon_sign", "mercury_sign", "venus_sign", 
  "mars_sign", "jupiter_sign", "saturn_sign", "moon_phase", "day_number"
];

requiredColumns.forEach(col => {
  if (!columnNames.includes(col)) {
    const type = col === "day_number" ? "INTEGER" : "TEXT";
    db.exec(`ALTER TABLE dreams ADD COLUMN ${col} ${type}`);
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get("/api/profile", (req, res) => {
    const profile = db.prepare("SELECT * FROM user_profile WHERE id = 1").get();
    res.json(profile || null);
  });

  app.post("/api/profile", (req, res) => {
    const { name, dob, tob, lob_lat, lob_lng, lob_name, life_path, chinese_zodiac, birth_chart_interpretation } = req.body;
    const exists = db.prepare("SELECT id FROM user_profile WHERE id = 1").get();
    
    if (exists) {
      db.prepare(`
        UPDATE user_profile SET 
          name = ?, dob = ?, tob = ?, lob_lat = ?, lob_lng = ?, lob_name = ?, 
          life_path = ?, chinese_zodiac = ?, birth_chart_interpretation = ?
        WHERE id = 1
      `).run(name, dob, tob, lob_lat, lob_lng, lob_name, life_path, chinese_zodiac, birth_chart_interpretation);
    } else {
      db.prepare(`
        INSERT INTO user_profile (id, name, dob, tob, lob_lat, lob_lng, lob_name, life_path, chinese_zodiac, birth_chart_interpretation)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name, dob, tob, lob_lat, lob_lng, lob_name, life_path, chinese_zodiac, birth_chart_interpretation);
    }
    res.json({ success: true });
  });

  app.get("/api/dreams", (req, res) => {
    const dreams = db.prepare("SELECT * FROM dreams ORDER BY date DESC, time DESC").all();
    res.json(dreams);
  });

  app.post("/api/dreams", (req, res) => {
    const { 
      title, content, date, time, location_lat, location_lng, location_name, 
      interpretation, image_url, sun_sign, moon_sign, mercury_sign, 
      venus_sign, mars_sign, jupiter_sign, saturn_sign, moon_phase, day_number 
    } = req.body;
    const result = db.prepare(`
      INSERT INTO dreams (
        title, content, date, time, location_lat, location_lng, location_name, 
        interpretation, image_url, sun_sign, moon_sign, mercury_sign, 
        venus_sign, mars_sign, jupiter_sign, saturn_sign, moon_phase, day_number
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, content, date, time, location_lat, location_lng, location_name, 
      interpretation, image_url, sun_sign, moon_sign, mercury_sign, 
      venus_sign, mars_sign, jupiter_sign, saturn_sign, moon_phase, day_number
    );
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/dreams/:id", (req, res) => {
    const { id } = req.params;
    const { 
      title, content, date, time, location_lat, location_lng, location_name, 
      interpretation, image_url, sun_sign, moon_sign, mercury_sign, 
      venus_sign, mars_sign, jupiter_sign, saturn_sign, moon_phase, day_number 
    } = req.body;
    db.prepare(`
      UPDATE dreams SET 
        title = ?, content = ?, date = ?, time = ?, 
        location_lat = ?, location_lng = ?, location_name = ?, 
        interpretation = ?, image_url = ?, sun_sign = ?, moon_sign = ?, 
        mercury_sign = ?, venus_sign = ?, mars_sign = ?, jupiter_sign = ?, 
        saturn_sign = ?, moon_phase = ?, day_number = ?
      WHERE id = ?
    `).run(
      title, content, date, time, location_lat, location_lng, location_name, 
      interpretation, image_url, sun_sign, moon_sign, mercury_sign, 
      venus_sign, mars_sign, jupiter_sign, saturn_sign, moon_phase, day_number, id
    );
    res.json({ success: true });
  });

  app.delete("/api/dreams/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM dreams WHERE id = ?").run(id);
    res.json({ success: true });
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

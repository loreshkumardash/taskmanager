const path = require("path");
const express = require("express");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, "tasks.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed'))
  );
`);

const listTasksStmt = db.prepare(
  "SELECT id, text, status FROM tasks ORDER BY id DESC"
);
const createTaskStmt = db.prepare(
  "INSERT INTO tasks (text, status) VALUES (?, 'pending')"
);
const getTaskStmt = db.prepare("SELECT id, text, status FROM tasks WHERE id = ?");
const deleteTaskStmt = db.prepare("DELETE FROM tasks WHERE id = ?");
const updateTaskStatusStmt = db.prepare(
  "UPDATE tasks SET status = ? WHERE id = ?"
);

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/tasks", (req, res) => {
  const tasks = listTasksStmt.all();
  res.json(tasks);
});

app.post("/api/tasks", (req, res) => {
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";

  if (!text) {
    return res.status(400).json({ error: "Task text is required" });
  }

  const result = createTaskStmt.run(text);
  const task = getTaskStmt.get(result.lastInsertRowid);
  return res.status(201).json(task);
});

app.delete("/api/tasks/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid task id" });
  }

  const result = deleteTaskStmt.run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Task not found" });
  }

  return res.status(204).send();
});

app.patch("/api/tasks/:id/status", (req, res) => {
  const id = Number(req.params.id);
  const status = req.body.status;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid task id" });
  }

  if (status !== "pending" && status !== "completed") {
    return res.status(400).json({ error: "Invalid task status" });
  }

  const result = updateTaskStatusStmt.run(status, id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Task not found" });
  }

  const task = getTaskStmt.get(id);
  return res.json(task);
});

app.listen(PORT, () => {
  console.log(`Task manager server running at http://localhost:${PORT}`);
});

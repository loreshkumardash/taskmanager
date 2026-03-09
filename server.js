if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const path = require("path");
const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
const { v2: cloudinary } = require("cloudinary");

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

const missingEnv = requiredEnv.filter((envName) => !process.env[envName]);
if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const TASK_SELECT_COLUMNS =
  "id, text, status, priority, due_date, attachment_url, created_at";
const VALID_STATUSES = new Set(["pending", "completed"]);
const VALID_PRIORITIES = new Set(["high", "medium", "low"]);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function parseTaskId(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

function parseTaskText(rawText) {
  if (typeof rawText !== "string") {
    return "";
  }

  return rawText.trim();
}

function parseLoginId(rawLoginId) {
  if (typeof rawLoginId !== "string") {
    return "";
  }
  return rawLoginId.trim().toLowerCase();
}

function parsePassword(rawPassword) {
  if (typeof rawPassword !== "string") {
    return "";
  }
  return rawPassword.trim();
}

function isValidLoginId(loginId) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const mobilePattern = /^\+?[0-9]{10,15}$/;
  return emailPattern.test(loginId) || mobilePattern.test(loginId);
}

function parsePriority(rawPriority) {
  const priority = typeof rawPriority === "string" ? rawPriority.trim().toLowerCase() : "";
  if (!priority) {
    return "medium";
  }

  if (!VALID_PRIORITIES.has(priority)) {
    return null;
  }

  return priority;
}

function parseDueDate(rawDueDate) {
  if (rawDueDate === null || rawDueDate === undefined || rawDueDate === "") {
    return null;
  }

  if (typeof rawDueDate !== "string") {
    return null;
  }

  const dueDate = rawDueDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return null;
  }

  return dueDate;
}

function uploadBufferToCloudinary(file) {
  const folder = process.env.CLOUDINARY_FOLDER || "taskmanager";

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );

    stream.end(file.buffer);
  });
}

function createToken(user) {
  return jwt.sign(
    {
      user_id: user.id,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: Number(payload.user_id),
      name: payload.name || "",
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/register", async (req, res, next) => {
  try {
    const name = parseTaskText(req.body.name);
    const loginId = parseLoginId(req.body.login_id);
    const password = parsePassword(req.body.password);
    const confirmPassword = parsePassword(req.body.confirm_password);

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (!loginId) {
      return res.status(400).json({ error: "Email or mobile is required" });
    }

    if (!isValidLoginId(loginId)) {
      return res.status(400).json({ error: "Login ID must be a valid email or mobile number" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    if (confirmPassword && confirmPassword !== password) {
      return res.status(400).json({ error: "Confirm password does not match" });
    }

    const { data: existingUser, error: existingError } = await supabase
      .from("users")
      .select("id")
      .eq("login_id", loginId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existingUser) {
      return res.status(409).json({ error: "Account already exists with this email/mobile" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("users")
      .insert({
        name,
        login_id: loginId,
        password_hash: passwordHash,
      })
      .select("id, name, login_id, created_at")
      .single();

    if (error) {
      throw error;
    }

    return res.status(201).json({ message: "Registration successful", user: data });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const loginId = parseLoginId(req.body.login_id);
    const password = parsePassword(req.body.password);

    if (!loginId || !password) {
      return res.status(400).json({ error: "Login ID and password are required" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, login_id, password_hash")
      .eq("login_id", loginId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = createToken(user);

    return res.json({
      token,
      user_id: user.id,
      name: user.name,
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/tasks", authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_SELECT_COLUMNS)
      .eq("user_id", req.user.id)
      .order("id", { ascending: false });

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks", authenticate, async (req, res, next) => {
  try {
    const text = parseTaskText(req.body.text);
    const priority = parsePriority(req.body.priority);
    const dueDate = parseDueDate(req.body.due_date);

    if (!text) {
      return res.status(400).json({ error: "Task text is required" });
    }

    if (!priority) {
      return res.status(400).json({ error: "Invalid task priority" });
    }

    if (req.body.due_date && !dueDate) {
      return res.status(400).json({ error: "Invalid due date format. Use YYYY-MM-DD" });
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: req.user.id,
        text,
        status: "pending",
        priority,
        due_date: dueDate,
      })
      .select(TASK_SELECT_COLUMNS)
      .single();

    if (error) {
      throw error;
    }

    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/tasks/:id", authenticate, async (req, res, next) => {
  try {
    const id = parseTaskId(req.params.id);
    const text = parseTaskText(req.body.text);
    const priority = parsePriority(req.body.priority);
    const dueDate = parseDueDate(req.body.due_date);

    if (!id) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    if (!text) {
      return res.status(400).json({ error: "Task text is required" });
    }

    if (!priority) {
      return res.status(400).json({ error: "Invalid task priority" });
    }

    if (req.body.due_date && !dueDate) {
      return res.status(400).json({ error: "Invalid due date format. Use YYYY-MM-DD" });
    }

    const { data, error } = await supabase
      .from("tasks")
      .update({
        text,
        priority,
        due_date: dueDate,
      })
      .eq("id", id)
      .eq("user_id", req.user.id)
      .select(TASK_SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: "Task not found" });
    }

    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/tasks/:id", authenticate, async (req, res, next) => {
  try {
    const id = parseTaskId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    const { data, error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("user_id", req.user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: "Task not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/tasks/:id/status", authenticate, async (req, res, next) => {
  try {
    const id = parseTaskId(req.params.id);
    const status = req.body.status;

    if (!id) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid task status" });
    }

    const { data, error } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", id)
      .eq("user_id", req.user.id)
      .select(TASK_SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: "Task not found" });
    }

    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

app.post("/api/tasks/:id/attachment", authenticate, upload.single("file"), async (req, res, next) => {
  try {
    const id = parseTaskId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Attachment file is required" });
    }

    const uploadResult = await uploadBufferToCloudinary(req.file);

    const { data, error } = await supabase
      .from("tasks")
      .update({ attachment_url: uploadResult.secure_url })
      .eq("id", id)
      .eq("user_id", req.user.id)
      .select(TASK_SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: "Task not found" });
    }

    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Task manager server running on port ${PORT}`);
});

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const path = require("path");
const express = require("express");
const multer = require("multer");
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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/tasks", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, text, status, attachment_url, created_at")
      .order("id", { ascending: false });

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks", async (req, res, next) => {
  try {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";

    if (!text) {
      return res.status(400).json({ error: "Task text is required" });
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({ text, status: "pending" })
      .select("id, text, status, attachment_url, created_at")
      .single();

    if (error) {
      throw error;
    }

    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/tasks/:id", async (req, res, next) => {
  try {
    const id = parseTaskId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    const { data, error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
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

app.patch("/api/tasks/:id/status", async (req, res, next) => {
  try {
    const id = parseTaskId(req.params.id);
    const status = req.body.status;

    if (!id) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    if (status !== "pending" && status !== "completed") {
      return res.status(400).json({ error: "Invalid task status" });
    }

    const { data, error } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", id)
      .select("id, text, status, attachment_url, created_at")
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

app.post("/api/tasks/:id/attachment", upload.single("file"), async (req, res, next) => {
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
      .select("id, text, status, attachment_url, created_at")
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

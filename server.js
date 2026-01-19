const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI is missing. Add it to your .env file or hosting env vars.");
  process.exit(1);
}

let client;
let productsCollection;

async function connectDB() {
  client = new MongoClient(MONGO_URI);
  await client.connect();

  const db = client.db("shop");
  productsCollection = db.collection("products");

  console.log("✅ Connected to MongoDB: shop.products");
}

//
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "practice11", time: new Date().toISOString() });
});

function ensureDB(req, res, next) {
  if (!productsCollection) {
    return res.status(503).json({ error: "Database not ready yet" });
  }
  next();
}


app.get("/api/products", ensureDB, async (req, res) => {
  try {
    const { category, minPrice, sort, fields } = req.query;

    //filter
    const filter = {};
    if (category) filter.category = category;

    if (minPrice !== undefined) {
      const min = Number(minPrice);
      if (Number.isNaN(min)) {
        return res.status(400).json({ error: "minPrice must be a number" });
      }
      filter.price = { $gte: min };
    }

    let projection;
    if (fields) {
      projection = {};
      const selectedFields = String(fields)
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);

      for (const f of selectedFields) projection[f] = 1;

      if (!selectedFields.includes("_id")) projection._id = 0;
    }

    //sort
    let sortObj;
    if (sort === "price") sortObj = { price: 1 };

    let cursor = productsCollection.find(filter);
    if (projection) cursor = cursor.project(projection);
    if (sortObj) cursor = cursor.sort(sortObj);

    const result = await cursor.toArray();
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//get+
app.get("/api/products/:id", ensureDB, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const product = await productsCollection.findOne({ _id: new ObjectId(id) });
    if (!product) return res.status(404).json({ error: "Not found" });

    res.json(product);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//post+
app.post("/api/products", ensureDB, async (req, res) => {
  try {
    const { name, category, price, stock } = req.body;

    if (!name || !category || typeof price !== "number") {
      return res.status(400).json({
        error: "Validation error",
        details: "name and category required; price must be a number",
      });
    }

    const doc = {
      name,
      category,
      price,
      stock: typeof stock === "number" ? stock : 0,
      createdAt: new Date(),
    };

    const result = await productsCollection.insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//put+
app.put("/api/products/:id", ensureDB, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const allowed = ["name", "category", "price", "stock"];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    if (updates.price !== undefined && typeof updates.price !== "number") {
      return res.status(400).json({ error: "price must be a number" });
    }
    if (updates.stock !== undefined && typeof updates.stock !== "number") {
      return res.status(400).json({ error: "stock must be a number" });
    }

    const result = await productsCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates, $currentDate: { updatedAt: true } },
      { returnDocument: "after" }
    );

    if (!result.value) return res.status(404).json({ error: "Not found" });
    res.json(result.value);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//delete+
app.delete("/api/products/:id", ensureDB, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });

    res.json({ deleted: true, id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error(" DB connection error:", err.message);
    process.exit(1);
  });

process.on("SIGINT", async () => {
  try {
    if (client) await client.close();
  } finally {
    process.exit(0);
  }
});

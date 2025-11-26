const express = require("express");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

// cors
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

// Verify JWT with proper signature validation
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    console.log("Missing Authorization header");
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    console.log("No token after split");
    return res.status(401).json({ message: "Invalid Authorization format" });
  }

  try {
    // Verify the token with secret
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
    console.log("Token verified for user:", decoded.email);
    req.user = decoded;
    next();
  } catch (err) {
    console.log("Token verification failed:", err.message);
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    return res.status(403).json({ message: "Invalid token" });
  }
}

const uri = process.env.mongodb_uri;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10,
  minPoolSize: 0,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  serverSelectionTimeoutMS: 10000,
});

let categoriesDB;
let postsDB;
let categoriesCollection;
let postsCollection;

async function connectDB() {
  if (!categoriesDB) {
    await client.connect();
    categoriesDB = client.db("categoriesDB");
    postsDB = client.db("postsDB");
    categoriesCollection = categoriesDB.collection("categories");
    postsCollection = postsDB.collection("posts");
    console.log("Connected to MongoDB!");
  }
  return { categoriesCollection, postsCollection };
}

app.get("/", (req, res) => {
  res.send("Smart server is running");
});

// Example protected route
app.get("/api/test", verifyJWT, (req, res) => {
  res.json({
    message: "Protected route access OK",
    user: req.user,
  });
});

// GET all categories
app.get("/api/categories", async (req, res) => {
  try {
    const { categoriesCollection } = await connectDB();
    const categories = await categoriesCollection.find({}).toArray();
    res.json(categories);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching categories", error: error.message });
  }
});

// POST new category
app.post("/api/categories", verifyJWT, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const { categoriesCollection } = await connectDB();

    // Check if category already exists
    const existing = await categoriesCollection.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });

    if (existing) {
      return res.json(existing);
    }

    const result = await categoriesCollection.insertOne({
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      createdAt: new Date(),
    });

    res.status(201).json({ _id: result.insertedId, name });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating category", error: error.message });
  }
});

// GET single category by ID
app.get("/api/categories/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const { categoriesCollection } = await connectDB();
    const category = await categoriesCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json(category);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching category",
      error: error.message,
    });
  }
});

// GET all posts
app.get("/api/posts", async (req, res) => {
  try {
    const { postsCollection } = await connectDB();
    const { limit, author, categoryId } = req.query;
    const parsedLimit = parseInt(limit) || 0;
    let query = {};

    if (categoryId) {
      query.categoryId = new ObjectId(categoryId);
    }
    if (author) {
      query["author.email"] = author;
    }

    const posts = await postsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .toArray();

    res.json(posts);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching posts", error: error.message });
  }
});

// GET all posts of a specific categoryId
app.get("/api/posts/category/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!ObjectId.isValid(categoryId)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const { postsCollection } = await connectDB();

    const posts = await postsCollection
      .find({ categoryId: new ObjectId(categoryId) })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(posts);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching posts by category",
      error: error.message,
    });
  }
});

// GET my posts
app.get("/api/my-posts", verifyJWT, async (req, res) => {
  try {
    const { postsCollection } = await connectDB();
    const userEmail = req.user.email;
    const posts = await postsCollection
      .find({ "author.email": userEmail })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(posts);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching posts", error: error.message });
  }
});

// GET single post by ID
app.get("/api/posts/:id", async (req, res) => {
  try {
    const { postsCollection } = await connectDB();
    const post = await postsCollection.findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.json(post);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching post", error: error.message });
  }
});

// increase views count
app.post("/api/posts/:id/view", async (req, res) => {
  const { id } = req.params;
  const { postsCollection } = await connectDB();

  try {
    // increment
    const result = await postsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $inc: { views: 1 } }
    );
    if (result.modifiedCount === 1) {
      const updated = await postsCollection.findOne({ _id: new ObjectId(id) });
      res.json({ success: true, views: updated.views });
    } else {
      res.status(404).json({ success: false, message: "Post not found" });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST new post
app.post("/api/posts", verifyJWT, async (req, res) => {
  try {
    const { title, content, category, categoryId, imageUrl, author } = req.body;

    if (!title || !content || !category) {
      return res
        .status(400)
        .json({ message: "Title, content, and category are required" });
    }

    const { postsCollection } = await connectDB();

    const newPost = {
      title,
      slug: title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      content,
      category,
      categoryId: new ObjectId(categoryId),
      imageUrl: imageUrl || "",
      author,
      createdAt: new Date(),
      updatedAt: new Date(),
      views: 0,
    };

    const result = await postsCollection.insertOne(newPost);
    res.status(201).json({ _id: result.insertedId, ...newPost });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating post", error: error.message });
  }
});

// Update a post
app.put("/api/posts/:id", verifyJWT, async (req, res) => {
  try {
    const postId = req.params.id;
    const { title, content, category, categoryId, imageUrl } = req.body;

    if (!ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post ID" });
    }

    if (!title || !content || !category) {
      return res
        .status(400)
        .json({ message: "Title, content, and category are required" });
    }

    const { postsCollection } = await connectDB();

    // Find the post
    const post = await postsCollection.findOne({ _id: new ObjectId(postId) });
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Verify author
    if (post.author.email !== req.user.email) {
      return res
        .status(403)
        .json({ message: "You are not the author of this post" });
    }

    const updatedPost = {
      title,
      slug: title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      content,
      category,
      categoryId: new ObjectId(categoryId),
      imageUrl: imageUrl || "",
      updatedAt: new Date(),
    };

    const result = await postsCollection.findOneAndUpdate(
      { _id: new ObjectId(postId) },
      { $set: updatedPost },
      { returnDocument: "after" }
    );

    res.json({ message: "Post updated successfully", post: result.value });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating post", error: error.message });
  }
});

// Delete a post and category if no other posts exist
app.delete("/api/posts/:id", verifyJWT, async (req, res) => {
  try {
    const postId = req.params.id;

    if (!ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post ID" });
    }

    const { postsCollection, categoriesCollection } = await connectDB();

    // Find the post
    const post = await postsCollection.findOne({ _id: new ObjectId(postId) });
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Verify author
    if (post.author.email !== req.user.email) {
      return res
        .status(403)
        .json({ message: "You are not the author of this post" });
    }

    // Delete the post
    await postsCollection.deleteOne({ _id: new ObjectId(postId) });

    // Check remaining posts in the same category
    const remainingPosts = await postsCollection.countDocuments({
      categoryId: post.categoryId,
    });

    // Delete category if no posts remain
    if (remainingPosts === 0) {
      await categoriesCollection.deleteOne({ _id: post.categoryId });
      console.log(`Category ${post.categoryId} deleted (no remaining posts)`);
    }

    res.json({
      message: "Post deleted successfully",
      categoryDeleted: remainingPosts === 0,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting post", error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

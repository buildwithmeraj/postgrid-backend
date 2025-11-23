const express = require("express");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

// ------------------------
// INLINE MIDDLEWARE HERE
// ------------------------
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Invalid Authorization format" });
  }

  try {
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
    req.user = decoded; // attach user data
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}
// ------------------------
// END OF INLINE MIDDLEWARE
// ------------------------

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
let codesDB;
let categoriesCollection;
let codesCollection;

async function connectDB() {
  if (!categoriesDB) {
    await client.connect();
    categoriesDB = client.db("categoriesDB");
    codesDB = client.db("categoriesDB");
    categoriesCollection = categoriesDB.collection("categories");
    codesCollection = codesDB.collection("codes");
    console.log("Connected to MongoDB!");
  }
  return { categoriesCollection, codesCollection };
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const express = require("express");
const app = express();
var cors = require("cors");

app.use(cors());

const port = process.env.PORT || 4000;
app.get("/", (req, res) => {
  res.send("Hello from backend!");
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

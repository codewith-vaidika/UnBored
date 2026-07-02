const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const ejsMate = require("ejs-mate");


const MONGO_URL = "mongodb://127.0.0.1:27017/unbored";

main()
  .then(() => {
    console.log("connected to DB");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect(MONGO_URL);
}

app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req,res)=>{
    res.render("home");
});

app.get("/dashboard",(req,res)=>{
    res.render("dashboard");
});

app.get("/saved",(req,res)=>{
    res.render("saved");
});

app.get("/login",(req,res)=>{
    res.render("users/login");
});

app.get("/signup",(req,res)=>{
    res.render("users/signup");
});

app.listen(8080, () => {
  console.log("server is listening to port 8080");
});
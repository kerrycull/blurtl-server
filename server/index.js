const express = require("express");
const app = express();
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");
require("dotenv").config({ path: "./config.env" });
const port = process.env.PORT;
app.use(cors());
app.use(express.json());
app.use(require("./routes/record"));
const { MongoClient } = require("mongodb");

const url =
  "mongodb+srv://k2:1234@cluster0.btpzlek.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(url);
const dbName = "blurtl";
const collectionName = "posts";

async function fetchAndSaveNewPosts(db) {
  console.log("Fetching new posts from API...");
  try {
    const response = await axios.get(
      "https://cryptonews-api.com/api/v1/category?section=general&items=50&extra-fields=id&page=1&token=5ouww0nypihcbvkubvklapfqvqwh4d3ibeniydyv"
    );
    const newPosts = response.data.data;

    const collection = db.collection(collectionName);

    // loop through new posts and add to database if id doesn't already exist
    for (let i = 0; i < newPosts.length; i++) {
      const post = newPosts[i];
      const existingPost = await collection.findOne({ news_id: post.news_id });
      if (!existingPost) {
        const result = await collection.insertOne({
          news_id: post.news_id,
          title: post.title,
          text: post.text,
          url: post.news_url,
          upvotes: 0,
          downvotes: 0,
          date: post.date,
        });
        console.log(`Inserted new post with id ${post.news_id}`);
      }
    }
  } catch (error) {
    console.log("Error fetching new posts:", error);
  }
}

async function startFetchingNewPosts(db) {
  await fetchAndSaveNewPosts(db);

  // Call the 'fetchNewPosts' function every 3 minutes
  setInterval(async () => {
    await fetchAndSaveNewPosts(db);
  }, 3 * 60 * 1000);
}

async function startServer() {
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas");

    const db = client.db(dbName);
    console.log(`Using database '${dbName}'`);

    startFetchingNewPosts(db);

    app.get("/api/data", async (req, res) => {
      const collection = db.collection(collectionName);
      const posts = await collection
        .find({})
        .sort({ news_id: -1 })
        .limit(10)
        .toArray();
      res.json(posts);
    });

    app.get("/api/data/top", async (req, res) => {
      const collection = db.collection(collectionName);
      const posts = await collection
        .find({})
        .sort({ upvotes: -1 })
        .limit(10)
        .toArray();
      res.json(posts);
    });

    app.get("/api/data/:news_id/upvote", async (req, res) => {
      const news_id = req.params.news_id;
      const collection = db.collection(collectionName);

      //console.log(req.params.news_id);

      // Find the post with the given news_id and increment its upvotes by 1
      const result = await collection.updateOne(
        { news_id: parseInt(req.params.news_id) },
        { $inc: { upvotes: 1 } }
      );

      console.log(`Matched ${result.matchedCount} documents`);
      console.log(`Modified ${result.modifiedCount} documents`);

      res.send(`Post ${news_id} upvoted successfully`);
    });

    app.get("/api/data/:news_id/downvote", async (req, res) => {
      const news_id = req.params.news_id;
      const collection = db.collection(collectionName);

      // Find the post with the given news_id and increment its upvotes by 1
      const result = await collection.updateOne(
        { news_id: parseInt(req.params.news_id) },
        { $inc: { upvotes: -1 } }
      );

      console.log(`Matched ${result.matchedCount} documents`);
      console.log(`Modified ${result.modifiedCount} documents`);

      res.send(`Post ${news_id} upvoted successfully`);
    });

    app.listen(port, () => {
      console.log(`Server is running on port: ${port}`);
    });
  } catch (error) {
    console.log("Error connecting to MongoDB Atlas:", error);
  }
}

startServer();

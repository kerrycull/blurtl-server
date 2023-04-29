const express = require("express");
const app = express();
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");
require("dotenv").config({ path: "./config.env" });
const port = process.env.PORT || 4000;
app.use(cors());
app.use(express.json());
app.use(require("./routes/record"));
const { MongoClient } = require("mongodb");

// test

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
          date: new Date(),
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
        .limit(1000)
        .toArray();
      res.json(posts);
    });

    app.get("/api/data/top", async (req, res) => {
      const collection = db.collection(collectionName);
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3); // set the date to 3 days ago
      const posts = await collection
        .find({ date: { $gte: threeDaysAgo } }) // filter for posts with date greater than or equal to three days ago
        .sort({ upvotes: -1 })
        .limit(10)
        .toArray();
      res.json(posts);
    });

    app.get("/api/data/rising", async (req, res) => {
      const collection = db.collection(collectionName);
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1); // set the date to 1 day ago
      const posts = await collection
        .find({ date: { $gte: oneDayAgo } }) // filter for posts with date greater than or equal to 1 day ago
        .sort({ upvotes: -1 })
        .limit(10)
        .toArray();
      res.json(posts);
    });
    
    const lastUpvoteTime = new Map(); 

    app.post("/api/data/:news_id/upvote", async (req, res) => {
      const news_id = req.params.news_id;
      const user_id = req.body.user_id;
      const collection = db.collection(collectionName);
      const votesCollection = db.collection("votes");

      // check if the user has made an upvote within the last 2 seconds
      if (lastUpvoteTime.has(user_id)) {
        const lastTime = lastUpvoteTime.get(user_id);
        const currentTime = new Date().getTime();
        const timeDiff = currentTime - lastTime;

      if (timeDiff < 2000) { // return an error response if the user made an upvote within the last 2 seconds
          return res.status(429).send("Please wait 2 seconds before upvoting again.");
        }
      }

      // update the last upvote time for the user
      lastUpvoteTime.set(user_id, new Date().getTime());

      // Find the post with the given news_id and increment its upvotes by 1
      const find = await votesCollection.findOne({ news_id: parseInt(req.params.news_id), user_id: user_id});

      if (!find) {
        try {
          console.log("not found");
          const result = await collection.updateOne(
            { news_id: parseInt(req.params.news_id) },
            { $inc: { upvotes: 1 } }
          );
          const result2 = await votesCollection.insertOne({
            news_id: parseInt(req.params.news_id),
            user_id: user_id,
            vote: "upvote",
          });
        } catch (error) {
          console.log(error);
        }
        res.send(`upvote`);
      }

      if (find && find.vote === "downvote") {
        console.log("downvote")
        const result = await collection.updateOne(
          { news_id: parseInt(req.params.news_id) },
          { $inc: { upvotes: 1 } }
        );
        const result2 = await votesCollection.updateOne(
          { news_id: parseInt(req.params.news_id),
            user_id: user_id, },
          { $set: { vote: "none" } }
        );
        res.send(`upvote2`);
      }

      if (find && find.vote === "none") {
        console.log("none")
        const result = await collection.updateOne(
          { news_id: parseInt(req.params.news_id) },
          { $inc: { upvotes: 1 } }
        );
        const result2 = await votesCollection.updateOne(
          { news_id: parseInt(req.params.news_id),
            user_id: user_id, },
          { $set: { vote: "upvote" } }
        );
        res.send(`upvote`);
      }

      if (find && find.vote === "upvote") {
        res.send(`none`);
        console.log("no vote needed");
      }
      
    });

    const lastDownvoteTime = new Map(); 

    app.post("/api/data/:news_id/downvote", async (req, res) => {
      const news_id = req.params.news_id;
      const user_id = req.body.user_id;
      const collection = db.collection(collectionName);
      const votesCollection = db.collection("votes");



      // check if the user has made an upvote within the last 2 seconds
      if (lastDownvoteTime.has(user_id)) {
        const lastTime = lastDownvoteTime.get(user_id);
        const currentTime = new Date().getTime();
        const timeDiff = currentTime - lastTime;

      if (timeDiff < 2000) { // return an error response if the user made an downvote within the last 2 seconds
          return res.status(429).send("Please wait 2 seconds before downvoting again.");
        }
      }

      // downvote the last upvote time for the user
      lastDownvoteTime.set(user_id, new Date().getTime());

      // Find the post with the given news_id and increment its upvotes by 1
      const find = await votesCollection.findOne({ news_id: parseInt(req.params.news_id), user_id: user_id});

      if (!find) {
        try {
          console.log("not found");
          const result = await collection.updateOne(
            { news_id: parseInt(req.params.news_id) },
            { $inc: { downvotes: 1 } }
          );
          const result2 = await votesCollection.insertOne({
            news_id: parseInt(req.params.news_id),
            user_id: user_id,
            vote: "downvote",
          });
        } catch (error) {
          console.log(error);
        }
        res.send(`downvote`);
      }

      if (find && find.vote === "upvote") {
        console.log("upvote")
        const result = await collection.updateOne(
          { news_id: parseInt(req.params.news_id) },
          { $inc: { downvotes: 1 } }
        );
        const result2 = await votesCollection.updateOne(
          { news_id: parseInt(req.params.news_id),
            user_id: user_id, },
          { $set: { vote: "none" } }
        );
        res.send(`downvote2`);
      }

      if (find && find.vote === "none") {
        console.log("none")
        const result = await collection.updateOne(
          { news_id: parseInt(req.params.news_id) },
          { $inc: { downvotes: 1 } }
        );
        const result2 = await votesCollection.updateOne(
          { news_id: parseInt(req.params.news_id),
            user_id: user_id, },
          { $set: { vote: "downvote" } }
        );
        res.send(`downvote`);
      }

      if (find && find.vote === "downvote") {
        console.log("no vote needed");
        res.send(`none`);
      }
    });

    app.listen(port, () => {
      console.log(`Server is running on port: ${port}`);
    });
  } catch (error) {
    console.log("Error connecting to MongoDB Atlas:", error);
  }
}

startServer();
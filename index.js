require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
console.log(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5005;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zk5tb.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    const partCollection = client.db("manufacturer").collection("parts");
    const orderCollection = client.db("manufacturer").collection("orders");
    const reviewCollection = client.db("manufacturer").collection("reviews");
    const userCollection = client.db("manufacturer").collection("users");
    const paymentCollection = client.db("manufacturer").collection("payments");
    const profileCollection = client.db("manufacturer").collection("profile");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requestCount = await userCollection.findOne({ email: requester });
      if (requestCount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "Forbidden" });
      }
    };

    app.get("/parts", async (req, res) => {
      const query = {};
      const cursor = partCollection.find(query);
      const parts = await cursor.toArray();
      res.send(parts);
    });

    app.get("/reviews", async (req, res) => {
      const query = {};
      const cursor = reviewCollection.find(query);
      const reviews = await cursor.toArray();
      res.send(reviews);
    });

    app.get("/parts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const manufactures = await partCollection.findOne(query);
      res.send(manufactures);
    });

    app.get("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const manufacturers = await orderCollection.findOne(query);
      res.send(manufacturers);
    });

    app.get("/users", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get("/orders", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const email = req.query.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const cursor = orderCollection.find(query);
        const myOrders = await cursor.toArray();
        res.send(myOrders);
      } else {
        res.status(403).send({ message: "Forbidden access" });
      }
    });

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.patch("/orders/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const result = await paymentCollection.insertOne(payment);
      const updateOrder = await orderCollection.updateOne(filter, updateDoc);
      res.send({ updateDoc });
    });

    app.put("/profile", async (req, res) => {
      const id = req.params.id;
      const profile = req.body;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          education: profile.education,
          location: profile.location,
          phoneNumber: profile.phoneNumber,
          profileLink: profile.profileLink,
        },
      };
      const result = await profileCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const parts = req.body;
      const price = parts.price;
      console.log(price);
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      //   console.log(clientSecret);
      res.send({ clientSecret: paymentIntent?.client_secret });
    });

    app.post("/parts", async (req, res) => {
      const parts = req.body;
      const result = await partCollection.insertOne(parts);
      res.send(result);
    });
    app.post("/profile", async (req, res) => {
      const profile = req.body;
      const result = await profileCollection.insertOne(profile);
      res.send(result);
    });

    app.post("/orders", async (req, res) => {
      const myOrder = req.body;
      const result = await orderCollection.insertOne(myOrder);
      res.send(result);
    });

    app.post("/reviews", async (req, res) => {
      const addReviews = req.body;
      const result = await reviewCollection.insertOne(addReviews);
      res.send(result);
    });

    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;

      const filter = { email: email };

      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);

      res.send(result);
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );
      res.send({ result, token });
    });

    app.delete("/parts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await partCollection.deleteOne(query);
      res.send(result);
    });

    app.delete("/orders/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await orderCollection.deleteOne(filter);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Manufacturer Website server");
});
app.listen(port, () => {
  console.log(`Manufacturer website running on ${port}`);
});

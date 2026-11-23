import mongoose from 'mongoose';
import { MongoClient, ServerApiVersion } from 'mongodb';

const mongoose_uri = process.env.MONGODB_URI as string;


export async function connect_to_mongodb() {
  // already connected (every request, and the reminder timer, calls this)
  if (mongoose.connection.readyState === 1) return;
  try {
    // Connect the client to the server	(optional starting in v4.7)
   await mongoose.connect(mongoose_uri);
    // Send a ping to confirm a successful connection
    mongoose.connection.db?.command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}


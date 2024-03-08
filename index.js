const express = require('express');
const app = express();
const cors = require('cors'); 
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;



app.use(cors()); 
app.use(express.json());


console.log();



const uri = `mongodb+srv://${process.env.db_user}:${process.env.password}@cluster0.jip67yo.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();


    const doctorsCollection = client.db('docHouse').collection('doctors');
    const servicesCollection = client.db('docHouse').collection('services');
    const usersCollection = client.db('docHouse').collection('users');
    const appointmentsCollection = client.db('docHouse').collection('appointments');
    const paymentCollection = client.db('docHouse').collection('payments');



    // JWT Api
    app.post('/jwt', async(req, res) =>{
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h' });
        res.send({ token });
    });

    // Middle Wares
    const verifyToken = (req, res, next) => {
        console.log('inside verify token', req.headers.authorization);
        if (!req.headers.authorization) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        const token = req.headers.authorization.split(' ')[1];
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
          if (err) {
            return res.status(401).send({ message: 'unauthorized access' })
          }
          req.decoded = decoded;
          next();
        })
    }

    const verifyAdmin = async(req, res, next) =>{
        const email = req.decoded.email;
        const query = {email: email};
        const user = await usersCollection.findOne(query);
  
        const isAdmin = user?.role === 'admin';
  
        if(!isAdmin){
          return res.status(403).send({message: 'Forbidden access'});
        }
        next();
  
  
    }





    // Users related API
    app.post("/users", async(req, res) =>{
        const user =  req.body;

        const query = { email: user.email };
        const existingUser = await usersCollection.findOne(query);
        if(existingUser){
            return res.send({message: "User Already Exists", insertedId: null});
        }

        const result = await usersCollection.insertOne(user);
        res.send(result);

        // Extract the inserted document's _id
        const insertedId = result.insertedId;

        // Update the user document with the photo URL
        await usersCollection.updateOne(
        { _id: insertedId },
        { $set: { photo: user.photo } }
        );
        console.log(user);
    })


    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
        
        const result = await usersCollection.find().toArray();
        res.send(result);
    });

    
    app.get('/users/admin/:email', verifyToken, async(req, res) =>{
        const email = req.params.email;
  
        if(!email === req.decoded.email){
          return res.status(403).send({ message: "Forbidden access" });
        }
        const query = {email: email};
        const user =  await usersCollection.findOne(query);
  
        let admin = false;
        if(user){
          admin = user?.role === 'admin';
        }
        res.send({ admin })
        
    });



    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async(req, res) =>{
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
            $set: {
                role: 'admin'
            }
        }
        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);

    })
   

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await usersCollection.deleteOne(query);
        res.send(result);
    });



    app.post('/doctors',verifyToken, verifyAdmin, async (req,res) =>{
        const item = req.body;
        const result = await doctorsCollection.insertOne(item);
        res.send(result);
    });



    // Doctor API
    app.get('/doctors', async(req, res) =>{
        const cursor = doctorsCollection.find();
        const doctorsItem = await cursor.toArray([]);
        res.send(doctorsItem);
    });


    app.delete('/doctors/:id', verifyToken, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await doctorsCollection.deleteOne(query);
        res.send(result);
    });



    // Services API
    app.get('/services', async(req, res) =>{
        const cursor = servicesCollection.find();
        const doctorsItem = await cursor.toArray([]);
        res.send(doctorsItem);
    });



    // Appointment API
    //Post
    app.post('/appointments', async(req, res) =>{
        const appointmentData = req.body;
        console.log('Received appointment data:', appointmentData);
        
        try {
            // Check if the appointment already exists for the user and service
            const existingAppointment = await appointmentsCollection.findOne({ email: appointmentData.email, service_name: appointmentData.service_name });
            if(existingAppointment){
                console.log('Appointment already exists:', existingAppointment);
                return res.status(400).json({ message: "Appointment for this service already exists" });
            }
        
            const result = await appointmentsCollection.insertOne(appointmentData);
            console.log('New appointment created:', result);
            res.status(201).json({ message: "Appointment booked successfully" });
        } catch (error) {
            console.error("Error creating appointment:", error);
            res.status(500).json({ message: "Internal server error" });
        }
    });


    //Get
    app.get('/appointments/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await appointmentsCollection.findOne(query);
        res.send(result);
    });
  
      
    // Get Incomes
    app.get('/appointments', async (req, res) => {
        const email = req.query.email;
        const query = { email: email };
        const result = await appointmentsCollection.find(query).toArray();
        res.send(result);
    });


    app.delete('/appointments/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await appointmentsCollection.deleteOne(query);
        res.send(result);
    });


    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
        const { price } = req.body;
        const amount = parseInt(price * 100);
        console.log(amount, 'amount inside the intent');
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card']
        });
  
        res.send({
          clientSecret: paymentIntent.client_secret
        })
    });


    // Payment Related Api
    app.post('/payments', async (req, res) => {
        const payment = req.body;
        const paymentResult = await paymentCollection.insertOne(payment);
  
        //  carefully delete each item from the cart
        console.log('payment info', payment);
        const query = {
          _id: {
            $in: payment.appointmentID.map(id => new ObjectId(id))
          }
        };
  
        const deleteResult = await appointmentsCollection.deleteMany(query);
  
        res.send({ paymentResult, deleteResult });
    });

    app.get('/payments', async (req, res) => {
        const email = req.query.email;
        const query = { email: email };
        const result = await paymentCollection.find(query).toArray();
        res.send(result);
    });


    app.delete('/payments/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await paymentCollection.deleteOne(query);
        res.send(result);
    });


    //stats
    app.get('/admin-stats', verifyToken, verifyAdmin, async(req, res) => {
        const patients = await usersCollection.estimatedDocumentCount();
        const doctors = await doctorsCollection.estimatedDocumentCount();
        const appointments = await appointmentsCollection.estimatedDocumentCount();

         const result = await paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

        res.send({
            patients,
            doctors,
            appointments,
            revenue
        })
    })


    


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) =>{
    res.send("Doc House Project is Running");
})

app.listen(port, () =>{
    console.log(`Doc House is running on port: ${port}`);
})
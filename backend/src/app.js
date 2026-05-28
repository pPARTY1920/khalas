const express = require('express')
const cors = require('cors')
const app = express()

app.use(cors({
  origin: 'http://localhost:5500',  // exactly where your frontend runs
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json())

app.use('/auth', require('./routes/auth'))
app.use('/user', require('./routes/user'))

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

module.exports = app

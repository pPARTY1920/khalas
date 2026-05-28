const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

// in-memory store for now, we'll replace with a real DB later
const users = []

async function register(req, res) {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  const existing = users.find(u => u.email === email)
  if (existing) {
    return res.status(409).json({ error: 'User already exists' })
  }

  // bcrypt work factor of 10 means 2^10 = 1024 rounds of hashing
  const hash = await bcrypt.hash(password, 10)

  const user = { id: Date.now(), email, password: hash }
  users.push(user)

  res.status(201).json({ message: 'User created', id: user.id })
}

async function login(req, res) {
  const { email, password } = req.body

  const user = users.find(u => u.email === email)
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  // bcrypt.compare hashes the input and compares it to the stored hash
  // it never decrypts — bcrypt is one-way
  const match = await bcrypt.compare(password, user.password)
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  // sign a JWT with the user's id as payload
  // the token expires in 24 hours
  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  )

  res.json({ token })
}

module.exports = { register, login }

const router = require('express').Router()
const authenticate = require('../middleware/auth')

router.get('/me', authenticate, (req, res) => {
  res.json({ message: 'You are authenticated', userId: req.userId })
})

module.exports = router

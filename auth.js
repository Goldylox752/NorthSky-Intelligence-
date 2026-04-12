const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const router = express.Router();

const users = new Map();

router.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  const hash = await bcrypt.hash(password, 10);

  const user = {
    id: Date.now().toString(),
    email,
    password: hash,
    plan: "free",
    used: 0
  };

  users.set(user.id, user);

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

  res.json({ token });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = [...users.values()].find(u => u.email === email);
  if (!user) return res.json({ error: "not_found" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.json({ error: "invalid_password" });

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

  res.json({ token });
});

module.exports = router;
const API_KEY = process.env.API_KEY;

const authenticate = (req, res) => {
  const userKey = req.headers['x-api-key'];

  if (!userKey || userKey !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
};

module.exports = authenticate;

// GET /v1/health — Health check endpoint
module.exports = function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    engine: 'mirador_universe',
    version: '0.2',
    endpoints: ['/v1/ask', '/v1/query', '/v1/schema', '/v1/health'],
  });
};

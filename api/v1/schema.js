// GET /v1/schema — API schema for AI agent discovery
module.exports = function handler(req, res) {
  res.status(200).json({
    openapi: '3.0.0',
    info: { title: 'MIRADOR GQL API', version: '0.2', description: 'Geometric pharmacology query engine. Translates natural language clinical questions into GQL (Geometric Query Language) and executes them against the MIRADOR universe — a fiber-bundle database of drug-pathogen-tissue coherence.' },
    servers: [{ url: 'https://mirador-six.vercel.app', description: 'Production' }],
    paths: {
      '/v1/ask': {
        post: {
          summary: 'Natural language → GQL translation',
          description: 'Submit a plain-text clinical question. Returns the classified intent, extracted entities, and generated GQL statement.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['question'], properties: {
            question: { type: 'string', example: 'Can vancomycin reach MRSA in bone?' },
            context: { type: 'object', properties: { patient: { type: 'object' } } },
          }}}}},
          responses: { 200: { description: 'Translation result', content: { 'application/json': { schema: { type: 'object', properties: {
            status: { type: 'string', enum: ['ok', 'clarification_needed', 'error'] },
            intent: { type: 'string', enum: ['single_drug_check', 'drug_ranking', 'combination_query', 'failure_diagnosis', 'comparison', 'data_quality', 'cure_feasibility'] },
            entities: { type: 'object', properties: { drugs: { type: 'array', items: { type: 'string' } }, diseases: { type: 'array', items: { type: 'string' } }, tissues: { type: 'array', items: { type: 'string' } } }},
            generated_gql: { type: 'string' },
          }}}}}},
        },
      },
      '/v1/query': {
        post: {
          summary: 'Execute GQL query',
          description: 'Execute a GQL statement against the GIGI engine. Proxied to gigi-stream.fly.dev.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: {
            query: { type: 'string', example: "COVER ON mirador_universe WHERE disease = 'mrsa' AND tissue = 'bone' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE" },
          }}}}},
          responses: { 200: { description: 'Query results' }, 503: { description: 'GIGI server unavailable' } },
        },
      },
      '/v1/health': { get: { summary: 'Health check', responses: { 200: { description: 'Service status' } } } },
      '/v1/schema': { get: { summary: 'OpenAPI schema', responses: { 200: { description: 'This schema document' } } } },
    },
    components: {
      schemas: {
        Drug: { type: 'string', enum: ['VAN','RIF','LZD','CRO','DAP','CAR','CLI','DTG','TFV','FTC','DRV','EFV','INH','PZA','EMB','MXF','BDQ'] },
        Disease: { type: 'string', enum: ['mrsa','tb','hiv','meningitis'] },
        Tissue: { type: 'string', enum: ['bone','planktonic','csf_inflamed','csf_uninflamed','cns','lymph_node','galt','genital_tract','bone_marrow','granuloma_lung','granuloma_cellular','granuloma_necrotic','granuloma_cavity'] },
      },
    },
  });
};

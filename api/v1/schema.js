// GET /v1/schema — API schema for AI agent discovery
module.exports = function handler(req, res) {
  res.status(200).json({
    openapi: '3.0.0',
    info: { title: 'MIRADOR GQL API', version: '1.0', description: 'Geometric pharmacology query engine. Translates natural language clinical questions into GQL (Geometric Query Language) and executes them against the MIRADOR universe — a fiber-bundle database of drug-pathogen-tissue coherence. v1.0 adds disease-specific thresholds, patient context adjustment, LLM fallback (Claude/Gemini), DHOOM wire format, and COMPLETE/PROPAGATE verbs.' },
    servers: [{ url: 'https://usemirador.sh', description: 'Production' }],
    paths: {
      '/v1/ask': {
        get: {
          summary: 'Natural language → GQL (GET — for AI agents)',
          description: 'Query-string version for tools that can only fetch URLs (e.g. Claude web_fetch). Same pipeline as POST.',
          parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Plain-text clinical question', example: 'Can vancomycin reach MRSA in bone?' }],
          responses: { 200: { description: 'Translation result' } },
        },
        post: {
          summary: 'Natural language → GQL translation (with LLM fallback)',
          description: 'Submit a plain-text clinical question. Returns the classified intent, extracted entities, and generated GQL statement. If regex parsing fails, falls back to Claude then Gemini for translation.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['question'], properties: {
            question: { type: 'string', example: 'Can vancomycin reach MRSA in bone?' },
            patient: { type: 'object', description: 'Optional patient context for coherence adjustment', properties: {
              crp: { type: 'number', description: 'C-reactive protein (mg/L)' },
              chronicity: { type: 'string', enum: ['acute', 'chronic'], description: 'Infection chronicity — acute halves MBEC factor' },
            }},
            session_id: { type: 'string', description: 'Optional session identifier for conversation continuity' },
          }}}}},
          responses: { 200: { description: 'Translation result', content: { 'application/json': { schema: { type: 'object', properties: {
            status: { type: 'string', enum: ['ok', 'clarification_needed', 'error'] },
            intent: { type: 'string', enum: ['single_drug_check', 'drug_ranking', 'combination_query', 'failure_diagnosis', 'comparison', 'data_quality', 'cure_feasibility', 'predict_unmeasured', 'cascade_analysis'] },
            entities: { type: 'object', properties: { drugs: { type: 'array', items: { type: 'string' } }, diseases: { type: 'array', items: { type: 'string' } }, tissues: { type: 'array', items: { type: 'string' } } }},
            generated_gql: { type: 'string' },
            source: { type: 'string', enum: ['regex', 'claude', 'gemini'], description: 'Which engine produced the translation' },
            version: { type: 'string', example: '1.0' },
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
        Drug: { type: 'string', enum: ['VAN','RIF','LZD','CRO','DAP','CAR','CLI','DTG','TFV','FTC','DRV','EFV','INH','PZA','EMB','MXF','BDQ','TDZ'] },
        Disease: { type: 'string', enum: ['mrsa','tb','hiv','meningitis'] },
        Tissue: { type: 'string', enum: ['bone','planktonic','csf_inflamed','csf_uninflamed','cns','lymph_node','galt','genital_tract','bone_marrow','granuloma_lung','granuloma_cellular','granuloma_necrotic','granuloma_cavity'] },
        DiseaseThreshold: { type: 'object', description: 'Disease-specific coherence thresholds (θ)', properties: {
          mrsa: { type: 'number', example: 5.0 },
          tb: { type: 'number', example: 0.50 },
          meningitis: { type: 'number', example: 0.50 },
          hiv: { type: 'number', example: 1.0 },
        }},
        PatientContext: { type: 'object', description: 'Patient parameters that adjust coherence computation', properties: {
          crp: { type: 'number', description: 'CRP in mg/L — inflammation factor = min(crp/10, 2.0)' },
          chronicity: { type: 'string', enum: ['acute', 'chronic'], description: 'Acute halves MBEC_factor in K computation' },
        }},
      },
    },
  });
};

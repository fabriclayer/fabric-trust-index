/**
 * OpenAPI 3.1 Specification for the Fabric Trust Index API
 */

export const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Fabric Trust Index API',
    version: '1.0.0',
    description: 'Automated safety scoring for AI tools and services. Free tier: 1,000 requests per month.',
    contact: { email: 'api@fabriclayer.ai', url: 'https://trust.fabriclayer.ai' },
  },
  servers: [
    { url: 'https://api.fabriclayer.ai', description: 'Production' },
    { url: 'https://trust.fabriclayer.ai/api/v1', description: 'Direct' },
  ],
  security: [{ BearerAuth: [] }],
  paths: {
    '/lookup': {
      get: {
        operationId: 'lookup',
        summary: 'Look up a trust score by slug',
        parameters: [{ name: 'slug', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Trust score result', content: { 'application/json': { schema: { '$ref': '#/components/schemas/LookupResult' } } } },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Service not found' },
          '429': { description: 'Rate limited or quota exceeded' },
        },
      },
    },
    '/services/{slug}': {
      get: {
        operationId: 'getService',
        summary: 'Get full service details',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Full service record' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Service not found' },
        },
      },
    },
    '/public-lookup': {
      get: {
        operationId: 'publicLookup',
        summary: 'Keyless lookup (50/day/IP limit)',
        parameters: [{ name: 'slug', in: 'query', required: true, schema: { type: 'string' } }],
        security: [],
        responses: {
          '200': { description: 'Trust score result with free key URL' },
          '429': { description: 'Daily limit exceeded' },
        },
      },
    },
    '/batch': {
      post: {
        operationId: 'batch',
        summary: 'Batch lookup (Pro/Enterprise)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { slugs: { type: 'array', items: { type: 'string' }, maxItems: 50 } }, required: ['slugs'] } } } },
        responses: {
          '200': { description: 'Array of lookup results' },
          '403': { description: 'Plan does not include batch' },
        },
      },
    },
    '/alerts': {
      get: {
        operationId: 'getAlerts',
        summary: 'Get alerts for a service (Pro/Enterprise)',
        parameters: [
          { name: 'slug', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'days', in: 'query', schema: { type: 'integer', default: 30 } },
        ],
        responses: { '200': { description: 'Incidents and CVE records' } },
      },
    },
    '/usage': {
      get: {
        operationId: 'getUsage',
        summary: 'Get API usage stats for your key',
        responses: { '200': { description: 'Usage statistics' } },
      },
    },
    '/signup': {
      post: {
        operationId: 'signup',
        summary: 'Get a free API key',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string', format: 'email' } }, required: ['email'] } } } },
        responses: { '200': { description: 'Always returns ok:true (no enumeration)' } },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer' },
    },
    schemas: {
      LookupResult: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          name: { type: 'string' },
          score: { type: ['number', 'null'], description: 'Null for unverified services' },
          status: { type: 'string', enum: ['trusted', 'caution', 'blocked', 'unverified'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unverified'] },
          coverage: { type: 'number' },
          signals: {
            type: 'object',
            properties: {
              vulnerability: { type: 'number' },
              operational: { type: 'number' },
              maintenance: { type: 'number' },
              adoption: { type: 'number' },
              transparency: { type: 'number' },
              publisher_trust: { type: 'number' },
            },
          },
          weights: {
            type: 'object',
            properties: {
              vulnerability: { type: 'number' },
              operational: { type: 'number' },
              maintenance: { type: 'number' },
              adoption: { type: 'number' },
              transparency: { type: 'number' },
              publisher_trust: { type: 'number' },
            },
          },
          publisher: { type: 'string' },
          category: { type: 'string' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
}

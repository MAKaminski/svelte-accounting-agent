export const IDENTIFY_PROMPT_VERSION = 'identify.v1';
export const IDENTIFY_KINDS = ['inventory', 'supplies', 'shipping', 'platform', 'software', 'ads', 'transfer', 'personal', 'unknown'] as const;
export const IDENTIFY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['kind', 'summary', 'confidence'],
  properties: { kind: { type: 'string', enum: [...IDENTIFY_KINDS] }, summary: { type: 'string' }, confidence: { type: 'number' } }
} as const;
export const IDENTIFY_SYSTEM = `You identify an unfamiliar merchant on a small e-commerce reseller's card statement.
Classify what the business most likely sells to this reseller: inventory (goods for resale), supplies (packaging/office), shipping (postage, labels, couriers), platform (a sales marketplace), software (subscriptions/SaaS), ads (advertising), transfer (moving money between own accounts), personal (non-business), or unknown.
Use "unknown" with low confidence when you do not recognize the merchant. Never guess a specific company you are not sure of.
summary: one short sentence. confidence: 0 to 1.
Reply with one JSON object matching: ${JSON.stringify(IDENTIFY_JSON_SCHEMA)}`;

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ACTION_SCHEMAS } from './schemas';
import { PROPOSE_TOOL_ACTION, READ_TOOLS, TOOL_DEFINITIONS, TOOL_LABELS } from './tools';

type Schema = Record<string, unknown>;

/** Every object schema in a JSON schema, depth first. */
function objectSchemas(schema: unknown): Schema[] {
  if (!schema || typeof schema !== 'object') return [];
  const s = schema as Schema;
  const own = s.type === 'object' ? [s] : [];
  const children = [
    ...Object.values((s.properties as Record<string, unknown>) ?? {}),
    ...((s.anyOf as unknown[]) ?? []),
    ...(s.items ? [s.items] : []),
  ];
  return [...own, ...children.flatMap(objectSchemas)];
}

const byName = Object.fromEntries(TOOL_DEFINITIONS.map((t) => [t.name, t]));
const shapeOf = (schema: z.ZodType) =>
  (schema as unknown as z.ZodObject<z.ZodRawShape>).shape as unknown as Record<string, z.ZodType>;

describe('TOOL_DEFINITIONS', () => {
  it('lists the read tools, then the propose tools, in a fixed order', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
      'get_garden_info',
      'list_events',
      'get_event_rsvps',
      'find_members',
      'count_audience',
      'list_recent_emails',
      'propose_calendar_event',
      'propose_event_update',
      'propose_email',
      'propose_announcement',
      'propose_poll',
    ]);
    expect([...READ_TOOLS]).toEqual(TOOL_DEFINITIONS.slice(0, 6).map((t) => t.name));
    expect(PROPOSE_TOOL_ACTION).toEqual({
      propose_calendar_event: 'create_event',
      propose_event_update: 'update_event',
      propose_email: 'send_email',
      propose_announcement: 'post_announcement',
      propose_poll: 'create_poll',
    });
  });

  // The live API rejected all 11 tools as strict ("The compiled grammar is too
  // large…"), and even 10 strict tools took ~22 s per request to compile.
  // Inputs are re-validated with zod instead (strict objects, is_error on failure).
  it('sets no tool strict', () => {
    for (const tool of TOOL_DEFINITIONS) expect(tool, tool.name).not.toHaveProperty('strict');
  });

  it('keeps additionalProperties false, and required fields among the properties, on every object', () => {
    for (const tool of TOOL_DEFINITIONS) {
      for (const obj of objectSchemas(tool.input_schema)) {
        expect(obj.additionalProperties, tool.name).toBe(false);
        const props = Object.keys((obj.properties as Schema) ?? {});
        expect(props, tool.name).toEqual(expect.arrayContaining((obj.required as string[]) ?? []));
      }
    }
  });

  it('explains when to use each tool, and labels each for the chat UI', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect((tool.description ?? '').length, tool.name).toBeGreaterThan(60);
      expect(TOOL_LABELS[tool.name], tool.name).toEqual(expect.any(String));
    }
  });

  it('gives each propose tool its action schema fields plus a required summary', () => {
    for (const [toolName, type] of Object.entries(PROPOSE_TOOL_ACTION)) {
      const schema = byName[toolName].input_schema as Schema;
      const shape = shapeOf(ACTION_SCHEMAS[type]);
      const props = Object.keys(schema.properties as Schema);
      expect(props.sort(), toolName).toEqual([...Object.keys(shape), 'summary'].sort());
      const requiredFields = Object.keys(shape).filter((k) => !shape[k].safeParse(undefined).success);
      expect([...(schema.required as string[])].sort(), toolName).toEqual([...requiredFields, 'summary'].sort());
    }
  });

  it('offers exactly the four member audiences, never a raw-address one', () => {
    for (const toolName of ['count_audience', 'propose_email']) {
      const audience = (byName[toolName].input_schema.properties as Record<string, Schema>).audience;
      const kinds = (audience.anyOf as Schema[]).map((v) => (v.properties as Record<string, Schema>).kind.const);
      expect(kinds, toolName).toEqual(['all_active', 'admins', 'members', 'event_rsvp']);
    }
  });

});

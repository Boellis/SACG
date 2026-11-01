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

/** Every keyword used anywhere in a JSON schema. */
function keywords(schema: unknown): string[] {
  if (Array.isArray(schema)) return schema.flatMap(keywords);
  if (!schema || typeof schema !== 'object') return [];
  return Object.entries(schema as Schema).flatMap(([k, v]) =>
    k === 'properties' ? Object.values(v as Schema).flatMap(keywords) : [k, ...keywords(v)],
  );
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

  it('makes every tool strict, with additionalProperties false on every object', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.strict, tool.name).toBe(true);
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

  // The API compiles strict schemas into a grammar and answers 400 for features
  // it doesn't support or for going over its limits (platform docs, "Structured
  // outputs" → JSON Schema limitations). Scripted test models can't catch that.
  it('stays inside the API limits for strict tools', () => {
    expect(TOOL_DEFINITIONS.length).toBeLessThanOrEqual(20);
    let optional = 0;
    let unions = 0;
    for (const tool of TOOL_DEFINITIONS) {
      for (const obj of objectSchemas(tool.input_schema)) {
        const props = obj.properties as Record<string, Schema>;
        optional += Object.keys(props).filter((k) => !((obj.required as string[]) ?? []).includes(k)).length;
        unions += Object.values(props).filter((p) => p.anyOf || Array.isArray(p.type)).length;
      }
      const unsupported = keywords(tool.input_schema).filter((k) =>
        ['minLength', 'maxLength', 'minimum', 'maximum', 'multipleOf', 'maxItems', 'oneOf', 'not', 'uniqueItems'].includes(
          k,
        ),
      );
      expect(unsupported, tool.name).toEqual([]);
    }
    expect(optional).toBeLessThanOrEqual(24);
    expect(unions).toBeLessThanOrEqual(16);
  });
});
